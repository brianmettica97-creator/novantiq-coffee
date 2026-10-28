-- NOVANTIQ COFFEE · API (funciones RPC expuestas por PostgREST).
--
-- * Las funciones del panel son SECURITY INVOKER: corren con los permisos del
--   usuario, así que RLS sigue aplicando aunque haya un bug en la función.
--   Además verifican el rol con app.require_role() para dar errores claros.
-- * public_menu y track_menu_event son SECURITY DEFINER porque el visitante
--   anónimo no tiene acceso a ninguna tabla; devuelven solo lo publicado.
-- * Los errores de negocio usan el prefijo "forbidden:", "not_found:",
--   "conflict:" o "invalid:" para que el frontend los muestre tal cual.

/* =============================================================== JSON */

create or replace function app.keep_ids(p_ids uuid[], p_allowed uuid[]) returns uuid[]
language sql immutable as $$
  select case when p_allowed is null then coalesce(p_ids, '{}')
    else coalesce(array(select x from unnest(p_ids) with ordinality as u(x, n) where x = any (p_allowed) order by n), '{}') end;
$$;

create or replace function app.media_json(m public.media_assets) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'organizationId', m.organization_id, 'kind', m.kind, 'title', m.title, 'alt', m.alt,
    'url', m.url, 'variants', m.variants, 'placeholder', m.placeholder, 'posterUrl', m.poster_url,
    'frames', m.frames, 'mimeType', m.mime_type, 'bytes', m.bytes, 'width', m.width, 'height', m.height,
    'focalX', m.focal_x, 'focalY', m.focal_y, 'credit', m.credit, 'createdAt', m.created_at);
$$;

create or replace function app.category_json(c public.menu_categories) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', c.id, 'organizationId', c.organization_id, 'name', c.name, 'slug', c.slug, 'description', c.description,
    'imageAssetId', c.image_asset_id, 'position', c.position, 'visible', c.visible, 'layout', c.layout);
$$;

-- p_visible: ids de productos que se pueden referenciar (null = todos).
create or replace function app.product_json(p public.menu_products, p_visible uuid[] default null) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'organizationId', p.organization_id, 'categoryId', p.category_id, 'kind', p.kind,
    'name', p.name, 'slug', p.slug, 'description', p.description, 'story', p.story, 'price', p.price_cents,
    'status', p.status, 'available', p.available, 'position', p.position,
    'badges', to_jsonb(p.badges), 'tags', to_jsonb(p.tags), 'allergens', to_jsonb(p.allergens),
    'ingredients', to_jsonb(p.ingredients), 'size', p.size, 'portion', p.portion, 'prepMinutes', p.prep_minutes,
    'foodInfo', p.food_info, 'displayMode', p.display_mode,
    'media', coalesce((select jsonb_agg(jsonb_build_object('assetId', m.asset_id, 'role', m.role, 'position', m.position) order by m.position)
                       from public.product_media m where m.product_id = p.id), '[]'),
    'optionGroups', coalesce((select jsonb_agg(jsonb_build_object('groupId', l.group_id, 'position', l.position, 'overrides', l.overrides) order by l.position)
                              from public.product_option_links l where l.product_id = p.id), '[]'),
    'pairingIds', to_jsonb(app.keep_ids(p.pairing_ids, p_visible)),
    'relatedIds', to_jsonb(app.keep_ids(p.related_ids, p_visible)),
    'comboItems', coalesce((select jsonb_agg(jsonb_build_object(
                              'productId', c.product_id, 'quantity', c.quantity,
                              'substituteIds', to_jsonb(app.keep_ids(c.substitute_ids, p_visible))) order by c.position)
                            from public.combo_items c
                            where c.combo_id = p.id and (p_visible is null or c.product_id = any (p_visible))), '[]'),
    'station', p.station, 'createdAt', p.created_at, 'updatedAt', p.updated_at);
$$;

create or replace function app.group_json(g public.option_groups) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'organizationId', g.organization_id, 'name', g.name, 'internalName', g.internal_name,
    'required', g.required, 'minSelect', g.min_select, 'maxSelect', g.max_select,
    'options', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', o.id, 'name', o.name, 'priceDelta', o.price_delta_cents, 'available', o.available,
                           'isDefault', o.is_default, 'position', o.position) order by o.position)
                         from public.option_choices o where o.group_id = g.id), '[]'));
$$;

create or replace function app.promotion_json(p public.promotions, p_visible uuid[] default null) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'organizationId', p.organization_id, 'title', p.title, 'description', p.description, 'kind', p.kind,
    'percentOff', p.percent_off, 'productIds', to_jsonb(app.keep_ids(p.product_ids, p_visible)),
    'imageAssetId', p.image_asset_id, 'videoAssetId', p.video_asset_id, 'startsAt', p.starts_at, 'endsAt', p.ends_at,
    'days', to_jsonb(p.days), 'startTime', p.start_time, 'endTime', p.end_time, 'active', p.active,
    'conditions', p.conditions, 'position', p.position);
$$;

create or replace function app.settings_json(s public.organization_settings) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'organizationId', s.organization_id, 'tagline', s.tagline, 'intro', s.intro, 'logoAssetId', s.logo_asset_id,
    'coverImageAssetId', s.cover_image_asset_id, 'coverVideoAssetId', s.cover_video_asset_id, 'showCover', s.show_cover,
    'address', s.address, 'city', s.city, 'phone', s.phone, 'instagram', s.instagram, 'website', s.website,
    'hours', s.hours, 'currency', s.currency, 'locale', s.locale, 'timeZone', s.time_zone, 'features', s.features,
    'menuPublished', s.menu_published, 'sectionOrder', to_jsonb(s.section_order), 'updatedAt', s.updated_at);
$$;

create or replace function app.theme_json(t public.menu_themes) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'organizationId', t.organization_id, 'preset', t.preset, 'colors', t.colors, 'fontDisplay', t.font_display,
    'fontBody', t.font_body, 'cardStyle', t.card_style, 'categoryNavStyle', t.category_nav_style,
    'promoStyle', t.promo_style, 'coverLayout', t.cover_layout, 'updatedAt', t.updated_at);
$$;

create or replace function app.qr_json(q public.qr_codes) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', q.id, 'organizationId', q.organization_id, 'label', q.label, 'token', q.token,
    'tableLabel', q.table_label, 'createdAt', q.created_at, 'revokedAt', q.revoked_at);
$$;

create or replace function app.org_json(o public.organizations) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'isDemo', o.is_demo,
                            'status', o.status, 'createdAt', o.created_at);
$$;

create or replace function app.badges_json(p_org uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', b.key, 'label', b.label, 'tone', b.tone,
                                               'requiresEvidence', b.requires_evidence) order by b.position), '[]')
  from public.menu_badges b where b.organization_id = p_org;
$$;

/* ======================================================== carta pública */

-- Devuelve la carta publicada o null. Misma regla que src/domain/menu.ts
-- (buildPublicMenu): solo productos publicados en categorías visibles,
-- promociones no vencidas y solo los archivos referenciados.
create or replace function public.public_menu(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_org public.organizations;
  v_settings public.organization_settings;
  v_cats uuid[];
  v_products uuid[];
  v_promos uuid[];
  v_groups uuid[];
  v_media uuid[];
begin
  select * into v_org from public.organizations where slug = p_slug and status = 'active';
  if not found then return null; end if;
  select * into v_settings from public.organization_settings where organization_id = v_org.id;
  if not found or not v_settings.menu_published then return null; end if;

  v_cats := array(select id from public.menu_categories where organization_id = v_org.id and visible);
  v_products := array(select id from public.menu_products
                      where organization_id = v_org.id and status = 'published' and category_id = any (v_cats));
  v_promos := array(select id from public.promotions
                    where organization_id = v_org.id and active and (ends_at is null or ends_at > now()));
  v_groups := array(select distinct group_id from public.product_option_links where product_id = any (v_products));
  v_media := array(
    select asset_id from public.product_media where product_id = any (v_products)
    union select image_asset_id from public.menu_categories where id = any (v_cats) and image_asset_id is not null
    union select image_asset_id from public.promotions where id = any (v_promos) and image_asset_id is not null
    union select video_asset_id from public.promotions where id = any (v_promos) and video_asset_id is not null
    union select unnest(array[v_settings.logo_asset_id, v_settings.cover_image_asset_id, v_settings.cover_video_asset_id]));

  return jsonb_build_object(
    'organization', jsonb_build_object('id', v_org.id, 'slug', v_org.slug, 'name', v_org.name, 'isDemo', v_org.is_demo),
    'settings', app.settings_json(v_settings) - 'updatedAt',
    'theme', (select app.theme_json(t) from public.menu_themes t where t.organization_id = v_org.id),
    'badges', app.badges_json(v_org.id),
    'categories', coalesce((select jsonb_agg(app.category_json(c) order by c.position) from public.menu_categories c where c.id = any (v_cats)), '[]'),
    'products', coalesce((select jsonb_agg(app.product_json(p, v_products) order by p.position) from public.menu_products p where p.id = any (v_products)), '[]'),
    'optionGroups', coalesce((select jsonb_agg(app.group_json(g)) from public.option_groups g where g.id = any (v_groups)), '[]'),
    'promotions', coalesce((select jsonb_agg(app.promotion_json(p, v_products) order by p.position) from public.promotions p where p.id = any (v_promos)), '[]'),
    'media', coalesce((select jsonb_agg(app.media_json(m)) from public.media_assets m where m.id = any (v_media)), '[]'));
end $$;

-- Registro anónimo de interacciones. Valida todo lo que llega del navegador:
-- tipo de evento, pertenencia de ids a la cafetería y longitud de textos.
create or replace function public.track_menu_event(
  p_slug text, p_type text, p_session text,
  p_product uuid default null, p_category uuid default null, p_promotion uuid default null,
  p_query text default null, p_qr_token text default null
) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare
  v_org uuid;
  v_qr uuid;
begin
  select o.id into v_org from public.organizations o
    join public.organization_settings s on s.organization_id = o.id
   where o.slug = p_slug and o.status = 'active' and s.menu_published and coalesce((s.features ->> 'analytics')::boolean, true);
  if v_org is null or p_session is null or char_length(p_session) > 64 then return; end if;
  if p_type not in ('menu_view', 'qr_scan', 'category_view', 'product_view', 'media_play', 'spin_interact', 'model_open', 'search', 'promo_click') then
    return;
  end if;
  -- Límite simple contra abuso: 120 eventos por minuto y sesión.
  if (select count(*) from public.menu_analytics where session_id = p_session and occurred_at > now() - interval '1 minute') >= 120 then
    return;
  end if;
  if p_product is not null and not exists (select 1 from public.menu_products where id = p_product and organization_id = v_org) then p_product := null; end if;
  if p_category is not null and not exists (select 1 from public.menu_categories where id = p_category and organization_id = v_org) then p_category := null; end if;
  if p_promotion is not null and not exists (select 1 from public.promotions where id = p_promotion and organization_id = v_org) then p_promotion := null; end if;
  if p_qr_token is not null then
    select id into v_qr from public.qr_codes where token = p_qr_token and organization_id = v_org and revoked_at is null;
  end if;
  insert into public.menu_analytics (organization_id, type, product_id, category_id, promotion_id, qr_code_id, query, session_id)
  values (v_org, p_type, p_product, p_category, p_promotion, v_qr, left(lower(nullif(trim(p_query), '')), 60), p_session);
end $$;

/* ============================================================== panel */

create or replace function public.my_memberships() returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('organization', app.org_json(o), 'role', m.role) order by o.name), '[]')
  from public.organization_members m join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid();
$$;

create or replace function public.admin_bundle(p_org uuid) returns jsonb
language plpgsql stable as $$
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  return jsonb_build_object(
    'organization', (select app.org_json(o) from public.organizations o where o.id = p_org),
    'settings', (select app.settings_json(s) from public.organization_settings s where s.organization_id = p_org),
    'theme', (select app.theme_json(t) from public.menu_themes t where t.organization_id = p_org),
    'badges', app.badges_json(p_org),
    'categories', coalesce((select jsonb_agg(app.category_json(c) order by c.position) from public.menu_categories c where c.organization_id = p_org), '[]'),
    'products', coalesce((select jsonb_agg(app.product_json(p) order by p.position) from public.menu_products p where p.organization_id = p_org), '[]'),
    'optionGroups', coalesce((select jsonb_agg(app.group_json(g) order by g.created_at) from public.option_groups g where g.organization_id = p_org), '[]'),
    'promotions', coalesce((select jsonb_agg(app.promotion_json(p) order by p.position) from public.promotions p where p.organization_id = p_org), '[]'),
    'media', coalesce((select jsonb_agg(app.media_json(m) order by m.created_at) from public.media_assets m where m.organization_id = p_org), '[]'),
    'qrCodes', coalesce((select jsonb_agg(app.qr_json(q) order by q.created_at) from public.qr_codes q where q.organization_id = p_org), '[]'));
end $$;

create or replace function app.unique_slug(p_base text, p_taken text[]) returns text
language plpgsql immutable as $$
declare
  v_root text := left(trim(both '-' from regexp_replace(lower(translate(coalesce(p_base, ''),
    'áéíóúüñÁÉÍÓÚÜÑàèìòùç', 'aeiouunaeiouunaeiouc')), '[^a-z0-9]+', '-', 'g')), 60);
  v_slug text;
  i int := 2;
begin
  if v_root = '' then v_root := 'item'; end if;
  v_slug := v_root;
  while v_slug = any (p_taken) loop
    v_slug := v_root || '-' || i;
    i := i + 1;
  end loop;
  return v_slug;
end $$;

/** Verifica que todos los ids existan como productos de la organización. */
create or replace function app.assert_products_in_org(p_org uuid, p_ids uuid[]) returns void
language plpgsql stable as $$
begin
  if exists (select unnest(p_ids) except select id from public.menu_products where organization_id = p_org) then
    raise exception 'invalid: Hay productos referenciados que no pertenecen a esta cafetería.';
  end if;
end $$;

/* ---------------------------------------------------------- categorías */

create or replace function public.save_category(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare
  v_id uuid := coalesce(nullif(p_data ->> 'id', '')::uuid, gen_random_uuid());
  v_row public.menu_categories;
  v_exists boolean;
begin
  perform app.require_role(p_org);
  select exists (select 1 from public.menu_categories where id = v_id and organization_id = p_org) into v_exists;
  insert into public.menu_categories (id, organization_id, name, slug, description, image_asset_id, position, visible, layout)
  values (
    v_id, p_org, trim(p_data ->> 'name'),
    app.unique_slug(coalesce(nullif(p_data ->> 'slug', ''), p_data ->> 'name'),
                    array(select slug from public.menu_categories where organization_id = p_org and id <> v_id)),
    coalesce(p_data ->> 'description', ''), nullif(p_data ->> 'imageAssetId', '')::uuid,
    case when v_exists then coalesce((p_data ->> 'position')::int, 0)
         else (select count(*) from public.menu_categories where organization_id = p_org) end,
    coalesce((p_data ->> 'visible')::boolean, true), coalesce(p_data ->> 'layout', 'grid'))
  on conflict (id) do update set
    name = excluded.name, slug = excluded.slug, description = excluded.description,
    image_asset_id = excluded.image_asset_id, visible = excluded.visible, layout = excluded.layout,
    position = excluded.position
  where public.menu_categories.organization_id = p_org
  returning * into v_row;
  if v_row.id is null then raise exception 'forbidden: La categoría pertenece a otra cafetería.'; end if;
  return app.category_json(v_row);
end $$;

create or replace function public.delete_category(p_org uuid, p_id uuid) returns void
language plpgsql as $$
declare v_count int;
begin
  perform app.require_role(p_org);
  select count(*) into v_count from public.menu_products where category_id = p_id and organization_id = p_org and status <> 'archived';
  if v_count > 0 then
    raise exception 'conflict: La categoría tiene % producto(s). Movelos o archivalos antes de eliminarla.', v_count;
  end if;
  delete from public.menu_products where category_id = p_id and organization_id = p_org;
  delete from public.menu_categories where id = p_id and organization_id = p_org;
  if not found then raise exception 'not_found: Categoría inexistente.'; end if;
end $$;

create or replace function public.reorder_categories(p_org uuid, p_ids uuid[]) returns void
language plpgsql as $$
begin
  perform app.require_role(p_org);
  update public.menu_categories c set position = u.n - 1
    from unnest(p_ids) with ordinality as u(id, n)
   where c.id = u.id and c.organization_id = p_org;
end $$;

/* ----------------------------------------------------------- productos */

create or replace function public.save_product(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare
  v_id uuid := coalesce(nullif(p_data ->> 'id', '')::uuid, gen_random_uuid());
  v_category uuid := (p_data ->> 'categoryId')::uuid;
  v_old public.menu_products;
  v_row public.menu_products;
  v_pairing uuid[] := array(select jsonb_array_elements_text(coalesce(p_data -> 'pairingIds', '[]'))::uuid);
  v_related uuid[] := array(select jsonb_array_elements_text(coalesce(p_data -> 'relatedIds', '[]'))::uuid);
  v_combo_refs uuid[];
begin
  perform app.require_role(p_org);
  if not exists (select 1 from public.menu_categories where id = v_category and organization_id = p_org) then
    raise exception 'invalid: La categoría no existe en esta cafetería.';
  end if;
  v_combo_refs := array(
    select (c ->> 'productId')::uuid from jsonb_array_elements(coalesce(p_data -> 'comboItems', '[]')) c
    union all
    select s::uuid from jsonb_array_elements(coalesce(p_data -> 'comboItems', '[]')) c,
                        jsonb_array_elements_text(coalesce(c -> 'substituteIds', '[]')) s);
  perform app.assert_products_in_org(p_org, v_pairing || v_related || v_combo_refs);
  if v_id = any (v_combo_refs) then raise exception 'invalid: Un combo no puede incluirse a sí mismo.'; end if;
  if p_data ->> 'kind' = 'combo' and jsonb_array_length(coalesce(p_data -> 'comboItems', '[]')) < 2 then
    raise exception 'invalid: Un combo necesita al menos 2 productos.';
  end if;

  select * into v_old from public.menu_products where id = v_id and organization_id = p_org;

  insert into public.menu_products (
    id, organization_id, category_id, kind, name, slug, description, story, price_cents, status, available, position,
    badges, tags, allergens, ingredients, size, portion, prep_minutes, food_info, display_mode, pairing_ids, related_ids, station)
  values (
    v_id, p_org, v_category, coalesce(p_data ->> 'kind', 'item'), trim(p_data ->> 'name'),
    app.unique_slug(coalesce(nullif(p_data ->> 'slug', ''), p_data ->> 'name'),
                    array(select slug from public.menu_products where organization_id = p_org and id <> v_id)),
    coalesce(p_data ->> 'description', ''), coalesce(p_data ->> 'story', ''), (p_data ->> 'price')::bigint,
    coalesce(p_data ->> 'status', 'draft'), coalesce((p_data ->> 'available')::boolean, true),
    case when v_old.id is not null and v_old.category_id = v_category then coalesce((p_data ->> 'position')::int, v_old.position)
         else (select count(*) from public.menu_products where organization_id = p_org and category_id = v_category) end,
    array(select jsonb_array_elements_text(coalesce(p_data -> 'badges', '[]'))),
    array(select jsonb_array_elements_text(coalesce(p_data -> 'tags', '[]'))),
    array(select jsonb_array_elements_text(coalesce(p_data -> 'allergens', '[]'))),
    array(select jsonb_array_elements_text(coalesce(p_data -> 'ingredients', '[]'))),
    coalesce(p_data ->> 'size', ''), coalesce(p_data ->> 'portion', ''), (p_data ->> 'prepMinutes')::int,
    coalesce(p_data ->> 'foodInfo', ''), coalesce(p_data ->> 'displayMode', 'photo'), v_pairing, v_related,
    nullif(p_data ->> 'station', ''))
  on conflict (id) do update set
    category_id = excluded.category_id, kind = excluded.kind, name = excluded.name, slug = excluded.slug,
    description = excluded.description, story = excluded.story, price_cents = excluded.price_cents,
    status = excluded.status, available = excluded.available, position = excluded.position, badges = excluded.badges,
    tags = excluded.tags, allergens = excluded.allergens, ingredients = excluded.ingredients, size = excluded.size,
    portion = excluded.portion, prep_minutes = excluded.prep_minutes, food_info = excluded.food_info,
    display_mode = excluded.display_mode, pairing_ids = excluded.pairing_ids, related_ids = excluded.related_ids,
    station = excluded.station
  where public.menu_products.organization_id = p_org
  returning * into v_row;
  if v_row.id is null then raise exception 'forbidden: El producto pertenece a otra cafetería.'; end if;

  -- Relaciones: se reemplazan completas. Las FK compuestas rechazan archivos o
  -- grupos de otra organización.
  delete from public.product_media where product_id = v_id;
  insert into public.product_media (product_id, organization_id, asset_id, role, position)
  select v_id, p_org, (m ->> 'assetId')::uuid, m ->> 'role', coalesce((m ->> 'position')::int, n::int - 1)
    from jsonb_array_elements(coalesce(p_data -> 'media', '[]')) with ordinality as x(m, n);

  delete from public.product_option_links where product_id = v_id;
  insert into public.product_option_links (product_id, group_id, organization_id, position, overrides)
  select v_id, (l ->> 'groupId')::uuid, p_org, coalesce((l ->> 'position')::int, n::int - 1), coalesce(l -> 'overrides', '{}')
    from jsonb_array_elements(coalesce(p_data -> 'optionGroups', '[]')) with ordinality as x(l, n);

  delete from public.combo_items where combo_id = v_id;
  insert into public.combo_items (combo_id, product_id, organization_id, quantity, substitute_ids, position)
  select v_id, (c ->> 'productId')::uuid, p_org, coalesce((c ->> 'quantity')::int, 1),
         array(select jsonb_array_elements_text(coalesce(c -> 'substituteIds', '[]'))::uuid), n::int - 1
    from jsonb_array_elements(case when v_row.kind = 'combo' then coalesce(p_data -> 'comboItems', '[]') else '[]' end)
         with ordinality as x(c, n);

  return app.product_json(v_row);
end $$;

create or replace function public.duplicate_product(p_org uuid, p_id uuid) returns jsonb
language plpgsql as $$
declare v_src jsonb;
begin
  perform app.require_role(p_org);
  select app.product_json(p) into v_src from public.menu_products p where p.id = p_id and p.organization_id = p_org;
  if v_src is null then raise exception 'not_found: Producto inexistente.'; end if;
  return public.save_product(p_org, v_src || jsonb_build_object(
    'id', gen_random_uuid(), 'name', left((v_src ->> 'name') || ' (copia)', 80),
    'slug', (v_src ->> 'slug') || '-copia', 'status', 'draft', 'position', null));
end $$;

create or replace function public.reorder_products(p_org uuid, p_category uuid, p_ids uuid[]) returns void
language plpgsql as $$
begin
  perform app.require_role(p_org);
  update public.menu_products p set position = u.n - 1
    from unnest(p_ids) with ordinality as u(id, n)
   where p.id = u.id and p.organization_id = p_org and p.category_id = p_category;
end $$;

/* ---------------------------------------------------- grupos de opciones */

create or replace function public.save_option_group(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare
  v_id uuid := coalesce(nullif(p_data ->> 'id', '')::uuid, gen_random_uuid());
  v_row public.option_groups;
begin
  perform app.require_role(p_org);
  if jsonb_array_length(coalesce(p_data -> 'options', '[]')) = 0 then
    raise exception 'invalid: Agregá al menos una opción.';
  end if;
  insert into public.option_groups (id, organization_id, name, internal_name, required, min_select, max_select)
  values (v_id, p_org, trim(p_data ->> 'name'), coalesce(p_data ->> 'internalName', ''),
          coalesce((p_data ->> 'required')::boolean, false), coalesce((p_data ->> 'minSelect')::int, 0),
          coalesce((p_data ->> 'maxSelect')::int, 1))
  on conflict (id) do update set name = excluded.name, internal_name = excluded.internal_name,
    required = excluded.required, min_select = excluded.min_select, max_select = excluded.max_select
  where public.option_groups.organization_id = p_org
  returning * into v_row;
  if v_row.id is null then raise exception 'forbidden: El grupo pertenece a otra cafetería.'; end if;

  -- Se conservan los ids de opciones existentes: los ajustes por producto
  -- (overrides) siguen apuntando a la opción correcta.
  delete from public.option_choices
   where group_id = v_id
     and id not in (select (o ->> 'id')::uuid from jsonb_array_elements(p_data -> 'options') o where nullif(o ->> 'id', '') is not null);
  insert into public.option_choices (id, group_id, organization_id, name, price_delta_cents, available, is_default, position)
  select coalesce(nullif(o ->> 'id', '')::uuid, gen_random_uuid()), v_id, p_org, trim(o ->> 'name'),
         coalesce((o ->> 'priceDelta')::bigint, 0), coalesce((o ->> 'available')::boolean, true),
         coalesce((o ->> 'isDefault')::boolean, false), n::int - 1
    from jsonb_array_elements(p_data -> 'options') with ordinality as x(o, n)
  on conflict (id) do update set name = excluded.name, price_delta_cents = excluded.price_delta_cents,
    available = excluded.available, is_default = excluded.is_default, position = excluded.position
  where public.option_choices.group_id = v_id;
  return app.group_json(v_row);
end $$;

create or replace function public.delete_option_group(p_org uuid, p_id uuid) returns void
language plpgsql as $$
declare v_names text;
begin
  perform app.require_role(p_org);
  select string_agg(p.name, ', ') into v_names
    from public.product_option_links l join public.menu_products p on p.id = l.product_id
   where l.group_id = p_id and l.organization_id = p_org;
  if v_names is not null then raise exception 'conflict: El grupo se usa en: %.', v_names; end if;
  delete from public.option_groups where id = p_id and organization_id = p_org;
  if not found then raise exception 'not_found: Grupo inexistente.'; end if;
end $$;

/* ---------------------------------------------------------- promociones */

create or replace function public.save_promotion(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare
  v_id uuid := coalesce(nullif(p_data ->> 'id', '')::uuid, gen_random_uuid());
  v_products uuid[] := array(select jsonb_array_elements_text(coalesce(p_data -> 'productIds', '[]'))::uuid);
  v_row public.promotions;
begin
  perform app.require_role(p_org);
  perform app.assert_products_in_org(p_org, v_products);
  insert into public.promotions (id, organization_id, title, description, kind, percent_off, product_ids, image_asset_id,
    video_asset_id, starts_at, ends_at, days, start_time, end_time, active, conditions, position)
  values (v_id, p_org, trim(p_data ->> 'title'), coalesce(p_data ->> 'description', ''), p_data ->> 'kind',
    (p_data ->> 'percentOff')::int, v_products, nullif(p_data ->> 'imageAssetId', '')::uuid,
    nullif(p_data ->> 'videoAssetId', '')::uuid, (p_data ->> 'startsAt')::timestamptz, (p_data ->> 'endsAt')::timestamptz,
    array(select jsonb_array_elements_text(coalesce(p_data -> 'days', '[]'))::smallint),
    coalesce(p_data ->> 'startTime', ''), coalesce(p_data ->> 'endTime', ''), coalesce((p_data ->> 'active')::boolean, true),
    coalesce(p_data ->> 'conditions', ''),
    coalesce((p_data ->> 'position')::int, (select count(*) from public.promotions where organization_id = p_org)))
  on conflict (id) do update set title = excluded.title, description = excluded.description, kind = excluded.kind,
    percent_off = excluded.percent_off, product_ids = excluded.product_ids, image_asset_id = excluded.image_asset_id,
    video_asset_id = excluded.video_asset_id, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    days = excluded.days, start_time = excluded.start_time, end_time = excluded.end_time, active = excluded.active,
    conditions = excluded.conditions, position = excluded.position
  where public.promotions.organization_id = p_org
  returning * into v_row;
  if v_row.id is null then raise exception 'forbidden: La promoción pertenece a otra cafetería.'; end if;
  return app.promotion_json(v_row);
end $$;

create or replace function public.delete_promotion(p_org uuid, p_id uuid) returns void
language plpgsql as $$
begin
  perform app.require_role(p_org);
  delete from public.promotions where id = p_id and organization_id = p_org;
  if not found then raise exception 'not_found: Promoción inexistente.'; end if;
end $$;

/* ----------------------------------------------------------- multimedia */

-- Toda URL subida debe estar dentro de la carpeta de la organización.
create or replace function app.assert_media_urls(p_org uuid, p_data jsonb) returns void
language plpgsql immutable as $$
declare
  v_marker text := '/' || p_org::text || '/';
  v_url text;
begin
  for v_url in
    select p_data ->> 'url'
    union all select p_data ->> 'posterUrl' where p_data ->> 'posterUrl' is not null
    union all select v ->> 'url' from jsonb_array_elements(coalesce(p_data -> 'variants', '[]')) v
    union all select f from jsonb_array_elements_text(coalesce(p_data -> 'frames', '[]')) f
  loop
    if v_url is null or v_url !~ '^https://' or position(v_marker in v_url) = 0 then
      raise exception 'invalid: Los archivos deben estar en el almacenamiento de esta cafetería.';
    end if;
  end loop;
  if (p_data ->> 'storagePrefix') is null or (p_data ->> 'storagePrefix') not like p_org::text || '/%' then
    raise exception 'invalid: Carpeta de almacenamiento inválida.';
  end if;
end $$;

create or replace function public.register_media(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare v_row public.media_assets;
begin
  perform app.require_role(p_org);
  perform app.assert_media_urls(p_org, p_data);
  if (p_data ->> 'kind') not in ('image', 'video', 'model3d', 'spin') then raise exception 'invalid: Tipo de archivo no admitido.'; end if;
  if (p_data ->> 'kind') = 'video' and (p_data ->> 'bytes')::bigint > 40 * 1024 * 1024 then raise exception 'invalid: El video supera 40 MB.'; end if;
  if (p_data ->> 'kind') = 'model3d' and (p_data ->> 'bytes')::bigint > 15 * 1024 * 1024 then raise exception 'invalid: El modelo supera 15 MB.'; end if;
  insert into public.media_assets (id, organization_id, kind, title, alt, url, storage_prefix, variants, placeholder,
    poster_url, frames, mime_type, bytes, width, height, credit)
  values ((p_data ->> 'id')::uuid, p_org, p_data ->> 'kind', left(coalesce(p_data ->> 'title', ''), 120),
    left(coalesce(p_data ->> 'alt', ''), 240), p_data ->> 'url', p_data ->> 'storagePrefix',
    coalesce(p_data -> 'variants', '[]'), p_data ->> 'placeholder', p_data ->> 'posterUrl', coalesce(p_data -> 'frames', '[]'),
    coalesce(p_data ->> 'mimeType', ''), coalesce((p_data ->> 'bytes')::bigint, 0), (p_data ->> 'width')::int,
    (p_data ->> 'height')::int, 'Subido desde el panel')
  returning * into v_row;
  return app.media_json(v_row);
end $$;

create or replace function public.replace_media_files(p_org uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare
  v_old public.media_assets;
  v_row public.media_assets;
begin
  perform app.require_role(p_org);
  perform app.assert_media_urls(p_org, p_data);
  select * into v_old from public.media_assets where id = p_id and organization_id = p_org;
  if not found then raise exception 'not_found: Archivo inexistente.'; end if;
  if v_old.kind <> p_data ->> 'kind' then raise exception 'invalid: El reemplazo debe ser del mismo tipo de archivo.'; end if;
  update public.media_assets set url = p_data ->> 'url', storage_prefix = p_data ->> 'storagePrefix',
    variants = coalesce(p_data -> 'variants', '[]'), placeholder = p_data ->> 'placeholder', poster_url = p_data ->> 'posterUrl',
    frames = coalesce(p_data -> 'frames', '[]'), mime_type = coalesce(p_data ->> 'mimeType', ''),
    bytes = coalesce((p_data ->> 'bytes')::bigint, 0), width = (p_data ->> 'width')::int, height = (p_data ->> 'height')::int,
    credit = 'Subido desde el panel'
  where id = p_id and organization_id = p_org
  returning * into v_row;
  return jsonb_build_object('asset', app.media_json(v_row),
    'removed', case when v_old.storage_prefix is not null and v_old.storage_prefix <> v_row.storage_prefix
                    then jsonb_build_array(v_old.storage_prefix) else '[]'::jsonb end);
end $$;

create or replace function public.update_media(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare v_row public.media_assets;
begin
  perform app.require_role(p_org);
  update public.media_assets set title = left(coalesce(p_data ->> 'title', title), 120),
    alt = left(coalesce(p_data ->> 'alt', alt), 240),
    focal_x = coalesce((p_data ->> 'focalX')::smallint, focal_x), focal_y = coalesce((p_data ->> 'focalY')::smallint, focal_y)
  where id = (p_data ->> 'id')::uuid and organization_id = p_org
  returning * into v_row;
  if v_row.id is null then raise exception 'not_found: Archivo inexistente.'; end if;
  return app.media_json(v_row);
end $$;

-- Devuelve las carpetas de Storage a borrar. Rechaza archivos en uso.
create or replace function public.delete_media(p_org uuid, p_id uuid) returns jsonb
language plpgsql as $$
declare
  v_row public.media_assets;
  v_usage text;
begin
  perform app.require_role(p_org);
  select string_agg(x, ', ') into v_usage from (
    select p.name as x from public.product_media m join public.menu_products p on p.id = m.product_id where m.asset_id = p_id
    union select 'categoría ' || name from public.menu_categories where image_asset_id = p_id
    union select 'promoción ' || title from public.promotions where image_asset_id = p_id or video_asset_id = p_id
    union select 'portada o logotipo' from public.organization_settings
      where p_id in (logo_asset_id, cover_image_asset_id, cover_video_asset_id)) u;
  if v_usage is not null then raise exception 'conflict: El archivo está en uso: %.', v_usage; end if;
  delete from public.media_assets where id = p_id and organization_id = p_org returning * into v_row;
  if v_row.id is null then raise exception 'not_found: Archivo inexistente.'; end if;
  return case when v_row.storage_prefix is null then '[]'::jsonb else jsonb_build_array(v_row.storage_prefix) end;
end $$;

/* ------------------------------------------------- configuración y QR */

create or replace function public.save_settings(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare v_row public.organization_settings;
begin
  perform app.require_role(p_org);
  update public.organization_settings set
    tagline = coalesce(p_data ->> 'tagline', ''), intro = coalesce(p_data ->> 'intro', ''),
    logo_asset_id = nullif(p_data ->> 'logoAssetId', '')::uuid,
    cover_image_asset_id = nullif(p_data ->> 'coverImageAssetId', '')::uuid,
    cover_video_asset_id = nullif(p_data ->> 'coverVideoAssetId', '')::uuid,
    show_cover = coalesce((p_data ->> 'showCover')::boolean, true), address = coalesce(p_data ->> 'address', ''),
    city = coalesce(p_data ->> 'city', ''), phone = coalesce(p_data ->> 'phone', ''),
    instagram = coalesce(p_data ->> 'instagram', ''), website = coalesce(p_data ->> 'website', ''),
    hours = coalesce(p_data -> 'hours', '[]'), menu_published = coalesce((p_data ->> 'menuPublished')::boolean, false),
    section_order = coalesce(array(select jsonb_array_elements_text(p_data -> 'sectionOrder')), section_order)
    -- features NO se toma del cliente: lo controla NOVANTIQ.
  where organization_id = p_org
  returning * into v_row;
  if v_row.organization_id is null then raise exception 'not_found: Configuración inexistente.'; end if;
  return app.settings_json(v_row);
end $$;

create or replace function public.save_theme(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare v_row public.menu_themes;
begin
  perform app.require_role(p_org);
  update public.menu_themes set preset = coalesce(p_data ->> 'preset', 'custom'), colors = p_data -> 'colors',
    font_display = p_data ->> 'fontDisplay', font_body = p_data ->> 'fontBody', card_style = p_data ->> 'cardStyle',
    category_nav_style = p_data ->> 'categoryNavStyle', promo_style = p_data ->> 'promoStyle',
    cover_layout = p_data ->> 'coverLayout'
  where organization_id = p_org
  returning * into v_row;
  if v_row.organization_id is null then raise exception 'not_found: Tema inexistente.'; end if;
  return app.theme_json(v_row);
end $$;

create or replace function public.create_qr_code(p_org uuid, p_label text, p_table text default null) returns jsonb
language plpgsql as $$
declare v_row public.qr_codes;
begin
  perform app.require_role(p_org);
  insert into public.qr_codes (organization_id, label, token, table_label)
  values (p_org, left(coalesce(nullif(trim(p_label), ''), 'QR'), 60),
          substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 12),
          nullif(trim(coalesce(p_table, '')), ''))
  returning * into v_row;
  return app.qr_json(v_row);
end $$;

create or replace function public.revoke_qr_code(p_org uuid, p_id uuid) returns void
language plpgsql as $$
begin
  perform app.require_role(p_org);
  update public.qr_codes set revoked_at = now() where id = p_id and organization_id = p_org and revoked_at is null;
  if not found then raise exception 'not_found: QR inexistente o ya revocado.'; end if;
end $$;

/* ------------------------------------------------------------ analítica */

create or replace function public.analytics_summary(p_org uuid, p_days int) returns jsonb
language plpgsql stable as $$
declare v_since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 365));
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  return jsonb_build_object(
    'since', v_since,
    'days', p_days,
    'totals', (select jsonb_object_agg(t, coalesce(c, 0)) from unnest(array['menu_view', 'qr_scan', 'category_view',
                 'product_view', 'media_play', 'spin_interact', 'model_open', 'search', 'promo_click']) t
               left join (select type, count(*) c from public.menu_analytics where organization_id = p_org and occurred_at >= v_since group by type) a on a.type = t),
    'sessions', (select count(distinct session_id) from public.menu_analytics where organization_id = p_org and occurred_at >= v_since),
    'topProducts', coalesce((select jsonb_agg(jsonb_build_object('productId', product_id, 'views', n) order by n desc) from (
        select product_id, count(*) n from public.menu_analytics where organization_id = p_org and occurred_at >= v_since
          and type = 'product_view' and product_id is not null group by product_id order by n desc limit 8) x), '[]'),
    'topCategories', coalesce((select jsonb_agg(jsonb_build_object('categoryId', category_id, 'views', n) order by n desc) from (
        select category_id, count(*) n from public.menu_analytics where organization_id = p_org and occurred_at >= v_since
          and type = 'category_view' and category_id is not null group by category_id order by n desc limit 8) x), '[]'),
    'topSearches', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'count', n) order by n desc) from (
        select query, count(*) n from public.menu_analytics where organization_id = p_org and occurred_at >= v_since
          and type = 'search' and query is not null group by query order by n desc limit 8) x), '[]'),
    'byDay', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'menuViews', mv, 'productViews', pv) order by d) from (
        select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD') d,
               count(*) filter (where type = 'menu_view') mv, count(*) filter (where type = 'product_view') pv
          from public.menu_analytics where organization_id = p_org and occurred_at >= v_since group by 1) x), '[]'));
end $$;

/* ========================================== importación / demo / plantillas */

-- Carga un "bundle" (misma forma que OrganizationBundle) reemplazando el
-- catálogo de la organización. Uso interno: seed, reinicio de demo y
-- creación de cafeterías a partir de una plantilla.
create or replace function app.import_bundle(p_org uuid, b jsonb) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  perform set_config('app.bulk', 'on', true);
  delete from public.menu_analytics where organization_id = p_org;
  delete from public.promotions where organization_id = p_org;
  delete from public.combo_items where organization_id = p_org;
  delete from public.product_option_links where organization_id = p_org;
  delete from public.product_media where organization_id = p_org;
  delete from public.menu_products where organization_id = p_org;
  delete from public.option_groups where organization_id = p_org;
  delete from public.menu_badges where organization_id = p_org;
  update public.organization_settings set logo_asset_id = null, cover_image_asset_id = null, cover_video_asset_id = null where organization_id = p_org;
  delete from public.menu_categories where organization_id = p_org;
  delete from public.qr_codes where organization_id = p_org;
  delete from public.media_assets where organization_id = p_org;

  insert into public.media_assets (id, organization_id, kind, title, alt, url, variants, placeholder, poster_url, frames,
    mime_type, bytes, width, height, focal_x, focal_y, credit)
  select (m ->> 'id')::uuid, p_org, m ->> 'kind', m ->> 'title', m ->> 'alt', m ->> 'url', coalesce(m -> 'variants', '[]'),
         m ->> 'placeholder', m ->> 'posterUrl', coalesce(m -> 'frames', '[]'), m ->> 'mimeType',
         coalesce((m ->> 'bytes')::bigint, 0), (m ->> 'width')::int, (m ->> 'height')::int,
         coalesce((m ->> 'focalX')::smallint, 50), coalesce((m ->> 'focalY')::smallint, 50), coalesce(m ->> 'credit', '')
    from jsonb_array_elements(b -> 'media') m;

  insert into public.organization_settings (organization_id) values (p_org) on conflict do nothing;
  update public.organization_settings s set
    tagline = x.tagline, intro = x.intro, logo_asset_id = x."logoAssetId", cover_image_asset_id = x."coverImageAssetId",
    cover_video_asset_id = x."coverVideoAssetId", show_cover = x."showCover", address = x.address, city = x.city,
    phone = x.phone, instagram = x.instagram, website = x.website, hours = x.hours, currency = x.currency,
    locale = x.locale, time_zone = x."timeZone", features = x.features, menu_published = x."menuPublished",
    section_order = array(select jsonb_array_elements_text(x."sectionOrder"))
  from jsonb_to_record(b -> 'settings') as x(tagline text, intro text, "logoAssetId" uuid, "coverImageAssetId" uuid,
    "coverVideoAssetId" uuid, "showCover" boolean, address text, city text, phone text, instagram text, website text,
    hours jsonb, currency text, locale text, "timeZone" text, features jsonb, "menuPublished" boolean, "sectionOrder" jsonb)
  where s.organization_id = p_org;

  insert into public.menu_themes (organization_id, preset, colors, font_display, font_body, card_style, category_nav_style, promo_style, cover_layout)
  select p_org, x.preset, x.colors, x."fontDisplay", x."fontBody", x."cardStyle", x."categoryNavStyle", x."promoStyle", x."coverLayout"
    from jsonb_to_record(b -> 'theme') as x(preset text, colors jsonb, "fontDisplay" text, "fontBody" text, "cardStyle" text,
      "categoryNavStyle" text, "promoStyle" text, "coverLayout" text)
  on conflict (organization_id) do update set preset = excluded.preset, colors = excluded.colors,
    font_display = excluded.font_display, font_body = excluded.font_body, card_style = excluded.card_style,
    category_nav_style = excluded.category_nav_style, promo_style = excluded.promo_style, cover_layout = excluded.cover_layout;

  insert into public.menu_badges (organization_id, key, label, tone, requires_evidence, position)
  select p_org, x ->> 'key', x ->> 'label', x ->> 'tone', (x ->> 'requiresEvidence')::boolean, n::int - 1
    from jsonb_array_elements(b -> 'badges') with ordinality as t(x, n);

  insert into public.menu_categories (id, organization_id, name, slug, description, image_asset_id, position, visible, layout)
  select (c ->> 'id')::uuid, p_org, c ->> 'name', c ->> 'slug', c ->> 'description', (c ->> 'imageAssetId')::uuid,
         (c ->> 'position')::int, (c ->> 'visible')::boolean, c ->> 'layout'
    from jsonb_array_elements(b -> 'categories') c;

  insert into public.option_groups (id, organization_id, name, internal_name, required, min_select, max_select)
  select (g ->> 'id')::uuid, p_org, g ->> 'name', g ->> 'internalName', (g ->> 'required')::boolean,
         (g ->> 'minSelect')::int, (g ->> 'maxSelect')::int
    from jsonb_array_elements(b -> 'optionGroups') g;
  insert into public.option_choices (id, group_id, organization_id, name, price_delta_cents, available, is_default, position)
  select (o ->> 'id')::uuid, (g ->> 'id')::uuid, p_org, o ->> 'name', (o ->> 'priceDelta')::bigint,
         (o ->> 'available')::boolean, (o ->> 'isDefault')::boolean, (o ->> 'position')::int
    from jsonb_array_elements(b -> 'optionGroups') g, jsonb_array_elements(g -> 'options') o;

  insert into public.menu_products (id, organization_id, category_id, kind, name, slug, description, story, price_cents,
    status, available, position, badges, tags, allergens, ingredients, size, portion, prep_minutes, food_info,
    display_mode, pairing_ids, related_ids, station)
  select (p ->> 'id')::uuid, p_org, (p ->> 'categoryId')::uuid, p ->> 'kind', p ->> 'name', p ->> 'slug',
         p ->> 'description', p ->> 'story', (p ->> 'price')::bigint, p ->> 'status', (p ->> 'available')::boolean,
         (p ->> 'position')::int,
         array(select jsonb_array_elements_text(p -> 'badges')), array(select jsonb_array_elements_text(p -> 'tags')),
         array(select jsonb_array_elements_text(p -> 'allergens')), array(select jsonb_array_elements_text(p -> 'ingredients')),
         p ->> 'size', p ->> 'portion', (p ->> 'prepMinutes')::int, p ->> 'foodInfo', p ->> 'displayMode',
         array(select jsonb_array_elements_text(p -> 'pairingIds')::uuid), array(select jsonb_array_elements_text(p -> 'relatedIds')::uuid),
         p ->> 'station'
    from jsonb_array_elements(b -> 'products') p;

  insert into public.product_media (product_id, organization_id, asset_id, role, position)
  select (p ->> 'id')::uuid, p_org, (m ->> 'assetId')::uuid, m ->> 'role', (m ->> 'position')::int
    from jsonb_array_elements(b -> 'products') p, jsonb_array_elements(p -> 'media') m;
  insert into public.product_option_links (product_id, group_id, organization_id, position, overrides)
  select (p ->> 'id')::uuid, (l ->> 'groupId')::uuid, p_org, (l ->> 'position')::int, l -> 'overrides'
    from jsonb_array_elements(b -> 'products') p, jsonb_array_elements(p -> 'optionGroups') l;
  insert into public.combo_items (combo_id, product_id, organization_id, quantity, substitute_ids, position)
  select (p ->> 'id')::uuid, (c ->> 'productId')::uuid, p_org, (c ->> 'quantity')::int,
         array(select jsonb_array_elements_text(c -> 'substituteIds')::uuid), n::int - 1
    from jsonb_array_elements(b -> 'products') p, jsonb_array_elements(p -> 'comboItems') with ordinality as t(c, n);

  insert into public.promotions (id, organization_id, title, description, kind, percent_off, product_ids, image_asset_id,
    video_asset_id, starts_at, ends_at, days, start_time, end_time, active, conditions, position)
  select (p ->> 'id')::uuid, p_org, p ->> 'title', p ->> 'description', p ->> 'kind', (p ->> 'percentOff')::int,
         array(select jsonb_array_elements_text(p -> 'productIds')::uuid), (p ->> 'imageAssetId')::uuid,
         (p ->> 'videoAssetId')::uuid, (p ->> 'startsAt')::timestamptz, (p ->> 'endsAt')::timestamptz,
         array(select jsonb_array_elements_text(p -> 'days')::smallint), p ->> 'startTime', p ->> 'endTime',
         (p ->> 'active')::boolean, p ->> 'conditions', (p ->> 'position')::int
    from jsonb_array_elements(b -> 'promotions') p;

  insert into public.qr_codes (id, organization_id, label, token, table_label)
  select (q ->> 'id')::uuid, p_org, q ->> 'label', q ->> 'token', q ->> 'tableLabel'
    from jsonb_array_elements(b -> 'qrCodes') q;

  perform set_config('app.bulk', 'off', true);
end $$;

create or replace function public.reset_demo_organization(p_org uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_bundle jsonb;
begin
  perform app.require_role(p_org, array['owner']);
  if not exists (select 1 from public.organizations where id = p_org and is_demo) then
    raise exception 'forbidden: Solo se pueden reiniciar organizaciones de demostración.';
  end if;
  select bundle into v_bundle from app.demo_snapshots where organization_id = p_org;
  if v_bundle is null then raise exception 'not_found: No hay una copia original de esta demo.'; end if;
  perform app.import_bundle(p_org, v_bundle);
end $$;

-- Alta de una cafetería nueva a partir de una plantilla (p. ej. la demo).
-- Solo NOVANTIQ (platform admin) o la consola SQL con service role.
create or replace function app.create_organization(p_slug text, p_name text, p_owner_email text, p_template_org uuid default null)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid;
  v_owner uuid;
  v_bundle jsonb;
begin
  if auth.uid() is not null and not app.is_platform_admin() then
    raise exception 'forbidden: Solo NOVANTIQ puede crear cafeterías.';
  end if;
  select id into v_owner from auth.users where lower(email) = lower(p_owner_email);
  if v_owner is null then raise exception 'not_found: El usuario % no existe en Auth. Crealo primero.', p_owner_email; end if;
  insert into public.organizations (slug, name) values (p_slug, p_name) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_owner, 'owner');
  if p_template_org is not null then
    v_bundle := public.admin_bundle_internal(p_template_org);
    perform app.import_bundle(v_org, app.reidentify_bundle(v_bundle));
    -- El contenido copiado arranca sin publicar para que el local lo revise.
    update public.organization_settings set menu_published = false where organization_id = v_org;
  else
    insert into public.organization_settings (organization_id) values (v_org);
    insert into public.menu_themes (organization_id, colors, font_display, font_body)
    values (v_org, '{"background":"#F3ECE2","surface":"#FBF8F3","ink":"#1E1611","muted":"#6A5A4F","accent":"#8E5426","accentInk":"#FFF8EF","line":"#E2D6C6"}', 'Fraunces', 'Manrope');
  end if;
  return v_org;
end $$;

-- Bundle sin chequeo de rol (solo para uso interno desde funciones definer).
create or replace function public.admin_bundle_internal(p_org uuid) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'settings', (select app.settings_json(s) from public.organization_settings s where s.organization_id = p_org),
    'theme', (select app.theme_json(t) from public.menu_themes t where t.organization_id = p_org),
    'badges', app.badges_json(p_org),
    'categories', coalesce((select jsonb_agg(app.category_json(c)) from public.menu_categories c where c.organization_id = p_org), '[]'),
    'products', coalesce((select jsonb_agg(app.product_json(p)) from public.menu_products p where p.organization_id = p_org), '[]'),
    'optionGroups', coalesce((select jsonb_agg(app.group_json(g)) from public.option_groups g where g.organization_id = p_org), '[]'),
    'promotions', coalesce((select jsonb_agg(app.promotion_json(p)) from public.promotions p where p.organization_id = p_org), '[]'),
    'media', coalesce((select jsonb_agg(app.media_json(m)) from public.media_assets m where m.organization_id = p_org), '[]'),
    'qrCodes', '[]'::jsonb);
$$;
revoke execute on function public.admin_bundle_internal(uuid) from public, anon, authenticated;

-- Reemplaza todos los uuid del bundle por nuevos (copias independientes).
create or replace function app.reidentify_bundle(b jsonb) returns jsonb
language plpgsql volatile as $$
declare
  v_text text := b::text;
  v_id text;
begin
  for v_id in select distinct m[1] from regexp_matches(b::text, '"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', 'g') as m loop
    v_text := replace(v_text, v_id, gen_random_uuid()::text);
  end loop;
  return v_text::jsonb;
end $$;

/* ============================================================ permisos */

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on function public.public_menu(text) to anon, authenticated;
grant execute on function public.track_menu_event(text, text, text, uuid, uuid, uuid, text, text) to anon, authenticated;
grant execute on function
  public.my_memberships(), public.admin_bundle(uuid), public.save_category(uuid, jsonb), public.delete_category(uuid, uuid),
  public.reorder_categories(uuid, uuid[]), public.save_product(uuid, jsonb), public.duplicate_product(uuid, uuid),
  public.reorder_products(uuid, uuid, uuid[]), public.save_option_group(uuid, jsonb), public.delete_option_group(uuid, uuid),
  public.save_promotion(uuid, jsonb), public.delete_promotion(uuid, uuid), public.register_media(uuid, jsonb),
  public.replace_media_files(uuid, uuid, jsonb), public.update_media(uuid, jsonb), public.delete_media(uuid, uuid),
  public.save_settings(uuid, jsonb), public.save_theme(uuid, jsonb), public.create_qr_code(uuid, text, text),
  public.revoke_qr_code(uuid, uuid), public.analytics_summary(uuid, int), public.reset_demo_organization(uuid)
  to authenticated;
grant execute on function app.keep_ids(uuid[], uuid[]), app.media_json(public.media_assets), app.category_json(public.menu_categories),
  app.product_json(public.menu_products, uuid[]), app.group_json(public.option_groups), app.promotion_json(public.promotions, uuid[]),
  app.settings_json(public.organization_settings), app.theme_json(public.menu_themes), app.qr_json(public.qr_codes),
  app.org_json(public.organizations), app.badges_json(uuid), app.unique_slug(text, text[]),
  app.assert_products_in_org(uuid, uuid[]), app.assert_media_urls(uuid, jsonb), app.valid_theme_colors(jsonb)
  to authenticated;
