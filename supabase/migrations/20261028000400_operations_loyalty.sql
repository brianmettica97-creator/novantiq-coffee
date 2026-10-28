-- NOVANTIQ COFFEE · Operaciones (fase 6) y fidelización (fase 7).
--
-- ESTADO: estructura, reglas y permisos listos y probados en SQL; la interfaz
-- de pedidos/comandas/club todavía no existe. Los pedidos los crea la Edge
-- Function `place-order` (service role) después de recalcular precios: el
-- navegador nunca escribe directamente en estas tablas.

/* ------------------------------------------------------- mesas y sesiones */

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_id uuid not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (id, organization_id),
  foreign key (table_id, organization_id) references public.restaurant_tables (id, organization_id)
);
create unique index table_sessions_one_open on public.table_sessions (table_id) where status = 'open';

/* --------------------------------------------------------------- pedidos */

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Usuario de Supabase Auth del cliente (registro voluntario).
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null default '' check (char_length(display_name) <= 60),
  email text check (email is null or char_length(email) <= 254),
  birthday date,
  -- Consentimiento explícito y fechado para comunicaciones.
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id),
  check (not marketing_consent or consent_at is not null)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_id uuid,
  table_session_id uuid,
  customer_id uuid,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'preparing', 'ready', 'delivered', 'cancelled')),
  -- Clave enviada por el cliente: el mismo intento no crea dos pedidos.
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  currency text not null,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  notes text not null default '' check (char_length(notes) <= 300),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (id, organization_id),
  check (total_cents = subtotal_cents - discount_cents),
  foreign key (table_id, organization_id) references public.restaurant_tables (id, organization_id),
  foreign key (table_session_id, organization_id) references public.table_sessions (id, organization_id),
  foreign key (customer_id, organization_id) references public.customers (id, organization_id)
);
create index orders_org_status_idx on public.orders (organization_id, status, created_at desc);

-- Cada ítem guarda una FOTO del producto al momento del pedido (nombre,
-- precio, opciones): cambios posteriores del catálogo no alteran el histórico.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  organization_id uuid not null,
  product_id uuid references public.menu_products (id) on delete set null,
  product_name text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  quantity int not null check (quantity between 1 and 50),
  line_total_cents bigint not null,
  options_snapshot jsonb not null default '[]',
  notes text not null default '' check (char_length(notes) <= 200),
  station text not null default 'barra' check (station in ('barra', 'cocina', 'pasteleria', 'despacho')),
  status text not null default 'pending' check (status in ('pending', 'preparing', 'ready', 'delivered', 'cancelled')),
  check (line_total_cents = unit_price_cents * quantity),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_station_idx on public.order_items (organization_id, station, status);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null,
  organization_id uuid not null,
  from_status text,
  to_status text not null,
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade
);

-- Comandas: una por estación y pedido.
create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null,
  station text not null check (station in ('barra', 'cocina', 'pasteleria', 'despacho')),
  status text not null default 'pending' check (status in ('pending', 'preparing', 'ready', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, station),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade
);

-- Solicitudes desde la mesa. Pedir la cuenta NO es un pago.
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_id uuid not null,
  table_session_id uuid,
  kind text not null check (kind in ('assistance', 'bill')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'closed')),
  created_at timestamptz not null default now(),
  handled_by uuid,
  handled_at timestamptz,
  foreign key (table_id, organization_id) references public.restaurant_tables (id, organization_id)
);
create index service_requests_open_idx on public.service_requests (organization_id, status) where status <> 'closed';

/* ----------------------------------------------------------- fidelización */

create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  name text not null default 'Club de beneficios',
  active boolean not null default false,
  -- Reglas configurables: { "pointsPerCurrencyUnit": 1, "stampsForReward": 9, … }
  rules jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.loyalty_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  program_id uuid not null,
  customer_id uuid not null,
  -- Código del QR de miembro: aleatorio, no derivado de datos personales.
  member_code text not null unique check (member_code ~ '^[a-z0-9]{10,32}$'),
  created_at timestamptz not null default now(),
  unique (program_id, customer_id),
  unique (id, organization_id),
  foreign key (program_id, organization_id) references public.loyalty_programs (id, organization_id) on delete cascade,
  foreign key (customer_id, organization_id) references public.customers (id, organization_id) on delete cascade
);

-- Libro de movimientos inmutable: el saldo es la suma de movimientos.
create table public.loyalty_transactions (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  membership_id uuid not null,
  kind text not null check (kind in ('earn', 'redeem', 'adjust', 'expire')),
  points int not null default 0,
  stamps int not null default 0,
  order_id uuid,
  reason text not null default '' check (char_length(reason) <= 200),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (points <> 0 or stamps <> 0),
  check (kind <> 'earn' or (points >= 0 and stamps >= 0)),
  check (kind <> 'redeem' or (points <= 0 and stamps <= 0)),
  foreign key (membership_id, organization_id) references public.loyalty_memberships (id, organization_id) on delete cascade,
  foreign key (order_id, organization_id) references public.orders (id, organization_id)
);

create or replace function app.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'forbidden: Los movimientos de fidelización no se modifican; registrá un ajuste.';
end $$;
create trigger loyalty_transactions_immutable before update or delete on public.loyalty_transactions
  for each statement execute function app.forbid_mutation();

create view public.loyalty_balances with (security_invoker = true) as
  select membership_id, organization_id, sum(points)::int as points, sum(stamps)::int as stamps
  from public.loyalty_transactions group by membership_id, organization_id;

/* -------------------------------------------------------------- reglas */

-- Transiciones válidas del pedido.
create or replace function app.order_transition_allowed(p_from text, p_to text) returns boolean
language sql immutable as $$
  select (p_from, p_to) in (
    ('pending', 'accepted'), ('pending', 'rejected'), ('pending', 'cancelled'),
    ('accepted', 'preparing'), ('accepted', 'cancelled'),
    ('preparing', 'ready'), ('preparing', 'cancelled'),
    ('ready', 'delivered'));
$$;

-- El mozo acepta o rechaza; al aceptar se generan las comandas por estación.
create or replace function public.set_order_status(p_order uuid, p_status text, p_reason text default null) returns void
language plpgsql as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'not_found: Pedido inexistente.'; end if;
  perform app.require_role(v_order.organization_id, array['owner', 'admin', 'staff']);
  if not app.order_transition_allowed(v_order.status, p_status) then
    raise exception 'invalid: No se puede pasar de % a %.', v_order.status, p_status;
  end if;
  if p_status = 'ready' and exists (
    select 1 from public.order_items where order_id = p_order and status not in ('ready', 'delivered', 'cancelled')) then
    raise exception 'conflict: El pedido todavía tiene productos pendientes.';
  end if;
  update public.orders set status = p_status, updated_at = now(),
    rejection_reason = case when p_status = 'rejected' then left(p_reason, 200) else rejection_reason end
  where id = p_order;
  insert into public.order_status_history (order_id, organization_id, from_status, to_status, actor_id)
  values (p_order, v_order.organization_id, v_order.status, p_status, auth.uid());
  if p_status = 'accepted' then
    insert into public.kitchen_tickets (organization_id, order_id, station)
    select distinct v_order.organization_id, p_order, station from public.order_items where order_id = p_order
    on conflict (order_id, station) do nothing;
  end if;
end $$;

-- La estación marca su comanda. Cuando TODAS las comandas están listas, el
-- pedido pasa a "ready" automáticamente; nunca antes.
create or replace function public.set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql as $$
declare v_ticket public.kitchen_tickets;
begin
  select * into v_ticket from public.kitchen_tickets where id = p_ticket for update;
  if not found then raise exception 'not_found: Comanda inexistente.'; end if;
  perform app.require_role(v_ticket.organization_id, array['owner', 'admin', 'staff']);
  if p_status not in ('preparing', 'ready') then raise exception 'invalid: Estado de comanda inválido.'; end if;
  update public.kitchen_tickets set status = p_status, updated_at = now() where id = p_ticket;
  update public.order_items set status = p_status
   where order_id = v_ticket.order_id and station = v_ticket.station and status not in ('cancelled', 'delivered');
  if p_status = 'preparing' then
    update public.orders set status = 'preparing', updated_at = now() where id = v_ticket.order_id and status = 'accepted';
  end if;
  if not exists (select 1 from public.kitchen_tickets where order_id = v_ticket.order_id and status not in ('ready', 'delivered', 'cancelled')) then
    perform public.set_order_status(v_ticket.order_id, 'ready')
      from public.orders where id = v_ticket.order_id and status = 'preparing';
  end if;
end $$;

-- Movimiento de fidelización: solo personal del local, siempre con autor.
create or replace function public.record_loyalty_transaction(
  p_membership uuid, p_kind text, p_points int, p_stamps int, p_reason text, p_order uuid default null
) returns bigint
language plpgsql as $$
declare
  v_org uuid;
  v_balance record;
  v_id bigint;
begin
  select organization_id into v_org from public.loyalty_memberships where id = p_membership;
  if v_org is null then raise exception 'not_found: Membresía inexistente.'; end if;
  perform app.require_role(v_org, array['owner', 'admin', 'staff']);
  if p_kind = 'redeem' then
    select coalesce(sum(points), 0) as points, coalesce(sum(stamps), 0) as stamps into v_balance
      from public.loyalty_transactions where membership_id = p_membership;
    if v_balance.points + p_points < 0 or v_balance.stamps + p_stamps < 0 then
      raise exception 'conflict: Saldo insuficiente para el canje.';
    end if;
  end if;
  insert into public.loyalty_transactions (organization_id, membership_id, kind, points, stamps, order_id, reason, created_by)
  values (v_org, p_membership, p_kind, p_points, p_stamps, p_order, coalesce(p_reason, ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

/* ---------------------------------------------------------------- RLS */

-- Supabase otorga privilegios por defecto a anon/authenticated en tablas
-- nuevas: se revocan y se concede solo lo necesario.
revoke all on public.table_sessions, public.customers, public.orders, public.order_items, public.order_status_history,
  public.kitchen_tickets, public.service_requests, public.loyalty_programs, public.loyalty_memberships,
  public.loyalty_transactions, public.loyalty_balances from anon, authenticated;

alter table public.table_sessions enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.kitchen_tickets enable row level security;
alter table public.service_requests enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_memberships enable row level security;
alter table public.loyalty_transactions enable row level security;

grant select on public.table_sessions, public.customers, public.orders, public.order_items, public.order_status_history,
  public.kitchen_tickets, public.service_requests, public.loyalty_programs, public.loyalty_memberships,
  public.loyalty_transactions, public.loyalty_balances to authenticated;
grant update (status, updated_at, rejection_reason) on public.orders to authenticated;
grant update (status) on public.order_items to authenticated;
grant insert on public.order_status_history, public.kitchen_tickets to authenticated;
grant update (status, updated_at) on public.kitchen_tickets to authenticated;
grant update (status, handled_by, handled_at) on public.service_requests to authenticated;
grant insert on public.loyalty_transactions to authenticated;
grant insert, update on public.loyalty_programs to authenticated;

do $$
declare t text;
begin
  foreach t in array array['table_sessions', 'orders', 'order_items', 'order_status_history', 'kitchen_tickets',
                           'service_requests', 'loyalty_programs', 'loyalty_memberships', 'loyalty_transactions'] loop
    execute format('create policy %1$s_staff_read on public.%1$s for select to authenticated using (app.has_org_role(organization_id))', t);
  end loop;
end $$;

create policy orders_staff_update on public.orders for update to authenticated
  using (app.has_org_role(organization_id)) with check (app.has_org_role(organization_id));
create policy order_items_staff_update on public.order_items for update to authenticated
  using (app.has_org_role(organization_id)) with check (app.has_org_role(organization_id));
create policy history_staff_insert on public.order_status_history for insert to authenticated
  with check (app.has_org_role(organization_id));
create policy tickets_staff_insert on public.kitchen_tickets for insert to authenticated
  with check (app.has_org_role(organization_id));
create policy tickets_staff_update on public.kitchen_tickets for update to authenticated
  using (app.has_org_role(organization_id)) with check (app.has_org_role(organization_id));
create policy service_staff_update on public.service_requests for update to authenticated
  using (app.has_org_role(organization_id)) with check (app.has_org_role(organization_id));
create policy loyalty_tx_staff_insert on public.loyalty_transactions for insert to authenticated
  with check (app.has_org_role(organization_id) and created_by = auth.uid());
create policy loyalty_programs_admin_write on public.loyalty_programs for all to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin'])) with check (app.has_org_role(organization_id, array['owner', 'admin']));

-- El cliente registrado ve solo sus propios datos y movimientos.
create policy customers_self_read on public.customers for select to authenticated
  using (user_id = auth.uid() or app.has_org_role(organization_id));
create policy memberships_self_read on public.loyalty_memberships for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and c.user_id = auth.uid()));
create policy loyalty_tx_self_read on public.loyalty_transactions for select to authenticated
  using (exists (select 1 from public.loyalty_memberships m join public.customers c on c.id = m.customer_id
                 where m.id = membership_id and c.user_id = auth.uid()));

revoke execute on function public.set_order_status(uuid, text, text), public.set_ticket_status(uuid, text),
  public.record_loyalty_transaction(uuid, text, int, int, text, uuid) from public, anon;
grant execute on function public.set_order_status(uuid, text, text), public.set_ticket_status(uuid, text),
  public.record_loyalty_transaction(uuid, text, int, int, text, uuid), app.order_transition_allowed(text, text)
  to authenticated;
