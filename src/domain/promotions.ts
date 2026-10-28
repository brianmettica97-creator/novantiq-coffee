import type { MenuLanguage, Promotion } from './types';
import { dayNames, inTimeRange, localClock, localeFor, parseHHMM } from './time';

export type PromotionState = 'active' | 'scheduled' | 'expired' | 'paused' | 'outside_hours';

/** Estado de una promoción en un instante dado, en la hora del local. */
export function promotionState(p: Promotion, now: Date, timeZone: string): PromotionState {
  if (!p.active) return 'paused';
  const t = now.getTime();
  if (p.endsAt && Date.parse(p.endsAt) <= t) return 'expired';
  if (p.startsAt && Date.parse(p.startsAt) > t) return 'scheduled';
  const clock = localClock(now, timeZone);
  if (p.days.length && !p.days.includes(clock.day)) return 'outside_hours';
  const start = parseHHMM(p.startTime);
  const end = parseHHMM(p.endTime);
  if (start !== null && end !== null && !inTimeRange(clock.minutes, start, end)) return 'outside_hours';
  return 'active';
}

export function isPromotionActive(p: Promotion, now: Date, timeZone: string): boolean {
  return promotionState(p, now, timeZone) === 'active';
}

/** Mayor descuento porcentual vigente que aplica a un producto. */
export function activePercentOff(productId: string, promotions: Promotion[], now: Date, timeZone: string) {
  let best: Promotion | null = null;
  for (const p of promotions) {
    if (p.kind !== 'percent_off' || !p.percentOff || !p.productIds.includes(productId)) continue;
    if (!isPromotionActive(p, now, timeZone)) continue;
    if (!best || (p.percentOff ?? 0) > (best.percentOff ?? 0)) best = p;
  }
  return best;
}

const SCHEDULE_WORDS: Record<MenuLanguage, { to: string; until: string; hours: string }> = {
  es: { to: 'a', until: 'hasta el', hours: ' h' },
  en: { to: 'to', until: 'until', hours: '' },
  pt: { to: 'a', until: 'até', hours: ' h' },
};

export function describeSchedule(p: Promotion, lang: MenuLanguage = 'es'): string {
  const parts: string[] = [];
  const w = SCHEDULE_WORDS[lang];
  const names = lang === 'es' ? ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] : dayNames(lang, 'short').map((d) => d.toLowerCase());
  if (p.days.length && p.days.length < 7) {
    const sorted = [...p.days].sort();
    const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    parts.push(consecutive && sorted.length > 2
      ? `${names[sorted[0]]} ${w.to} ${names[sorted[sorted.length - 1]]}`
      : sorted.map((d) => names[d]).join(', '));
  }
  if (p.startTime && p.endTime) parts.push(`${p.startTime} ${w.to} ${p.endTime}${w.hours}`);
  if (p.endsAt) {
    parts.push(`${w.until} ${new Date(p.endsAt).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'long' })}`);
  }
  return parts.join(' · ');
}
