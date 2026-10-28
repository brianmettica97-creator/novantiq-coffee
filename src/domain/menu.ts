import type {
  DisplayMode, HomeSection, MediaAsset, OrganizationBundle, Product, PublicMenu,
} from './types';
import { resolveGroups, startingPrice, type PricingGroup } from './pricing';

/**
 * Construye la carta pública a partir del estado completo de la organización.
 * Regla de oro: solo sale contenido publicado. La misma regla vive en la
 * función SQL `public_menu` del backend (ver supabase/migrations).
 */
export function buildPublicMenu(bundle: OrganizationBundle, now = new Date()): PublicMenu | null {
  const { organization: org, settings } = bundle;
  if (org.status !== 'active' || !settings.menuPublished) return null;

  const categories = bundle.categories.filter((c) => c.visible).sort((a, b) => a.position - b.position);
  const visibleCats = new Set(categories.map((c) => c.id));
  const products = bundle.products
    .filter((p) => p.status === 'published' && visibleCats.has(p.categoryId))
    .sort((a, b) => a.position - b.position);
  const productIds = new Set(products.map((p) => p.id));

  // Las referencias a productos no publicados se descartan.
  const cleanProducts = products.map((p) => ({
    ...p,
    pairingIds: p.pairingIds.filter((id) => productIds.has(id)),
    relatedIds: p.relatedIds.filter((id) => productIds.has(id)),
    comboItems: p.comboItems
      .filter((c) => productIds.has(c.productId))
      .map((c) => ({ ...c, substituteIds: c.substituteIds.filter((id) => productIds.has(id)) })),
  }));

  const promotions = bundle.promotions
    .filter((p) => p.active && !(p.endsAt && Date.parse(p.endsAt) <= now.getTime()))
    .map((p) => ({ ...p, productIds: p.productIds.filter((id) => productIds.has(id)) }))
    .sort((a, b) => a.position - b.position);

  const groupIds = new Set(cleanProducts.flatMap((p) => p.optionGroups.map((l) => l.groupId)));
  const mediaIds = new Set<string>();
  for (const p of cleanProducts) p.media.forEach((m) => mediaIds.add(m.assetId));
  for (const c of categories) if (c.imageAssetId) mediaIds.add(c.imageAssetId);
  for (const p of promotions) {
    if (p.imageAssetId) mediaIds.add(p.imageAssetId);
    if (p.videoAssetId) mediaIds.add(p.videoAssetId);
  }
  for (const id of [settings.logoAssetId, settings.coverImageAssetId, settings.coverVideoAssetId]) {
    if (id) mediaIds.add(id);
  }

  const { updatedAt: _ignored, ...publicSettings } = settings;
  return {
    organization: { id: org.id, slug: org.slug, name: org.name, isDemo: org.isDemo },
    settings: publicSettings,
    theme: bundle.theme,
    badges: bundle.badges,
    categories,
    products: cleanProducts,
    optionGroups: bundle.optionGroups.filter((g) => groupIds.has(g.id)),
    promotions,
    media: bundle.media.filter((m) => mediaIds.has(m.id)),
    loyalty: settings.features.loyalty && bundle.loyalty.active ? bundle.loyalty : null,
  };
}

export interface ResolvedMedia {
  primary: MediaAsset | null;
  gallery: MediaAsset[];
  video: MediaAsset | null;
}

export function resolveProductMedia(product: Product, assets: Map<string, MediaAsset>): ResolvedMedia {
  const sorted = [...product.media].sort((a, b) => a.position - b.position);
  const pick = (role: string, kind: string) => {
    const link = sorted.find((m) => m.role === role && assets.get(m.assetId)?.kind === kind);
    return link ? assets.get(link.assetId)! : null;
  };
  const primary = pick('primary', 'image');
  const gallery = sorted
    .filter((m) => m.role === 'gallery')
    .map((m) => assets.get(m.assetId))
    .filter((a): a is MediaAsset => !!a && a.kind === 'image');
  return {
    primary: primary ?? gallery[0] ?? null,
    gallery,
    video: pick('video', 'video'),
  };
}

export interface MediaModeOption {
  mode: DisplayMode;
  label: string;
}

/**
 * Modos de presentación disponibles para la ficha, con el modo elegido por el
 * local primero. La foto siempre está si existe: es la alternativa universal.
 */
export function availableModes(product: Product, media: ResolvedMedia): MediaModeOption[] {
  const modes: MediaModeOption[] = [];
  const photos = (media.primary ? 1 : 0) + media.gallery.filter((g) => g.id !== media.primary?.id).length;
  if (photos > 0) modes.push({ mode: photos > 1 ? 'gallery' : 'photo', label: photos > 1 ? 'Fotos' : 'Foto' });
  if (media.video) modes.push({ mode: 'video', label: 'Video' });
  const preferred = product.displayMode === 'photo' ? 'gallery' : product.displayMode;
  const idx = modes.findIndex((m) => m.mode === product.displayMode || m.mode === preferred);
  if (idx > 0) modes.unshift(...modes.splice(idx, 1));
  return modes;
}

export function productGroups(product: Product, groups: PricingGroup[]): PricingGroup[] {
  return resolveGroups(groups, product.optionGroups);
}

export function fromPrice(product: Product, groups: PricingGroup[]) {
  const resolved = productGroups(product, groups);
  const start = startingPrice(product.price, resolved);
  const varies = resolved.some((g) => g.required && new Set(g.options.map((o) => o.priceDelta)).size > 1);
  return { amount: start, varies };
}

/** Productos agrupados por categoría, respetando el orden de ambos. */
export function productsByCategory(menu: Pick<PublicMenu, 'categories' | 'products'>) {
  return menu.categories
    .map((category) => ({ category, products: menu.products.filter((p) => p.categoryId === category.id) }))
    .filter((s) => s.products.length > 0);
}

/** Valor por separado de un combo, para mostrar el ahorro real. */
export function comboSeparateValue(combo: Product, products: Product[]): number | null {
  if (combo.kind !== 'combo' || !combo.comboItems.length) return null;
  let sum = 0;
  for (const item of combo.comboItems) {
    const p = products.find((x) => x.id === item.productId);
    if (!p) return null;
    sum += p.price * item.quantity;
  }
  return sum;
}

/** Orden de secciones de la portada; la tarjeta va después de las promociones si el local no la ubicó. */
export function homeSections(order: HomeSection[]): HomeSection[] {
  if (order.includes('loyalty')) return order;
  const i = order.indexOf('promotions');
  return [...order.slice(0, i + 1), 'loyalty', ...order.slice(i + 1)];
}

/* ------------------------------------------------------------ Dietas */

export interface DietFilter {
  /** Etiquetas que el producto debe tener (p. ej. "Vegano"). */
  include: string[];
  /** Alérgenos que el producto NO debe contener. */
  avoid: string[];
}

export const NO_DIET: DietFilter = { include: [], avoid: [] };

/** Etiquetas y alérgenos presentes en la carta, de más a menos frecuentes. */
export function dietOptions(products: Product[]) {
  const rank = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  };
  return { tags: rank(products.flatMap((p) => p.tags)), allergens: rank(products.flatMap((p) => p.allergens)) };
}

export function matchesDiet(p: Product, f: DietFilter): boolean {
  return f.include.every((t) => p.tags.includes(t)) && !f.avoid.some((a) => p.allergens.includes(a));
}

export const isDietActive = (f: DietFilter) => f.include.length > 0 || f.avoid.length > 0;
