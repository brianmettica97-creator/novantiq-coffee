-- NOVANTIQ COFFEE · Esquema principal (carta digital, multiempresa).
-- Convenciones:
--   * Toda fila de negocio lleva organization_id.
--   * Las referencias entre entidades usan claves foráneas COMPUESTAS
--     (id, organization_id): la base de datos impide vincular un producto,
--     categoría o archivo de otra cafetería aunque el cliente lo intente.
--   * Importes en centavos (bigint). Timestamps con zona horaria.

create schema if not exists app;

/* ---------------------------------------------------------- utilidades */

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.valid_theme_colors(c jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(c) = 'object'
    and c ?& array['background', 'surface', 'ink', 'muted', 'accent', 'accentInk', 'line']
    and coalesce((select bool_and(value ~ '^#[0-9A-Fa-f]{6}$') from jsonb_each_text(c)), false)
$$;

/* --------------------------------------------------- organizaciones */

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  name text not null check (char_length(name) between 1 and 80),
  is_demo boolean not null default false,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

/* ---------------------------------------------------------- multimedia */

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'model3d', 'spin')),
  title text not null default '' check (char_length(title) <= 120),
  alt text not null default '' check (char_length(alt) <= 240),
  url text not null check (char_length(url) <= 2048),
  -- Carpeta en Storage ({org}/{asset}/…). Null para recursos estáticos de demo.
  storage_prefix text check (storage_prefix is null or storage_prefix like organization_id::text || '/%'),
  variants jsonb not null default '[]' check (jsonb_typeof(variants) = 'array'),
  placeholder text check (placeholder is null or char_length(placeholder) <= 4000),
  poster_url text,
  frames jsonb not null default '[]' check (jsonb_typeof(frames) = 'array' and jsonb_array_length(frames) <= 72),
  mime_type text not null default '',
  bytes bigint not null default 0 check (bytes >= 0),
  width int check (width is null or width > 0),
  height int check (height is null or height > 0),
  focal_x smallint not null default 50 check (focal_x between 0 and 100),
  focal_y smallint not null default 50 check (focal_y between 0 and 100),
  credit text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index media_assets_org_idx on public.media_assets (organization_id, kind);

/* -------------------------------------------------- configuración */

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  tagline text not null default '' check (char_length(tagline) <= 90),
  intro text not null default '' check (char_length(intro) <= 400),
  logo_asset_id uuid,
  cover_image_asset_id uuid,
  cover_video_asset_id uuid,
  show_cover boolean not null default true,
  address text not null default '',
  city text not null default '',
  phone text not null default '',
  instagram text not null default '',
  website text not null default '',
  hours jsonb not null default '[]' check (jsonb_typeof(hours) = 'array'),
  currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'es-AR',
  time_zone text not null default 'America/Argentina/Buenos_Aires',
  -- Módulos contratados: solo los modifica NOVANTIQ (platform admin).
  features jsonb not null default '{"orders": false, "loyalty": false, "analytics": true}',
  menu_published boolean not null default false,
  section_order text[] not null default '{promotions,featured,categories}',
  updated_at timestamptz not null default now(),
  foreign key (logo_asset_id, organization_id) references public.media_assets (id, organization_id),
  foreign key (cover_image_asset_id, organization_id) references public.media_assets (id, organization_id),
  foreign key (cover_video_asset_id, organization_id) references public.media_assets (id, organization_id)
);

create table public.menu_themes (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  preset text not null default 'moka',
  colors jsonb not null,
  font_display text not null check (font_display in ('Fraunces', 'Cormorant Garamond', 'Playfair Display', 'DM Serif Display')),
  font_body text not null check (font_body in ('Manrope', 'DM Sans', 'Outfit', 'Inter')),
  card_style text not null default 'soft' check (card_style in ('soft', 'sharp')),
  category_nav_style text not null default 'pills' check (category_nav_style in ('pills', 'underline')),
  promo_style text not null default 'band' check (promo_style in ('band', 'card')),
  cover_layout text not null default 'immersive' check (cover_layout in ('immersive', 'split')),
  updated_at timestamptz not null default now(),
  check (app.valid_theme_colors(colors))
);

create table public.menu_badges (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9-]{1,30}$'),
  label text not null check (char_length(label) between 1 and 40),
  tone text not null default 'accent' check (tone in ('accent', 'dark', 'light')),
  requires_evidence boolean not null default false,
  position int not null default 0,
  primary key (organization_id, key)
);

/* ---------------------------------------------------------- catálogo */

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  slug text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  description text not null default '' check (char_length(description) <= 240),
  image_asset_id uuid,
  position int not null default 0,
  visible boolean not null default true,
  layout text not null default 'grid' check (layout in ('feature', 'grid', 'list', 'carousel')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id),
  foreign key (image_asset_id, organization_id) references public.media_assets (id, organization_id)
);
create index menu_categories_org_idx on public.menu_categories (organization_id, position);

create table public.menu_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid not null,
  kind text not null default 'item' check (kind in ('item', 'combo')),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9-]{1,70}$'),
  description text not null default '' check (char_length(description) <= 280),
  story text not null default '' check (char_length(story) <= 1200),
  price_cents bigint not null check (price_cents between 0 and 100000000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  available boolean not null default true,
  position int not null default 0,
  badges text[] not null default '{}' check (cardinality(badges) <= 3),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  allergens text[] not null default '{}' check (cardinality(allergens) <= 14),
  ingredients text[] not null default '{}' check (cardinality(ingredients) <= 30),
  size text not null default '' check (char_length(size) <= 40),
  portion text not null default '' check (char_length(portion) <= 40),
  prep_minutes int check (prep_minutes is null or prep_minutes between 0 and 240),
  food_info text not null default '' check (char_length(food_info) <= 600),
  display_mode text not null default 'photo' check (display_mode in ('photo', 'gallery', 'video', 'spin', 'model3d')),
  pairing_ids uuid[] not null default '{}',
  related_ids uuid[] not null default '{}',
  station text check (station is null or station in ('barra', 'cocina', 'pasteleria', 'despacho')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id),
  foreign key (category_id, organization_id) references public.menu_categories (id, organization_id)
);
create index menu_products_org_idx on public.menu_products (organization_id, category_id, position);
create index menu_products_published_idx on public.menu_products (organization_id) where status = 'published';

create table public.product_media (
  product_id uuid not null,
  organization_id uuid not null,
  asset_id uuid not null,
  role text not null check (role in ('primary', 'gallery', 'video', 'spin', 'model3d')),
  position int not null default 0,
  primary key (product_id, asset_id, role),
  foreign key (product_id, organization_id) references public.menu_products (id, organization_id) on delete cascade,
  foreign key (asset_id, organization_id) references public.media_assets (id, organization_id)
);
create index product_media_asset_idx on public.product_media (asset_id);

-- Grupos de opciones reutilizables. Un grupo obligatorio de selección única
-- cumple la función de "variante" (tamaño, tipo de leche…).
create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  internal_name text not null default '' check (char_length(internal_name) <= 60),
  required boolean not null default false,
  min_select int not null default 0 check (min_select between 0 and 20),
  max_select int not null default 1 check (max_select between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_select <= max_select),
  unique (id, organization_id)
);

create table public.option_choices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  organization_id uuid not null,
  name text not null check (char_length(name) between 1 and 50),
  price_delta_cents bigint not null default 0 check (price_delta_cents between -10000000 and 10000000),
  available boolean not null default true,
  is_default boolean not null default false,
  position int not null default 0,
  foreign key (group_id, organization_id) references public.option_groups (id, organization_id) on delete cascade
);
create index option_choices_group_idx on public.option_choices (group_id, position);

create table public.product_option_links (
  product_id uuid not null,
  group_id uuid not null,
  organization_id uuid not null,
  position int not null default 0,
  -- { optionId: { priceDelta?: cents, available?: bool } }
  overrides jsonb not null default '{}' check (jsonb_typeof(overrides) = 'object'),
  primary key (product_id, group_id),
  foreign key (product_id, organization_id) references public.menu_products (id, organization_id) on delete cascade,
  foreign key (group_id, organization_id) references public.option_groups (id, organization_id)
);

-- Componentes de un combo. El precio del combo es fijo (menu_products.price_cents):
-- un cambio de precio de un componente no altera el combo ni pedidos pasados.
create table public.combo_items (
  combo_id uuid not null,
  product_id uuid not null,
  organization_id uuid not null,
  quantity int not null default 1 check (quantity between 1 and 20),
  substitute_ids uuid[] not null default '{}',
  position int not null default 0,
  primary key (combo_id, product_id),
  check (combo_id <> product_id),
  foreign key (combo_id, organization_id) references public.menu_products (id, organization_id) on delete cascade,
  foreign key (product_id, organization_id) references public.menu_products (id, organization_id) on delete cascade
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 70),
  description text not null default '' check (char_length(description) <= 240),
  kind text not null check (kind in ('announcement', 'percent_off', 'combo_price')),
  percent_off int check (percent_off is null or percent_off between 1 and 90),
  product_ids uuid[] not null default '{}',
  image_asset_id uuid,
  video_asset_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  days smallint[] not null default '{}' check (days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  start_time text not null default '' check (start_time ~ '^(([01][0-9]|2[0-3]):[0-5][0-9])?$'),
  end_time text not null default '' check (end_time ~ '^(([01][0-9]|2[0-3]):[0-5][0-9])?$'),
  active boolean not null default true,
  conditions text not null default '' check (char_length(conditions) <= 400),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (kind <> 'percent_off' or percent_off is not null),
  check ((start_time = '') = (end_time = '')),
  foreign key (image_asset_id, organization_id) references public.media_assets (id, organization_id),
  foreign key (video_asset_id, organization_id) references public.media_assets (id, organization_id)
);
create index promotions_org_idx on public.promotions (organization_id, position);

/* ------------------------------------------------------- mesas y QR */

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, label),
  unique (id, organization_id)
);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  -- Token aleatorio: no identifica nada por sí solo y no otorga permisos.
  token text not null unique check (token ~ '^[a-z0-9]{8,32}$'),
  table_label text check (table_label is null or char_length(table_label) <= 30),
  table_id uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (table_id, organization_id) references public.restaurant_tables (id, organization_id)
);
create index qr_codes_org_idx on public.qr_codes (organization_id);

/* ---------------------------------------------------------- analítica */

-- Interacciones anónimas con la carta. NO son ventas ni pedidos.
create table public.menu_analytics (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null check (type in (
    'menu_view', 'qr_scan', 'category_view', 'product_view', 'media_play',
    'spin_interact', 'model_open', 'search', 'promo_click'
  )),
  product_id uuid,
  category_id uuid,
  promotion_id uuid,
  qr_code_id uuid references public.qr_codes (id) on delete set null,
  query text check (query is null or char_length(query) <= 60),
  session_id text not null check (char_length(session_id) <= 64),
  occurred_at timestamptz not null default now()
);
create index menu_analytics_org_time_idx on public.menu_analytics (organization_id, occurred_at desc);
create index menu_analytics_session_idx on public.menu_analytics (session_id, occurred_at desc);

/* ---------------------------------------------------------- auditoría */

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, occurred_at desc);

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid;
  v_id text;
begin
  -- Las importaciones masivas (seed / reinicio de demo) no se auditan fila a fila.
  if coalesce(current_setting('app.bulk', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  v_org := coalesce((to_jsonb(new) ->> 'organization_id'), (to_jsonb(old) ->> 'organization_id'))::uuid;
  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', to_jsonb(new) ->> 'product_id', to_jsonb(old) ->> 'product_id');
  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, before, after)
  values (v_org, auth.uid(), lower(tg_op), tg_table_name, v_id,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'organization_members', 'organization_settings', 'menu_themes', 'menu_categories',
    'menu_products', 'option_groups', 'option_choices', 'promotions', 'media_assets', 'qr_codes'
  ] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function app.audit()', t);
  end loop;
  foreach t in array array[
    'organizations', 'organization_settings', 'menu_themes', 'menu_categories', 'menu_products',
    'option_groups', 'promotions', 'media_assets'
  ] loop
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

/* ------------------------------------------------ demo (snapshots) */

-- Contenido original de las organizaciones de demostración, para reiniciarlas.
create table app.demo_snapshots (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  bundle jsonb not null,
  created_at timestamptz not null default now()
);
