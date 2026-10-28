-- NOVANTIQ COFFEE · se retira la vista 360° (secuencias de imágenes).
-- Limpia los datos existentes y deja de aceptar el tipo 'spin'.
-- Después de aplicarla, volver a ejecutar supabase/seed.sql para que la
-- copia de la demo (app.demo_snapshots) tampoco tenga secuencias 360°.

delete from public.product_media
 where role = 'spin'
    or asset_id in (select id from public.media_assets where kind = 'spin');

update public.menu_products set display_mode = 'photo' where display_mode = 'spin';

delete from public.menu_analytics where type = 'spin_interact';

-- Los archivos en Storage quedan huérfanos: borrarlos a mano desde el panel de
-- Supabase si se quiere recuperar el espacio (ver storage_prefix de cada fila).
delete from public.media_assets where kind = 'spin';

alter table public.media_assets drop constraint media_assets_kind_check;
alter table public.media_assets add constraint media_assets_kind_check check (kind in ('image', 'video'));

alter table public.menu_products drop constraint menu_products_display_mode_check;
alter table public.menu_products add constraint menu_products_display_mode_check
  check (display_mode in ('photo', 'gallery', 'video'));

alter table public.product_media drop constraint product_media_role_check;
alter table public.product_media add constraint product_media_role_check
  check (role in ('primary', 'gallery', 'video'));

alter table public.menu_analytics drop constraint menu_analytics_type_check;
alter table public.menu_analytics add constraint menu_analytics_type_check check (type in (
  'menu_view', 'qr_scan', 'category_view', 'product_view', 'media_play', 'search', 'promo_click'
));

create or replace function public.register_media(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare v_row public.media_assets;
begin
  perform app.require_role(p_org);
  perform app.assert_media_urls(p_org, p_data);
  if (p_data ->> 'kind') not in ('image', 'video') then raise exception 'invalid: Tipo de archivo no admitido.'; end if;
  if (p_data ->> 'kind') = 'video' and (p_data ->> 'bytes')::bigint > 40 * 1024 * 1024 then raise exception 'invalid: El video supera 40 MB.'; end if;
  insert into public.media_assets (id, organization_id, kind, title, alt, url, storage_prefix, variants, placeholder,
    poster_url, mime_type, bytes, width, height, credit)
  values ((p_data ->> 'id')::uuid, p_org, p_data ->> 'kind', left(coalesce(p_data ->> 'title', ''), 120),
    left(coalesce(p_data ->> 'alt', ''), 240), p_data ->> 'url', p_data ->> 'storagePrefix',
    coalesce(p_data -> 'variants', '[]'), p_data ->> 'placeholder', p_data ->> 'posterUrl',
    coalesce(p_data ->> 'mimeType', ''), coalesce((p_data ->> 'bytes')::bigint, 0), (p_data ->> 'width')::int,
    (p_data ->> 'height')::int, 'Subido desde el panel')
  returning * into v_row;
  return app.media_json(v_row);
end $$;

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
  if p_type not in ('menu_view', 'qr_scan', 'category_view', 'product_view', 'media_play', 'search', 'promo_click') then
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

create or replace function public.analytics_summary(p_org uuid, p_days int) returns jsonb
language plpgsql stable as $$
declare v_since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 365));
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  return jsonb_build_object(
    'since', v_since,
    'days', p_days,
    'totals', (select jsonb_object_agg(t, coalesce(c, 0)) from unnest(array['menu_view', 'qr_scan', 'category_view',
                 'product_view', 'media_play', 'search', 'promo_click']) t
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
