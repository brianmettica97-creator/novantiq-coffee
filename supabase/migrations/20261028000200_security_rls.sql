-- NOVANTIQ COFFEE · Seguridad: roles, helpers y Row Level Security.
--
-- Modelo de permisos:
--   platform admin (NOVANTIQ) : todo, incluida la gestión de módulos.
--   owner                    : todo dentro de su cafetería, incluidos miembros y reinicio de demo.
--   admin                    : gestiona carta, multimedia, diseño, QR y promociones.
--   staff                    : solo lectura del panel (fase 6: pedidos/comandas).
--   anon (carta pública)     : NINGÚN acceso directo a tablas. Solo las funciones
--                              public_menu() y track_menu_event(), que exponen
--                              exclusivamente contenido publicado.

/* ------------------------------------------------------------ helpers */

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- security definer: consulta organization_members sin pasar por su propia RLS
-- (evita recursión) y solo responde por el usuario autenticado.
create or replace function app.has_org_role(p_org uuid, p_roles text[] default array['owner', 'admin', 'staff'])
returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_platform_admin() or exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles)
  );
$$;

create or replace function app.require_role(p_org uuid, p_roles text[] default array['owner', 'admin'])
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'forbidden: Iniciá sesión para continuar.' using errcode = '42501';
  end if;
  if not app.has_org_role(p_org, p_roles) then
    raise exception 'forbidden: No tenés permisos sobre esta cafetería.' using errcode = '42501';
  end if;
end $$;

grant usage on schema app to authenticated, anon;
grant execute on function app.is_platform_admin(), app.has_org_role(uuid, text[]), app.require_role(uuid, text[]) to authenticated;

/* ---------------------------------------------------------- privilegios */

-- Por defecto nadie toca nada; luego se otorga lo justo.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema app from anon, authenticated;

grant select on public.organizations, public.organization_members, public.organization_settings, public.menu_themes,
  public.menu_badges, public.media_assets, public.menu_categories, public.menu_products, public.product_media,
  public.option_groups, public.option_choices, public.product_option_links, public.combo_items, public.promotions,
  public.restaurant_tables, public.qr_codes, public.menu_analytics, public.audit_logs
  to authenticated;

grant insert, update, delete on public.media_assets, public.menu_categories, public.menu_products, public.product_media,
  public.option_groups, public.option_choices, public.product_option_links, public.combo_items, public.promotions,
  public.menu_badges, public.restaurant_tables, public.qr_codes
  to authenticated;
grant update on public.organization_settings, public.menu_themes to authenticated;
grant insert, update, delete on public.organization_members to authenticated;
grant update (name) on public.organizations to authenticated;

/* ---------------------------------------------------------------- RLS */

alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_settings enable row level security;
alter table public.menu_themes enable row level security;
alter table public.menu_badges enable row level security;
alter table public.media_assets enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_products enable row level security;
alter table public.product_media enable row level security;
alter table public.option_groups enable row level security;
alter table public.option_choices enable row level security;
alter table public.product_option_links enable row level security;
alter table public.combo_items enable row level security;
alter table public.promotions enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.qr_codes enable row level security;
alter table public.menu_analytics enable row level security;
alter table public.audit_logs enable row level security;
alter table app.demo_snapshots enable row level security;

create policy platform_admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());

create policy organizations_read on public.organizations for select to authenticated
  using (app.has_org_role(id));
create policy organizations_owner_update on public.organizations for update to authenticated
  using (app.has_org_role(id, array['owner'])) with check (app.has_org_role(id, array['owner']));

-- Miembros: cada usuario ve su propia membresía; owners ven y gestionan las de su local.
create policy members_read on public.organization_members for select to authenticated
  using (user_id = auth.uid() or app.has_org_role(organization_id, array['owner', 'admin']));
create policy members_owner_insert on public.organization_members for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner']));
create policy members_owner_update on public.organization_members for update to authenticated
  using (app.has_org_role(organization_id, array['owner'])) with check (app.has_org_role(organization_id, array['owner']));
create policy members_owner_delete on public.organization_members for delete to authenticated
  using (app.has_org_role(organization_id, array['owner']) and user_id <> auth.uid());

-- Tablas de catálogo: lectura para cualquier miembro, escritura para owner/admin.
do $$
declare t text;
begin
  foreach t in array array[
    'organization_settings', 'menu_themes', 'menu_badges', 'media_assets', 'menu_categories', 'menu_products',
    'product_media', 'option_groups', 'option_choices', 'product_option_links', 'combo_items', 'promotions',
    'restaurant_tables', 'qr_codes'
  ] loop
    execute format('create policy %1$s_member_read on public.%1$s for select to authenticated using (app.has_org_role(organization_id))', t);
    execute format(
      'create policy %1$s_editor_write on public.%1$s for all to authenticated '
      'using (app.has_org_role(organization_id, array[''owner'', ''admin''])) '
      'with check (app.has_org_role(organization_id, array[''owner'', ''admin'']))', t);
  end loop;
end $$;

-- Analítica y auditoría: solo lectura para miembros. Se escriben vía funciones.
create policy analytics_member_read on public.menu_analytics for select to authenticated
  using (app.has_org_role(organization_id));
create policy audit_owner_read on public.audit_logs for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin']));

-- Los módulos contratados (features) solo los cambia un platform admin.
create or replace function app.guard_features() returns trigger
language plpgsql as $$
begin
  if new.features is distinct from old.features and not app.is_platform_admin()
     and coalesce(current_setting('app.bulk', true), '') <> 'on' then
    raise exception 'forbidden: Los módulos del plan solo los modifica NOVANTIQ.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_features before update on public.organization_settings
  for each row execute function app.guard_features();
