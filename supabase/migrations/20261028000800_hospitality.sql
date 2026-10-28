-- NOVANTIQ COFFEE · contacto, idiomas, tarjeta de fidelidad y servicio de mesa.
--
-- 1. Datos del local: WhatsApp, reseñas, mapa, idiomas y traducciones.
-- 2. Tarjeta de sellos anónima: el cliente obtiene un código desde la carta
--    (sin registrarse) y el personal suma sellos o canjea premios desde el panel.
-- 3. "Llamar al mozo" y "Pedir la cuenta" desde un QR de mesa.
--
-- Las funciones originales de carta, panel e importación se conservan con
-- sufijo _v1 en el esquema app; las nuevas las envuelven y agregan lo nuevo.
-- Después de aplicarla, volver a ejecutar supabase/seed.sql.

/* ------------------------------------------------- datos del local */

alter table public.organization_settings
  add column whatsapp text not null default '' check (whatsapp ~ '^[+0-9 ()-]{0,30}$'),
  add column review_url text not null default '' check (review_url = '' or (review_url ~ '^https://' and char_length(review_url) <= 500)),
  add column maps_url text not null default '' check (maps_url = '' or (maps_url ~ '^https://' and char_length(maps_url) <= 500)),
  add column table_service boolean not null default false,
  add column languages text[] not null default '{}' check (languages <@ array['en', 'pt']::text[]),
  add column translations jsonb not null default '{}' check (jsonb_typeof(translations) = 'object' and octet_length(translations::text) <= 400000);

-- Solo idiomas conocidos, claves razonables y textos no vacíos.
create or replace function app.clean_translations(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(l.key, (
           select coalesce(jsonb_object_agg(e.key, left(e.value #>> '{}', 1000)), '{}'::jsonb)
             from jsonb_each(l.value) e
            where jsonb_typeof(e.value) = 'string' and char_length(e.key) <= 160
              and nullif(trim(e.value #>> '{}'), '') is not null)), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) l
   where l.key in ('en', 'pt') and jsonb_typeof(l.value) = 'object';
$$;

create or replace function app.clean_languages(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct x order by x), '{}')
    from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
   where x in ('en', 'pt');
$$;

create or replace function app.settings_json(s public.organization_settings) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'organizationId', s.organization_id, 'tagline', s.tagline, 'intro', s.intro, 'logoAssetId', s.logo_asset_id,
    'coverImageAssetId', s.cover_image_asset_id, 'coverVideoAssetId', s.cover_video_asset_id, 'showCover', s.show_cover,
    'address', s.address, 'city', s.city, 'phone', s.phone, 'instagram', s.instagram, 'website', s.website,
    'whatsapp', s.whatsapp, 'reviewUrl', s.review_url, 'mapsUrl', s.maps_url, 'tableService', s.table_service,
    'languages', to_jsonb(s.languages), 'translations', s.translations,
    'hours', s.hours, 'currency', s.currency, 'locale', s.locale, 'timeZone', s.time_zone, 'features', s.features,
    'menuPublished', s.menu_published, 'sectionOrder', to_jsonb(s.section_order), 'updatedAt', s.updated_at);
$$;

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
    whatsapp = coalesce(p_data ->> 'whatsapp', ''), review_url = coalesce(p_data ->> 'reviewUrl', ''),
    maps_url = coalesce(p_data ->> 'mapsUrl', ''), table_service = coalesce((p_data ->> 'tableService')::boolean, false),
    languages = app.clean_languages(p_data -> 'languages'),
    translations = app.clean_translations(p_data -> 'translations'),
    hours = coalesce(p_data -> 'hours', '[]'), menu_published = coalesce((p_data ->> 'menuPublished')::boolean, false),
    section_order = coalesce(array(select x from jsonb_array_elements_text(p_data -> 'sectionOrder') x
                                   where x in ('promotions', 'loyalty', 'featured', 'categories')), section_order),
    updated_at = now()
    -- features NO se toma del cliente: lo controla NOVANTIQ.
  where organization_id = p_org
  returning * into v_row;
  if v_row.organization_id is null then raise exception 'not_found: Configuración inexistente.'; end if;
  return app.settings_json(v_row);
end $$;

/* ------------------------------------------------- programa de fidelidad */

create or replace function app.loyalty_json(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'organizationId', p_org, 'active', coalesce(lp.active, false), 'name', coalesce(lp.name, 'Tarjeta de fidelidad'),
    'stampsForReward', coalesce((lp.rules ->> 'stampsForReward')::int, 8),
    'reward', coalesce(lp.rules ->> 'reward', 'Un café de regalo'), 'terms', coalesce(lp.rules ->> 'terms', ''))
  from (select 1) d left join public.loyalty_programs lp on lp.organization_id = p_org;
$$;

create or replace function app.loyalty_goal(p_org uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (rules ->> 'stampsForReward')::int from public.loyalty_programs where organization_id = p_org), 8);
$$;

create or replace function public.save_loyalty_program(p_org uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_stamps int := (p_data ->> 'stampsForReward')::int;
  v_name text := trim(coalesce(p_data ->> 'name', ''));
  v_reward text := trim(coalesce(p_data ->> 'reward', ''));
  v_terms text := trim(coalesce(p_data ->> 'terms', ''));
begin
  perform app.require_role(p_org);
  if v_stamps is null or v_stamps not between 3 and 20 then raise exception 'invalid: La tarjeta necesita entre 3 y 20 sellos.'; end if;
  if char_length(v_name) not between 1 and 40 then raise exception 'invalid: El nombre debe tener entre 1 y 40 caracteres.'; end if;
  if char_length(v_reward) not between 1 and 80 then raise exception 'invalid: Indicá el premio (hasta 80 caracteres).'; end if;
  if char_length(v_terms) > 400 then raise exception 'invalid: Las condiciones admiten hasta 400 caracteres.'; end if;
  insert into public.loyalty_programs (organization_id, name, active, rules)
  values (p_org, v_name, coalesce((p_data ->> 'active')::boolean, false),
          jsonb_build_object('stampsForReward', v_stamps, 'reward', v_reward, 'terms', v_terms))
  on conflict (organization_id) do update set name = excluded.name, active = excluded.active, rules = excluded.rules;
  return app.loyalty_json(p_org);
end $$;

/* --------------------------------------- carta, panel e importación */

alter function public.public_menu(text) rename to public_menu_v1;
alter function public.public_menu_v1(text) set schema app;
alter function public.admin_bundle(uuid) rename to admin_bundle_v1;
alter function public.admin_bundle_v1(uuid) set schema app;
alter function public.admin_bundle_internal(uuid) rename to admin_bundle_internal_v1;
alter function public.admin_bundle_internal_v1(uuid) set schema app;
alter function app.import_bundle(uuid, jsonb) rename to import_bundle_v1;

create function public.public_menu(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v jsonb := app.public_menu_v1(p_slug);
  v_org uuid;
  v_on boolean;
begin
  if v is null then return null; end if;
  v_org := (v -> 'organization' ->> 'id')::uuid;
  select coalesce((s.features ->> 'loyalty')::boolean, false)
         and exists (select 1 from public.loyalty_programs lp where lp.organization_id = v_org and lp.active)
    into v_on from public.organization_settings s where s.organization_id = v_org;
  return v || jsonb_build_object('loyalty', case when v_on then app.loyalty_json(v_org) end);
end $$;

create function public.admin_bundle(p_org uuid) returns jsonb
language plpgsql stable as $$
begin
  return app.admin_bundle_v1(p_org) || jsonb_build_object('loyalty', app.loyalty_json(p_org));
end $$;

create function public.admin_bundle_internal(p_org uuid) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select app.admin_bundle_internal_v1(p_org) || jsonb_build_object('loyalty', app.loyalty_json(p_org));
$$;

create function app.import_bundle(p_org uuid, b jsonb) returns void
language plpgsql security definer set search_path = public, app as $$
declare l jsonb := b -> 'loyalty';
begin
  perform app.import_bundle_v1(p_org, b);
  update public.organization_settings set
    whatsapp = coalesce(b -> 'settings' ->> 'whatsapp', ''), review_url = coalesce(b -> 'settings' ->> 'reviewUrl', ''),
    maps_url = coalesce(b -> 'settings' ->> 'mapsUrl', ''),
    table_service = coalesce((b -> 'settings' ->> 'tableService')::boolean, false),
    languages = app.clean_languages(b -> 'settings' -> 'languages'),
    translations = app.clean_translations(b -> 'settings' -> 'translations')
  where organization_id = p_org;
  if l is not null and jsonb_typeof(l) = 'object' then
    insert into public.loyalty_programs (organization_id, name, active, rules)
    values (p_org, coalesce(l ->> 'name', 'Tarjeta de fidelidad'), coalesce((l ->> 'active')::boolean, false),
            jsonb_build_object('stampsForReward', coalesce((l ->> 'stampsForReward')::int, 8),
                               'reward', coalesce(l ->> 'reward', ''), 'terms', coalesce(l ->> 'terms', '')))
    on conflict (organization_id) do update set name = excluded.name, active = excluded.active, rules = excluded.rules;
  end if;
end $$;

/* --------------------------------------------- tarjeta del cliente */

-- Organización que ofrece la tarjeta (activa, publicada, módulo y programa activos).
create or replace function app.loyalty_org(p_slug text) returns uuid
language sql stable security definer set search_path = public as $$
  select o.id from public.organizations o
    join public.organization_settings s on s.organization_id = o.id
    join public.loyalty_programs lp on lp.organization_id = o.id and lp.active
   where o.slug = p_slug and o.status = 'active' and s.menu_published
     and coalesce((s.features ->> 'loyalty')::boolean, false);
$$;

create or replace function app.loyalty_card_json(m public.loyalty_memberships) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'code', m.member_code, 'stamps', coalesce(sum(t.stamps), 0), 'goal', app.loyalty_goal(m.organization_id),
    'redeemed', count(t.id) filter (where t.kind = 'redeem'), 'createdAt', m.created_at)
  from (select 1) d left join public.loyalty_transactions t on t.membership_id = m.id;
$$;

create or replace function app.loyalty_member_json(m public.loyalty_memberships) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', m.id, 'code', m.member_code, 'stamps', coalesce(sum(t.stamps), 0),
    'redeemed', count(t.id) filter (where t.kind = 'redeem'), 'createdAt', m.created_at,
    'lastVisit', max(t.created_at) filter (where t.kind = 'earn'))
  from (select 1) d left join public.loyalty_transactions t on t.membership_id = m.id;
$$;

-- Alta anónima: un cliente sin datos personales y un código aleatorio.
create or replace function public.loyalty_join(p_slug text) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare
  v_org uuid := app.loyalty_org(p_slug);
  v_customer uuid;
  v_member public.loyalty_memberships;
begin
  if v_org is null then raise exception 'not_found: La tarjeta de fidelidad no está disponible.'; end if;
  -- Límite simple contra abuso: tarjetas nuevas por minuto y local.
  if (select count(*) from public.loyalty_memberships where organization_id = v_org and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'conflict: Demasiadas solicitudes. Probá de nuevo en un minuto.';
  end if;
  insert into public.customers (organization_id) values (v_org) returning id into v_customer;
  insert into public.loyalty_memberships (organization_id, program_id, customer_id, member_code)
  select v_org, lp.id, v_customer,
         substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 20)
    from public.loyalty_programs lp where lp.organization_id = v_org
  returning * into v_member;
  return app.loyalty_card_json(v_member);
end $$;

-- El código es la credencial del cliente: quien lo tiene ve sus sellos.
create or replace function public.loyalty_card(p_slug text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_org uuid := app.loyalty_org(p_slug);
  v_member public.loyalty_memberships;
begin
  if v_org is null or p_code is null or char_length(p_code) > 32 then return null; end if;
  select * into v_member from public.loyalty_memberships where organization_id = v_org and member_code = lower(p_code);
  if not found then return null; end if;
  return app.loyalty_card_json(v_member);
end $$;

/* ----------------------------------------------- tarjeta: personal */

create or replace function app.loyalty_member_for(p_org uuid, p_member uuid) returns public.loyalty_memberships
language plpgsql stable security definer set search_path = public as $$
declare v public.loyalty_memberships;
begin
  select * into v from public.loyalty_memberships where id = p_member and organization_id = p_org;
  if not found then raise exception 'not_found: Tarjeta inexistente.'; end if;
  return v;
end $$;

create or replace function public.loyalty_find_member(p_org uuid, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare v public.loyalty_memberships;
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  select * into v from public.loyalty_memberships
   where organization_id = p_org and member_code = regexp_replace(lower(coalesce(p_code, '')), '[^a-z0-9]', '', 'g');
  if not found then return null; end if;
  return app.loyalty_member_json(v);
end $$;

create or replace function public.loyalty_add_stamps(p_org uuid, p_member uuid, p_stamps int) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v public.loyalty_memberships;
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  if p_stamps is null or p_stamps not between 1 and 5 then raise exception 'invalid: Se pueden sumar de 1 a 5 sellos por vez.'; end if;
  v := app.loyalty_member_for(p_org, p_member);
  insert into public.loyalty_transactions (organization_id, membership_id, kind, stamps, reason, created_by)
  values (p_org, v.id, 'earn', p_stamps, 'Visita', auth.uid());
  return app.loyalty_member_json(v);
end $$;

create or replace function public.loyalty_redeem(p_org uuid, p_member uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare
  v public.loyalty_memberships;
  v_goal int := app.loyalty_goal(p_org);
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  v := app.loyalty_member_for(p_org, p_member);
  perform 1 from public.loyalty_memberships where id = v.id for update;
  if (select coalesce(sum(stamps), 0) from public.loyalty_transactions where membership_id = v.id) < v_goal then
    raise exception 'conflict: La tarjeta todavía no completó los sellos.';
  end if;
  insert into public.loyalty_transactions (organization_id, membership_id, kind, stamps, reason, created_by)
  values (p_org, v.id, 'redeem', -v_goal, 'Canje de premio', auth.uid());
  return app.loyalty_member_json(v);
end $$;

create or replace function public.loyalty_stats(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare v_goal int := app.loyalty_goal(p_org);
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  return jsonb_build_object(
    'members', (select count(*) from public.loyalty_memberships where organization_id = p_org),
    'stampsLast30', (select coalesce(sum(stamps), 0) from public.loyalty_transactions
                      where organization_id = p_org and kind = 'earn' and created_at > now() - interval '30 days'),
    'redeemedLast30', (select count(*) from public.loyalty_transactions
                        where organization_id = p_org and kind = 'redeem' and created_at > now() - interval '30 days'),
    'readyForReward', (select count(*) from (
        select membership_id from public.loyalty_transactions where organization_id = p_org
         group by membership_id having sum(stamps) >= v_goal) x));
end $$;

/* --------------------------------------------------- servicio de mesa */

create or replace function public.qr_table(p_slug text, p_token text) returns text
language sql stable security definer set search_path = public as $$
  select q.table_label from public.qr_codes q
    join public.organizations o on o.id = q.organization_id
    join public.organization_settings s on s.organization_id = o.id
   where o.slug = p_slug and o.status = 'active' and s.menu_published and s.table_service
     and q.token = p_token and q.revoked_at is null and q.table_label is not null;
$$;

-- Pedir la cuenta NO es un pago: solo avisa al personal.
create or replace function public.request_service(p_slug text, p_token text, p_kind text) returns text
language plpgsql volatile security definer set search_path = public, app as $$
declare
  v_qr public.qr_codes;
  v_table uuid;
begin
  if p_kind not in ('assistance', 'bill') then raise exception 'invalid: Solicitud inválida.'; end if;
  select q.* into v_qr from public.qr_codes q
    join public.organizations o on o.id = q.organization_id
    join public.organization_settings s on s.organization_id = o.id
   where o.slug = p_slug and o.status = 'active' and s.menu_published and s.table_service
     and q.token = p_token and q.revoked_at is null and q.table_label is not null;
  if not found then raise exception 'invalid: Escaneá el código QR de tu mesa para usar este servicio.'; end if;
  v_table := v_qr.table_id;
  if v_table is null then
    insert into public.restaurant_tables (organization_id, label) values (v_qr.organization_id, v_qr.table_label)
      on conflict (organization_id, label) do update set label = excluded.label
      returning id into v_table;
    update public.qr_codes set table_id = v_table where id = v_qr.id;
  end if;
  if exists (select 1 from public.service_requests where table_id = v_table and kind = p_kind and status <> 'closed'
             and created_at > now() - interval '30 minutes') then
    return 'already';
  end if;
  if (select count(*) from public.service_requests where organization_id = v_qr.organization_id
      and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'conflict: Demasiadas solicitudes. Probá de nuevo en un minuto.';
  end if;
  insert into public.service_requests (organization_id, table_id, kind) values (v_qr.organization_id, v_table, p_kind);
  return 'sent';
end $$;

create or replace function public.list_service_requests(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'tableLabel', t.label, 'status', r.status,
                                        'createdAt', r.created_at) order by r.created_at)
      from public.service_requests r join public.restaurant_tables t on t.id = r.table_id
     where r.organization_id = p_org and r.status <> 'closed' and r.created_at > now() - interval '12 hours'), '[]');
end $$;

create or replace function public.set_service_request_status(p_org uuid, p_id uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = public, app as $$
begin
  perform app.require_role(p_org, array['owner', 'admin', 'staff']);
  if p_status not in ('acknowledged', 'closed') then raise exception 'invalid: Estado inválido.'; end if;
  update public.service_requests set status = p_status, handled_by = auth.uid(), handled_at = now()
   where id = p_id and organization_id = p_org;
  if not found then raise exception 'not_found: Aviso inexistente.'; end if;
end $$;

/* ------------------------------------------------------------ permisos */

revoke execute on function
  app.public_menu_v1(text), app.admin_bundle_internal_v1(uuid), public.admin_bundle_internal(uuid),
  app.import_bundle_v1(uuid, jsonb), app.import_bundle(uuid, jsonb), app.loyalty_org(text),
  app.loyalty_card_json(public.loyalty_memberships), app.loyalty_member_json(public.loyalty_memberships),
  app.loyalty_member_for(uuid, uuid), app.loyalty_json(uuid), app.loyalty_goal(uuid),
  app.clean_translations(jsonb), app.clean_languages(jsonb),
  public.public_menu(text), public.admin_bundle(uuid), public.save_settings(uuid, jsonb), public.save_loyalty_program(uuid, jsonb),
  public.loyalty_join(text), public.loyalty_card(text, text), public.loyalty_find_member(uuid, text),
  public.loyalty_add_stamps(uuid, uuid, int), public.loyalty_redeem(uuid, uuid), public.loyalty_stats(uuid),
  public.qr_table(text, text), public.request_service(text, text, text), public.list_service_requests(uuid),
  public.set_service_request_status(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.public_menu(text), public.loyalty_join(text), public.loyalty_card(text, text),
  public.qr_table(text, text), public.request_service(text, text, text)
to anon, authenticated;

grant execute on function
  public.admin_bundle(uuid), app.admin_bundle_v1(uuid), app.loyalty_json(uuid), app.clean_translations(jsonb),
  app.clean_languages(jsonb), public.save_settings(uuid, jsonb), public.save_loyalty_program(uuid, jsonb),
  public.loyalty_find_member(uuid, text), public.loyalty_add_stamps(uuid, uuid, int), public.loyalty_redeem(uuid, uuid),
  public.loyalty_stats(uuid), public.list_service_requests(uuid), public.set_service_request_status(uuid, uuid, text)
to authenticated;
