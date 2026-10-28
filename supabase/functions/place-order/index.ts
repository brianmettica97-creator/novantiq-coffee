// Edge Function: place-order  (FASE 6 · preparada, sin interfaz todavía)
//
// Crea un pedido desde la carta. El navegador SOLO envía qué quiere (producto,
// opciones, cantidad, token del QR de mesa); el precio, la disponibilidad y la
// validez se calculan aquí, con el catálogo de la base de datos y el MISMO
// motor de precios que usa la carta (_shared/pricing.ts).
//
// Estado: escrita y revisada, pero NO desplegada ni probada en el runtime de
// Supabase (requiere un proyecto con credenciales). Ver docs/DEPLOYMENT.md.
//
// Requisitos de entorno (los inyecta Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  computePrice, resolveGroups, validateSelection, type PricingGroup, type Selection,
} from '../_shared/pricing.ts';

interface RequestItem {
  productId: string;
  quantity: number;
  selection: Selection;
  notes?: string;
}

interface RequestBody {
  slug: string;
  qrToken: string;
  idempotencyKey: string;
  items: RequestItem[];
  notes?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, apikey', 'access-control-allow-methods': 'POST' } });
  }
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'JSON inválido' });
  }
  if (!body?.slug || !body.qrToken || !/^[\w-]{8,80}$/.test(body.idempotencyKey ?? '') || !Array.isArray(body.items)) {
    return json(400, { error: 'Solicitud incompleta' });
  }
  if (body.items.length === 0 || body.items.length > 30) return json(400, { error: 'El pedido debe tener entre 1 y 30 ítems' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // 1. Cafetería activa, publicada y con pedidos habilitados por plan.
  const { data: org } = await db.from('organizations').select('id, status, organization_settings(menu_published, features, currency, time_zone)').eq('slug', body.slug).single();
  const settings = org?.organization_settings as unknown as { menu_published: boolean; features: { orders?: boolean }; currency: string } | null;
  if (!org || org.status !== 'active' || !settings?.menu_published) return json(404, { error: 'Carta no disponible' });
  if (!settings.features?.orders) return json(403, { error: 'Esta cafetería no recibe pedidos digitales' });

  // 2. El QR debe ser de una mesa de ESTA cafetería y estar vigente.
  const { data: qr } = await db.from('qr_codes').select('table_id, revoked_at').eq('token', body.qrToken).eq('organization_id', org.id).maybeSingle();
  if (!qr || qr.revoked_at || !qr.table_id) return json(403, { error: 'El código QR no corresponde a una mesa habilitada' });

  // 3. Idempotencia: el mismo intento devuelve el pedido ya creado.
  const { data: existing } = await db.from('orders').select('id, status, total_cents').eq('organization_id', org.id).eq('idempotency_key', body.idempotencyKey).maybeSingle();
  if (existing) return json(200, { order: existing, duplicate: true });

  // 4. Catálogo actual desde la base de datos (nunca desde el navegador).
  const { data: menu } = await db.rpc('public_menu', { p_slug: body.slug });
  if (!menu) return json(404, { error: 'Carta no disponible' });
  const groups = menu.optionGroups as PricingGroup[];

  let subtotal = 0;
  let discount = 0;
  const lines = [];
  for (const item of body.items) {
    const product = (menu.products as Array<Record<string, any>>).find((p) => p.id === item.productId);
    if (!product) return json(422, { error: 'Un producto ya no está en la carta' });
    if (!product.available) return json(422, { error: `${product.name} está agotado` });
    const qty = Math.floor(Number(item.quantity));
    if (!(qty >= 1 && qty <= 50)) return json(422, { error: 'Cantidad inválida' });
    const resolved = resolveGroups(groups, product.optionGroups);
    const issues = validateSelection(resolved, item.selection ?? {});
    if (issues.length) return json(422, { error: `${product.name}: ${issues[0].message}` });
    // TODO(fase 6): aplicar promociones vigentes con promotionState() en la zona horaria del local.
    const price = computePrice({ basePrice: product.price, groups: resolved, selection: item.selection, quantity: qty });
    subtotal += price.unitBase * qty + price.unitOptions * qty;
    discount += price.unitDiscount * qty;
    lines.push({
      product_id: product.id, product_name: product.name, unit_price_cents: price.unitTotal, quantity: qty,
      line_total_cents: price.total, station: product.station ?? 'barra', notes: String(item.notes ?? '').slice(0, 200),
      // Foto de las opciones elegidas: el histórico no cambia si cambia el catálogo.
      options_snapshot: resolved.flatMap((g) => (item.selection[g.id] ?? []).map((id) => {
        const o = g.options.find((x) => x.id === id)!;
        return { group: g.name, option: o.name, priceDelta: o.priceDelta };
      })),
    });
  }

  // 5. Inserción. La restricción única (organization_id, idempotency_key)
  //    protege contra dobles envíos concurrentes.
  const { data: order, error } = await db.from('orders').insert({
    organization_id: org.id, table_id: qr.table_id, idempotency_key: body.idempotencyKey, currency: settings.currency,
    subtotal_cents: subtotal, discount_cents: discount, total_cents: subtotal - discount, notes: String(body.notes ?? '').slice(0, 300),
  }).select('id, status, total_cents').single();
  if (error) {
    if (error.code === '23505') {
      const { data: again } = await db.from('orders').select('id, status, total_cents').eq('organization_id', org.id).eq('idempotency_key', body.idempotencyKey).single();
      return json(200, { order: again, duplicate: true });
    }
    return json(500, { error: 'No se pudo registrar el pedido' });
  }
  const { error: itemsError } = await db.from('order_items').insert(lines.map((l) => ({ ...l, order_id: order.id, organization_id: org.id })));
  if (itemsError) {
    await db.from('orders').delete().eq('id', order.id);
    return json(500, { error: 'No se pudo registrar el pedido' });
  }
  await db.from('order_status_history').insert({ order_id: order.id, organization_id: org.id, to_status: 'pending' });
  return json(201, { order });
});
