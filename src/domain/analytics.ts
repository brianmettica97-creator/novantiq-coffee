import type { AnalyticsEvent, AnalyticsEventType } from './types';

/**
 * Resumen de interacción con la carta. Son interacciones, NO ventas: una
 * consulta de producto no implica un pedido ni una compra.
 */
export interface AnalyticsSummary {
  since: string;
  days: number;
  totals: Record<AnalyticsEventType, number>;
  sessions: number;
  topProducts: { productId: string; views: number }[];
  topCategories: { categoryId: string; views: number }[];
  topSearches: { query: string; count: number }[];
  byDay: { date: string; menuViews: number; productViews: number }[];
}

export const EVENT_TYPES: AnalyticsEventType[] = [
  'menu_view', 'qr_scan', 'category_view', 'product_view', 'media_play', 'search', 'promo_click',
];

export const EVENT_LABELS: Record<AnalyticsEventType, string> = {
  menu_view: 'Visitas a la carta',
  qr_scan: 'Ingresos por QR',
  category_view: 'Categorías consultadas',
  product_view: 'Fichas de producto abiertas',
  media_play: 'Videos reproducidos',
  search: 'Búsquedas',
  promo_click: 'Clics en promociones',
};

/** Mínimo de visitas para mostrar rankings con algo de sentido. */
export const MIN_EVENTS_FOR_RANKING = 20;

function top<K extends string>(counts: Map<K, number>, n: number) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function summarize(events: AnalyticsEvent[], now: Date, days: number): AnalyticsSummary {
  const since = new Date(now.getTime() - days * 86_400_000);
  const inRange = events.filter((e) => Date.parse(e.occurredAt) >= since.getTime());
  const totals = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as Record<AnalyticsEventType, number>;
  const products = new Map<string, number>();
  const cats = new Map<string, number>();
  const searches = new Map<string, number>();
  const sessions = new Set<string>();
  const byDay = new Map<string, { menuViews: number; productViews: number }>();
  for (const e of inRange) {
    totals[e.type]++;
    sessions.add(e.sessionId);
    const day = e.occurredAt.slice(0, 10);
    const d = byDay.get(day) ?? { menuViews: 0, productViews: 0 };
    if (e.type === 'menu_view') d.menuViews++;
    if (e.type === 'product_view') d.productViews++;
    byDay.set(day, d);
    if (e.type === 'product_view' && e.productId) products.set(e.productId, (products.get(e.productId) ?? 0) + 1);
    if (e.type === 'category_view' && e.categoryId) cats.set(e.categoryId, (cats.get(e.categoryId) ?? 0) + 1);
    if (e.type === 'search' && e.query) searches.set(e.query, (searches.get(e.query) ?? 0) + 1);
  }
  return {
    since: since.toISOString(),
    days,
    totals,
    sessions: sessions.size,
    topProducts: top(products, 8).map(([productId, views]) => ({ productId, views })),
    topCategories: top(cats, 8).map(([categoryId, views]) => ({ categoryId, views })),
    topSearches: top(searches, 8).map(([query, count]) => ({ query, count })),
    byDay: [...byDay.entries()].sort().map(([date, v]) => ({ date, ...v })),
  };
}
