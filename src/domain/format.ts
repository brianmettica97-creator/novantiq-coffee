const cache = new Map<string, Intl.NumberFormat>();

/** Formatea centavos. Omite decimales cuando el importe es entero. */
export function formatPrice(cents: number, currency = 'ARS', locale = 'es-AR'): string {
  const whole = cents % 100 === 0;
  const key = `${locale}|${currency}|${whole}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    });
    cache.set(key, f);
  }
  return f.format(cents / 100);
}

export function formatDelta(cents: number, currency?: string, locale?: string): string {
  if (cents === 0) return '';
  return `${cents > 0 ? '+' : '−'} ${formatPrice(Math.abs(cents), currency, locale)}`;
}

/** "2.800,50" -> 280050. Devuelve null si el texto no es un importe válido. */
export function parsePriceInput(value: string): number | null {
  const clean = value.replace(/[^\d,.-]/g, '');
  if (!clean) return null;
  // Formato local: punto de miles y coma decimal. Si solo hay punto y 1–2
  // dígitos al final, se interpreta como decimal.
  let normalized: string;
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{1,2}$/.test(clean)) normalized = clean;
  else normalized = clean.replace(/\./g, '');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = slugify(base);
  if (!set.has(root)) return root;
  for (let i = 2; ; i++) if (!set.has(`${root}-${i}`)) return `${root}-${i}`;
}
