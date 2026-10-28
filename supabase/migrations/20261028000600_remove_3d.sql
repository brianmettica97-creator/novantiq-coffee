-- NOVANTIQ COFFEE · se retiran los modelos 3D (GLB). La vista 360° se mantiene.
-- Limpia los datos existentes y deja de aceptar el tipo 'model3d'.
-- Después de aplicarla, volver a ejecutar supabase/seed.sql para que la
-- copia de la demo (app.demo_snapshots) tampoco tenga modelos 3D.

delete from public.product_media
 where role = 'model3d'
    or asset_id in (select id from public.media_assets where kind = 'model3d');

update public.menu_products set display_mode = 'photo' where display_mode = 'model3d';

delete from public.menu_analytics where type = 'model_open';

-- Los archivos en Storage quedan huérfanos: borrarlos a mano desde el panel de
-- Supabase si se quiere recuperar el espacio (ver storage_prefix de cada fila).
delete from public.media_assets where kind = 'model3d';

alter table public.media_assets drop constraint media_assets_kind_check;
alter table public.media_assets add constraint media_assets_kind_check
  check (kind in ('image', 'video', 'spin'));

alter table public.menu_products drop constraint menu_products_display_mode_check;
alter table public.menu_products add constraint menu_products_display_mode_check
  check (display_mode in ('photo', 'gallery', 'video', 'spin'));

alter table public.product_media drop constraint product_media_role_check;
alter table public.product_media add constraint product_media_role_check
  check (role in ('primary', 'gallery', 'video', 'spin'));

alter table public.menu_analytics drop constraint menu_analytics_type_check;
alter table public.menu_analytics add constraint menu_analytics_type_check check (type in (
  'menu_view', 'qr_scan', 'category_view', 'product_view', 'media_play',
  'spin_interact', 'search', 'promo_click'
));

update storage.buckets
   set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/avif', 'video/mp4', 'video/webm']
 where id = 'menu-media';

create or replace function public.register_media(p_org uuid, p_data jsonb) returns jsonb
language plpgsql as $$
declare v_row public.media_assets;
begin
  perform app.require_role(p_org);
  perform app.assert_media_urls(p_org, p_data);
  if (p_data ->> 'kind') not in ('image', 'video', 'spin') then raise exception 'invalid: Tipo de archivo no admitido.'; end if;
  if (p_data ->> 'kind') = 'video' and (p_data ->> 'bytes')::bigint > 40 * 1024 * 1024 then raise exception 'invalid: El video supera 40 MB.'; end if;
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
