// Utilidades de fecha y hora en la zona horaria del local.
import type { MenuLanguage, OpeningHours } from './types';

export interface LocalClock {
  /** 0 = domingo */
  day: number;
  /** minutos desde la medianoche */
  minutes: number;
  /** YYYY-MM-DD */
  date: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function localClock(now: Date, timeZone: string): LocalClock {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: days.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function parseHHMM(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** ¿El minuto está dentro del rango? Admite rangos que cruzan la medianoche. */
export function inTimeRange(minutes: number, start: number, end: number): boolean {
  if (start === end) return true;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const LOCALES: Record<MenuLanguage, string> = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' };
export const localeFor = (lang: MenuLanguage) => LOCALES[lang];

/** Nombres de los días (0 = domingo) en el idioma pedido. */
export function dayNames(lang: MenuLanguage = 'es', style: 'long' | 'short' = 'long'): string[] {
  if (lang === 'es' && style === 'long') return DAY_NAMES;
  // 2023-01-01 fue domingo.
  const f = new Intl.DateTimeFormat(LOCALES[lang], { weekday: style, timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, d) => {
    const name = f.format(new Date(Date.UTC(2023, 0, 1 + d))).replace('.', '');
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
}

const STATUS_WORDS: Record<MenuLanguage, { open: string; closed: string; closes: string; opens: string; tomorrow: string }> = {
  es: { open: 'Abierto', closed: 'Cerrado', closes: 'cierra', opens: 'abre', tomorrow: 'mañana' },
  en: { open: 'Open', closed: 'Closed', closes: 'closes', opens: 'opens', tomorrow: 'tomorrow' },
  pt: { open: 'Aberto', closed: 'Fechado', closes: 'fecha', opens: 'abre', tomorrow: 'amanhã' },
};

export interface OpenStatus {
  open: boolean;
  label: string;
}

export function openStatus(hours: OpeningHours[], now: Date, timeZone: string, lang: MenuLanguage = 'es'): OpenStatus | null {
  if (!hours.length) return null;
  const w = STATUS_WORDS[lang];
  const clock = localClock(now, timeZone);
  const today = hours.find((h) => h.day === clock.day);
  const yesterday = hours.find((h) => h.day === (clock.day + 6) % 7);

  // Un turno de ayer que cruza la medianoche puede seguir abierto.
  if (yesterday) {
    const o = parseHHMM(yesterday.opens), c = parseHHMM(yesterday.closes);
    if (o !== null && c !== null && c < o && clock.minutes < c) {
      return { open: true, label: `${w.open} · ${w.closes} ${yesterday.closes}` };
    }
  }
  if (today) {
    const o = parseHHMM(today.opens), c = parseHHMM(today.closes);
    if (o !== null && c !== null) {
      if (clock.minutes >= o && (c < o || clock.minutes < c)) return { open: true, label: `${w.open} · ${w.closes} ${today.closes}` };
      if (clock.minutes < o) return { open: false, label: `${w.closed} · ${w.opens} ${today.opens}` };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const next = hours.find((h) => h.day === (clock.day + i) % 7 && parseHHMM(h.opens) !== null);
    if (next) {
      const when = i === 1 ? w.tomorrow : dayNames(lang)[next.day].toLowerCase();
      return { open: false, label: `${w.closed} · ${w.opens} ${when} ${next.opens}` };
    }
  }
  return { open: false, label: w.closed };
}
