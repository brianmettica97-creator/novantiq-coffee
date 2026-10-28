-- NOVANTIQ COFFEE · Supabase Storage para multimedia de cartas.
-- Estructura de rutas: menu-media/{organization_id}/{asset_id}/{archivo}
-- Lectura pública (la carta es pública); escritura solo para owner/admin de
-- la organización dueña de la carpeta. Tipos y tamaño limitados por bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-media', 'menu-media', true, 41943040,
        array['image/webp', 'image/jpeg', 'image/png', 'image/avif', 'video/mp4', 'video/webm', 'model/gltf-binary'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Primer segmento de la ruta como uuid; null si no es válido.
create or replace function app.storage_org(p_name text) returns uuid
language plpgsql immutable as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;
grant execute on function app.storage_org(text) to authenticated;

create policy menu_media_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'menu-media');

create policy menu_media_editor_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-media' and app.has_org_role(app.storage_org(name), array['owner', 'admin']));

create policy menu_media_editor_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-media' and app.has_org_role(app.storage_org(name), array['owner', 'admin']))
  with check (bucket_id = 'menu-media' and app.has_org_role(app.storage_org(name), array['owner', 'admin']));

create policy menu_media_editor_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-media' and app.has_org_role(app.storage_org(name), array['owner', 'admin']));
