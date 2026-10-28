// Pruebas de seguridad de la base de datos (RLS, aislamiento multiempresa y
// reglas de negocio en SQL). Corren contra Postgres real (PGlite) con las
// migraciones del repositorio.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';
import { buildMokaStudioBundle } from '../../src/demo/mokaStudio';
import { buildPublicMenu } from '../../src/domain/menu';
import type { OrganizationBundle, Product, PublicMenu } from '../../src/domain/types';

const MOKA = buildMokaStudioBundle().organization.id;
let t: TestDb;
let ownerA: string;
let adminA: string;
let staffA: string;
let ownerB: string;
let orgB: string;

const rpc = async <T>(user: string | null, fn: string, args: unknown[]): Promise<T> => {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  const [row] = await t.as<{ r: T }>(user, `select public.${fn}(${placeholders}) as r`, args);
  return row.r;
};

beforeAll(async () => {
  t = await createTestDb();
  ownerA = await t.createUser('owner@moka.test');
  adminA = await t.createUser('admin@moka.test');
  staffA = await t.createUser('staff@moka.test');
  ownerB = await t.createUser('owner@aurora.test');
  await t.admin(`insert into organization_members (organization_id, user_id, role) values
    ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'staff')`, [MOKA, ownerA, adminA, staffA]);
  // Segunda cafetería creada desde la plantilla de la demo (copia independiente).
  const [row] = await t.admin<{ id: string }>(`select app.create_organization('cafe-aurora', 'Café Aurora', 'owner@aurora.test', $1) as id`, [MOKA]);
  orgB = row.id;
}, 60_000);

describe('carta pública (visitante anónimo)', () => {
  it('coincide exactamente con la regla de publicación del frontend', async () => {
    const sqlMenu = await rpc<PublicMenu>(null, 'public_menu', ['moka-studio']);
    const tsMenu = buildPublicMenu(buildMokaStudioBundle())!;
    const ids = (m: PublicMenu, k: 'products' | 'categories' | 'promotions' | 'media' | 'optionGroups') =>
      m[k].map((x: { id: string }) => x.id).sort();
    for (const k of ['products', 'categories', 'promotions', 'media', 'optionGroups'] as const) {
      expect(ids(sqlMenu, k), k).toEqual(ids(tsMenu, k));
    }
    const cap = sqlMenu.products.find((p) => p.slug === 'cappuccino')!;
    const capTs = tsMenu.products.find((p) => p.slug === 'cappuccino')!;
    expect(cap.price).toBe(capTs.price);
    expect(cap.optionGroups).toEqual(capTs.optionGroups);
    expect(cap.pairingIds).toEqual(capTs.pairingIds);
  });

  it('no incluye borradores, promociones vencidas ni datos internos', async () => {
    const menu = await rpc<PublicMenu & { qrCodes?: unknown }>(null, 'public_menu', ['moka-studio']);
    expect(menu.products.some((p) => p.status !== 'published')).toBe(false);
    expect(menu.promotions.some((p) => p.title === 'Semana del alfajor')).toBe(false);
    expect(menu.qrCodes).toBeUndefined();
    expect(JSON.stringify(menu)).not.toContain('owner@moka.test');
  });

  it('no puede leer tablas directamente ni usar funciones del panel', async () => {
    await expect(t.as(null, 'select * from menu_products')).rejects.toThrow(/permission denied/);
    await expect(t.as(null, 'select * from organization_members')).rejects.toThrow(/permission denied/);
    await expect(t.as(null, 'select * from orders')).rejects.toThrow(/permission denied/);
    await expect(rpc(null, 'admin_bundle', [MOKA])).rejects.toThrow(/permission denied/);
  });

  it('una carta despublicada no se sirve', async () => {
    await t.admin(`update organization_settings set menu_published = false where organization_id = $1`, [orgB]);
    expect(await rpc(null, 'public_menu', ['cafe-aurora'])).toBeNull();
    expect(await rpc(null, 'public_menu', ['no-existe'])).toBeNull();
  });

  it('registra analítica validando lo que envía el navegador', async () => {
    const productB = (await t.admin<{ id: string }>(`select id from menu_products where organization_id = $1 limit 1`, [orgB]))[0].id;
    await t.as(null, `select track_menu_event('moka-studio', 'product_view', 'sesion-1', $1)`, [productB]);
    await t.as(null, `select track_menu_event('moka-studio', 'compra_confirmada', 'sesion-1')`);
    const rows = await t.admin<{ type: string; product_id: string | null }>(`select type, product_id from menu_analytics where session_id = 'sesion-1'`);
    expect(rows).toEqual([{ type: 'product_view', product_id: null }]); // producto ajeno descartado; tipo inválido ignorado
    await expect(t.as(null, 'select * from menu_analytics')).rejects.toThrow(/permission denied/);
  });
});

describe('aislamiento entre cafeterías', () => {
  it('cada owner ve solo su organización', async () => {
    const memberships = await rpc<{ organization: { id: string } }[]>(ownerB, 'my_memberships', []);
    expect(memberships.map((m) => m.organization.id)).toEqual([orgB]);
    const rows = await t.as<{ organization_id: string }>(ownerB, 'select distinct organization_id from menu_products');
    expect(rows.map((r) => r.organization_id)).toEqual([orgB]);
    const media = await t.as(ownerB, 'select * from media_assets where organization_id = $1', [MOKA]);
    expect(media).toHaveLength(0);
  });

  it('no puede leer ni modificar la carta de otra cafetería', async () => {
    await expect(rpc(ownerB, 'admin_bundle', [MOKA])).rejects.toThrow(/forbidden/);
    const bundle = await rpc<OrganizationBundle>(ownerA, 'admin_bundle', [MOKA]);
    const product = bundle.products[0];
    await expect(rpc(ownerB, 'save_product', [MOKA, { ...product, price: 1 }])).rejects.toThrow(/forbidden/);
    await expect(rpc(ownerB, 'delete_category', [MOKA, product.categoryId])).rejects.toThrow(/forbidden/);
    // Ataque directo a la tabla, sin funciones: RLS lo filtra.
    await t.as(ownerB, 'update menu_products set price_cents = 1 where organization_id = $1', [MOKA]);
    const [after] = await t.admin<{ price_cents: string }>('select price_cents from menu_products where id = $1', [product.id]);
    expect(Number(after.price_cents)).toBe(product.price);
  });

  it('no puede secuestrar un id de otra organización desde su propia cafetería', async () => {
    const bundleA = await rpc<OrganizationBundle>(ownerA, 'admin_bundle', [MOKA]);
    const bundleB = await rpc<OrganizationBundle>(ownerB, 'admin_bundle', [orgB]);
    const victim = bundleA.products[0];
    const hijack: Product = { ...victim, categoryId: bundleB.categories[0].id, media: [], optionGroups: [], pairingIds: [], relatedIds: [], comboItems: [] };
    await expect(rpc(ownerB, 'save_product', [orgB, hijack])).rejects.toThrow();
    const [row] = await t.admin<{ organization_id: string }>('select organization_id from menu_products where id = $1', [victim.id]);
    expect(row.organization_id).toBe(MOKA);
  });

  it('no puede vincular archivos, categorías ni productos de otra cafetería', async () => {
    const bundleA = await rpc<OrganizationBundle>(ownerA, 'admin_bundle', [MOKA]);
    const bundleB = await rpc<OrganizationBundle>(ownerB, 'admin_bundle', [orgB]);
    const own = bundleB.products.find((p) => p.kind === 'item')!;
    const foreignAsset = bundleA.media.find((m) => m.kind === 'image')!.id;
    await expect(rpc(ownerB, 'save_product', [orgB, { ...own, media: [{ assetId: foreignAsset, role: 'primary', position: 0 }] }])).rejects.toThrow(/foreign key|violates/);
    await expect(rpc(ownerB, 'save_product', [orgB, { ...own, categoryId: bundleA.categories[0].id }])).rejects.toThrow(/invalid/);
    await expect(rpc(ownerB, 'save_product', [orgB, { ...own, pairingIds: [bundleA.products[0].id] }])).rejects.toThrow(/invalid/);
    await expect(rpc(ownerB, 'register_media', [orgB, {
      id: crypto.randomUUID(), kind: 'image', url: `https://x.supabase.co/storage/v1/object/public/menu-media/${MOKA}/a/w.webp`,
      storagePrefix: `${MOKA}/a/`, variants: [], frames: [], bytes: 10,
    }])).rejects.toThrow(/invalid/);
  });

  it('Storage: solo se sube a la carpeta de la propia organización', async () => {
    await expect(t.as(ownerB, `insert into storage.objects (bucket_id, name) values ('menu-media', $1)`, [`${MOKA}/x/w480.webp`]))
      .rejects.toThrow(/row-level security/);
    await t.as(ownerB, `insert into storage.objects (bucket_id, name) values ('menu-media', $1)`, [`${orgB}/x/w480.webp`]);
    await expect(t.as(staffA, `insert into storage.objects (bucket_id, name) values ('menu-media', $1)`, [`${MOKA}/x/w480.webp`]))
      .rejects.toThrow(/row-level security/);
  });
});

describe('permisos dentro de una cafetería', () => {
  it('el personal (staff) puede ver el panel pero no editar la carta', async () => {
    const bundle = await rpc<OrganizationBundle>(staffA, 'admin_bundle', [MOKA]);
    expect(bundle.products.length).toBeGreaterThan(10);
    await expect(rpc(staffA, 'save_product', [MOKA, { ...bundle.products[0], price: 1 }])).rejects.toThrow(/forbidden/);
    await expect(rpc(staffA, 'save_theme', [MOKA, bundle.theme])).rejects.toThrow(/forbidden/);
  });

  it('nadie del local puede activar módulos del plan (features)', async () => {
    await expect(t.as(ownerA, `update organization_settings set features = '{"orders": true}' where organization_id = $1`, [MOKA]))
      .rejects.toThrow(/forbidden/);
  });

  it('un administrador no puede reiniciar la demo; el owner sí, y restaura los datos', async () => {
    const bundle = await rpc<OrganizationBundle>(adminA, 'admin_bundle', [MOKA]);
    const cap = bundle.products.find((p) => p.slug === 'cappuccino')!;
    const saved = await rpc<Product>(adminA, 'save_product', [MOKA, { ...cap, price: 999900 }]);
    expect(saved.price).toBe(999900);
    await expect(rpc(adminA, 'reset_demo_organization', [MOKA])).rejects.toThrow(/forbidden/);
    await rpc(ownerA, 'reset_demo_organization', [MOKA]);
    const menu = await rpc<PublicMenu>(null, 'public_menu', ['moka-studio']);
    expect(menu.products.find((p) => p.slug === 'cappuccino')!.price).toBe(cap.price);
    await expect(rpc(ownerB, 'reset_demo_organization', [orgB])).rejects.toThrow(/demostración/);
  });
});

describe('panel: operaciones de catálogo', () => {
  it('crea, edita, duplica y publica productos; los cambios se reflejan en la carta', async () => {
    const bundle = await rpc<OrganizationBundle>(adminA, 'admin_bundle', [MOKA]);
    const created = await rpc<Product>(adminA, 'save_product', [MOKA, {
      id: '', categoryId: bundle.categories[0].id, kind: 'item', name: 'Café de prueba', slug: '', description: 'Nuevo',
      price: 123400, status: 'draft', available: true, media: [], optionGroups: [{ groupId: bundle.optionGroups[0].id, position: 0, overrides: {} }],
      badges: [], tags: [], allergens: [], ingredients: [], pairingIds: [], relatedIds: [], comboItems: [], displayMode: 'photo',
    }]);
    expect(created.slug).toBe('cafe-de-prueba');
    let menu = await rpc<PublicMenu>(null, 'public_menu', ['moka-studio']);
    expect(menu.products.some((p) => p.id === created.id)).toBe(false);
    await rpc(adminA, 'save_product', [MOKA, { ...created, status: 'published', price: 150000 }]);
    menu = await rpc<PublicMenu>(null, 'public_menu', ['moka-studio']);
    expect(menu.products.find((p) => p.id === created.id)?.price).toBe(150000);
    const copy = await rpc<Product>(adminA, 'duplicate_product', [MOKA, created.id]);
    expect(copy.status).toBe('draft');
    expect(copy.slug).toBe('cafe-de-prueba-copia');
    expect(copy.optionGroups).toHaveLength(1);
  });

  it('ordena categorías', async () => {
    const bundle = await rpc<OrganizationBundle>(adminA, 'admin_bundle', [MOKA]);
    const ids = bundle.categories.map((c) => c.id).reverse();
    await rpc(adminA, 'reorder_categories', [MOKA, ids]);
    const menu = await rpc<PublicMenu>(null, 'public_menu', ['moka-studio']);
    expect(menu.categories.map((c) => c.id)).toEqual(ids);
  });

  it('impide borrar categorías con productos y archivos en uso', async () => {
    const bundle = await rpc<OrganizationBundle>(adminA, 'admin_bundle', [MOKA]);
    await expect(rpc(adminA, 'delete_category', [MOKA, bundle.categories[0].id])).rejects.toThrow(/conflict/);
    const used = bundle.products[0].media[0].assetId;
    await expect(rpc(adminA, 'delete_media', [MOKA, used])).rejects.toThrow(/conflict/);
  });

  it('un grupo de opciones conserva los ids al editarse (los ajustes por producto siguen válidos)', async () => {
    const bundle = await rpc<OrganizationBundle>(adminA, 'admin_bundle', [MOKA]);
    const g = bundle.optionGroups.find((x) => x.name === 'Leche')!;
    const edited = await rpc<typeof g>(adminA, 'save_option_group', [MOKA, { ...g, options: g.options.map((o) => ({ ...o, priceDelta: o.priceDelta + 100 })) }]);
    expect(edited.options.map((o) => o.id)).toEqual(g.options.map((o) => o.id));
    await expect(rpc(adminA, 'delete_option_group', [MOKA, g.id])).rejects.toThrow(/conflict/);
  });

  it('valida promociones en la base de datos', async () => {
    await expect(rpc(adminA, 'save_promotion', [MOKA, { title: 'Mal', kind: 'percent_off', percentOff: null, productIds: [], days: [] }]))
      .rejects.toThrow(/check constraint|violates/);
    await expect(rpc(adminA, 'save_promotion', [MOKA, { title: 'Fechas', kind: 'announcement', startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z', productIds: [], days: [] }]))
      .rejects.toThrow(/check constraint|violates/);
  });
});

describe('pedidos y comandas (estructura de la fase 6)', () => {
  let orderId: string;
  beforeAll(async () => {
    // Simula lo que hará la Edge Function place-order (service role).
    const [table] = await t.admin<{ id: string }>(`insert into restaurant_tables (organization_id, label) values ($1, '4') returning id`, [MOKA]);
    const [order] = await t.admin<{ id: string }>(`insert into orders (organization_id, table_id, idempotency_key, currency, subtotal_cents, total_cents)
      values ($1, $2, 'clave-unica-001', 'ARS', 1150000, 1150000) returning id`, [MOKA, table.id]);
    orderId = order.id;
    await t.admin(`insert into order_items (order_id, organization_id, product_name, unit_price_cents, quantity, line_total_cents, station) values
      ($1, $2, 'Cappuccino', 460000, 1, 460000, 'barra'), ($1, $2, 'Torta de chocolate', 650000, 1, 650000, 'pasteleria')`, [orderId, MOKA]);
  });

  it('no duplica un pedido con la misma clave de idempotencia', async () => {
    await expect(t.admin(`insert into orders (organization_id, idempotency_key, currency, subtotal_cents, total_cents) values ($1, 'clave-unica-001', 'ARS', 1, 1)`, [MOKA]))
      .rejects.toThrow(/duplicate key/);
  });

  it('otra cafetería no ve el pedido', async () => {
    expect(await t.as(ownerB, 'select * from orders where id = $1', [orderId])).toHaveLength(0);
    // RLS lo oculta: ni siquiera se revela que el pedido existe.
    await expect(rpc(ownerB, 'set_order_status', [orderId, 'accepted'])).rejects.toThrow(/not_found/);
  });

  it('el pedido queda listo solo cuando todas las estaciones terminan', async () => {
    await rpc(staffA, 'set_order_status', [orderId, 'accepted']);
    const tickets = await t.as<{ id: string; station: string }>(staffA, 'select id, station from kitchen_tickets where order_id = $1 order by station', [orderId]);
    expect(tickets.map((x) => x.station)).toEqual(['barra', 'pasteleria']);
    await expect(rpc(staffA, 'set_order_status', [orderId, 'delivered'])).rejects.toThrow(/invalid/);
    await rpc(staffA, 'set_ticket_status', [tickets[0].id, 'preparing']);
    await expect(rpc(staffA, 'set_order_status', [orderId, 'ready'])).rejects.toThrow(/pendientes/);
    await rpc(staffA, 'set_ticket_status', [tickets[0].id, 'ready']);
    let [o] = await t.admin<{ status: string }>('select status from orders where id = $1', [orderId]);
    expect(o.status).toBe('preparing');
    await rpc(staffA, 'set_ticket_status', [tickets[1].id, 'ready']);
    [o] = await t.admin<{ status: string }>('select status from orders where id = $1', [orderId]);
    expect(o.status).toBe('ready');
  });

  it('un cambio de precio del catálogo no altera el pedido histórico', async () => {
    await t.admin(`update menu_products set price_cents = 1 where organization_id = $1 and slug = 'cappuccino'`, [MOKA]);
    const [item] = await t.admin<{ unit_price_cents: string }>(`select unit_price_cents from order_items where order_id = $1 and product_name = 'Cappuccino'`, [orderId]);
    expect(Number(item.unit_price_cents)).toBe(460000);
  });
});

describe('fidelización (estructura de la fase 7)', () => {
  let membership: string;
  let customerUser: string;
  beforeAll(async () => {
    customerUser = await t.createUser('cliente@correo.test');
    // La demo ya trae su programa de fidelidad.
    const [program] = await t.admin<{ id: string }>(`select id from loyalty_programs where organization_id = $1`, [MOKA]);
    const [customer] = await t.admin<{ id: string }>(`insert into customers (organization_id, user_id, display_name) values ($1, $2, 'Cliente') returning id`, [MOKA, customerUser]);
    const [m] = await t.admin<{ id: string }>(`insert into loyalty_memberships (organization_id, program_id, customer_id, member_code) values ($1, $2, $3, 'abcdef123456') returning id`, [MOKA, program.id, customer.id]);
    membership = m.id;
  });

  it('el cliente no puede cargarse puntos; el personal sí, con autor registrado', async () => {
    await expect(rpc(customerUser, 'record_loyalty_transaction', [membership, 'earn', 100, 0, 'trampa'])).rejects.toThrow(/forbidden/);
    await expect(t.as(customerUser, `insert into loyalty_transactions (organization_id, membership_id, kind, points, created_by) values ($1, $2, 'earn', 999, $3)`, [MOKA, membership, customerUser]))
      .rejects.toThrow(/row-level security/);
    await rpc(staffA, 'record_loyalty_transaction', [membership, 'earn', 50, 1, 'Compra']);
    const own = await t.as<{ points: number }>(customerUser, 'select points from loyalty_transactions');
    expect(own).toEqual([{ points: 50 }]);
  });

  it('no permite canjear más de lo disponible ni editar movimientos', async () => {
    await expect(rpc(staffA, 'record_loyalty_transaction', [membership, 'redeem', -80, 0, 'Canje'])).rejects.toThrow(/insuficiente/);
    await expect(t.admin('update loyalty_transactions set points = 1000')).rejects.toThrow(/no se modifican/);
  });
});

type Card = { code: string; stamps: number; goal: number; redeemed: number };
type Member = { id: string; code: string; stamps: number; redeemed: number };

describe('tarjeta de sellos desde la carta', () => {
  let card: Card;
  beforeAll(async () => {
    card = await rpc<Card>(null, 'loyalty_join', ['moka-studio']);
  });

  it('la carta pública incluye el programa activo y un visitante obtiene su tarjeta sin registrarse', async () => {
    const menu = await rpc<PublicMenu>(null, 'public_menu', ['moka-studio']);
    expect(menu.loyalty).toMatchObject({ active: true, name: 'Club Moka', stampsForReward: 8 });
    expect(card).toMatchObject({ stamps: 0, goal: 8, redeemed: 0 });
    expect(card.code).toMatch(/^[a-z0-9]{20}$/);
    expect(await rpc<Card>(null, 'loyalty_card', ['moka-studio', card.code])).toMatchObject({ stamps: 0 });
    expect(await rpc(null, 'loyalty_card', ['moka-studio', 'inexistente'])).toBeNull();
    // Con el código de otra cafetería no se ve nada.
    expect(await rpc(null, 'loyalty_card', ['cafe-aurora', card.code])).toBeNull();
  });

  it('el visitante no puede sumarse sellos ni ver tarjetas ajenas', async () => {
    const member = await rpc<Member>(staffA, 'loyalty_find_member', [MOKA, card.code]);
    await expect(rpc(null, 'loyalty_add_stamps', [MOKA, member.id, 5])).rejects.toThrow(/permission denied/);
    await expect(rpc(null, 'loyalty_find_member', [MOKA, card.code])).rejects.toThrow(/permission denied/);
    await expect(rpc(ownerB, 'loyalty_add_stamps', [MOKA, member.id, 1])).rejects.toThrow(/forbidden/);
    await expect(rpc(ownerB, 'loyalty_add_stamps', [orgB, member.id, 1])).rejects.toThrow(/inexistente/);
    await expect(t.as(null, 'select * from loyalty_memberships')).rejects.toThrow(/permission denied/);
  });

  it('el personal suma sellos, canjea al completar y el cliente lo ve', async () => {
    const found = await rpc<Member>(staffA, 'loyalty_find_member', [MOKA, card.code.toUpperCase().replace(/(.{4})/g, '$1 ')]);
    expect(found.code).toBe(card.code);
    await expect(rpc(staffA, 'loyalty_add_stamps', [MOKA, found.id, 9])).rejects.toThrow(/de 1 a 5/);
    await expect(rpc(staffA, 'loyalty_redeem', [MOKA, found.id])).rejects.toThrow(/no completó/);
    await rpc(staffA, 'loyalty_add_stamps', [MOKA, found.id, 5]);
    const after = await rpc<Member>(staffA, 'loyalty_add_stamps', [MOKA, found.id, 3]);
    expect(after.stamps).toBe(8);
    const redeemed = await rpc<Member>(staffA, 'loyalty_redeem', [MOKA, found.id]);
    expect(redeemed).toMatchObject({ stamps: 0, redeemed: 1 });
    expect(await rpc<Card>(null, 'loyalty_card', ['moka-studio', card.code])).toMatchObject({ stamps: 0, redeemed: 1 });
    const stats = await rpc<{ members: number; stampsLast30: number; redeemedLast30: number }>(staffA, 'loyalty_stats', [MOKA]);
    expect(stats.redeemedLast30).toBeGreaterThanOrEqual(1);
    expect(stats.stampsLast30).toBeGreaterThanOrEqual(8);
  });

  it('solo owner o admin configuran el programa, con validación', async () => {
    const program = { active: true, name: 'Club Moka', stampsForReward: 6, reward: 'Un café', terms: '' };
    await expect(rpc(staffA, 'save_loyalty_program', [MOKA, program])).rejects.toThrow(/forbidden/);
    await expect(rpc(adminA, 'save_loyalty_program', [MOKA, { ...program, stampsForReward: 50 }])).rejects.toThrow(/entre 3 y 20/);
    expect(await rpc(adminA, 'save_loyalty_program', [MOKA, program])).toMatchObject({ stampsForReward: 6 });
    await rpc(adminA, 'save_loyalty_program', [MOKA, { ...program, active: false }]);
    expect((await rpc<PublicMenu>(null, 'public_menu', ['moka-studio'])).loyalty).toBeNull();
    await expect(rpc(null, 'loyalty_join', ['moka-studio'])).rejects.toThrow(/no está disponible/);
    await rpc(adminA, 'save_loyalty_program', [MOKA, { ...program, stampsForReward: 8 }]);
  });
});

describe('servicio de mesa', () => {
  it('desde un QR de mesa se llama al mozo, sin duplicar avisos', async () => {
    expect(await rpc(null, 'qr_table', ['moka-studio', 'mkmesa4x7q'])).toBe('Mesa 4');
    expect(await rpc(null, 'qr_table', ['moka-studio', 'mk7q2d9wz4'])).toBeNull();
    await expect(rpc(null, 'request_service', ['moka-studio', 'mk7q2d9wz4', 'bill'])).rejects.toThrow(/QR de tu mesa/);
    await expect(rpc(null, 'request_service', ['moka-studio', 'mkmesa4x7q', 'pagar'])).rejects.toThrow(/inválida/);
    expect(await rpc(null, 'request_service', ['moka-studio', 'mkmesa4x7q', 'assistance'])).toBe('sent');
    expect(await rpc(null, 'request_service', ['moka-studio', 'mkmesa4x7q', 'assistance'])).toBe('already');
    expect(await rpc(null, 'request_service', ['moka-studio', 'mkmesa4x7q', 'bill'])).toBe('sent');
  });

  it('el personal ve y atiende los avisos de su local; otro local no', async () => {
    const list = await rpc<{ id: string; kind: string; tableLabel: string }[]>(staffA, 'list_service_requests', [MOKA]);
    expect(list.map((r) => [r.tableLabel, r.kind])).toEqual([['Mesa 4', 'assistance'], ['Mesa 4', 'bill']]);
    await expect(rpc(ownerB, 'list_service_requests', [MOKA])).rejects.toThrow(/forbidden/);
    await expect(rpc(ownerB, 'set_service_request_status', [orgB, list[0].id, 'closed'])).rejects.toThrow(/inexistente/);
    await expect(rpc(null, 'list_service_requests', [MOKA])).rejects.toThrow(/permission denied/);
    await rpc(staffA, 'set_service_request_status', [MOKA, list[0].id, 'closed']);
    expect(await rpc<unknown[]>(staffA, 'list_service_requests', [MOKA])).toHaveLength(1);
  });

  it('sin el servicio activado el QR no habilita avisos', async () => {
    await t.admin('update organization_settings set table_service = false where organization_id = $1', [MOKA]);
    expect(await rpc(null, 'qr_table', ['moka-studio', 'mkmesa4x7q'])).toBeNull();
    await expect(rpc(null, 'request_service', ['moka-studio', 'mkmesa4x7q', 'bill'])).rejects.toThrow(/QR de tu mesa/);
    await t.admin('update organization_settings set table_service = true where organization_id = $1', [MOKA]);
  });
});

describe('datos del local, idiomas y traducciones', () => {
  it('guarda contacto e idiomas y descarta traducciones inválidas', async () => {
    const [{ r: bundle }] = await t.as<{ r: OrganizationBundle }>(ownerA, 'select public.admin_bundle($1) as r', [MOKA]);
    expect(bundle.loyalty.name).toBe('Club Moka');
    const saved = await rpc<OrganizationBundle['settings']>(ownerA, 'save_settings', [MOKA, {
      ...bundle.settings, whatsapp: '+54 9 11 5555-0000', languages: ['en', 'fr', 'en'],
      translations: { en: { 'site.tagline': 'Hello', vacio: '  ', numero: 3 }, fr: { 'site.tagline': 'Bonjour' } },
    }]);
    expect(saved.languages).toEqual(['en']);
    expect(saved.translations).toEqual({ en: { 'site.tagline': 'Hello' } });
    expect(saved.whatsapp).toBe('+54 9 11 5555-0000');
    await expect(rpc(ownerA, 'save_settings', [MOKA, { ...bundle.settings, reviewUrl: 'javascript:alert(1)' }])).rejects.toThrow(/check constraint/);
    const menu = await rpc<PublicMenu>(null, 'public_menu', ['moka-studio']);
    expect(menu.settings.translations.en?.['site.tagline']).toBe('Hello');
    await rpc(ownerA, 'save_settings', [MOKA, bundle.settings]);
  });
});
