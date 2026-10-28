import type { Category, Product } from './types';

/** Minúsculas y sin acentos: "Café" y "cafe" son equivalentes. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface SearchHit {
  product: Product;
  score: number;
}

/**
 * Búsqueda tolerante a mayúsculas y acentos. Todas las palabras de la consulta
 * deben aparecer en algún campo; el nombre pesa más que la descripción.
 */
export function searchProducts(products: Product[], categories: Category[], query: string): SearchHit[] {
  const tokens = normalize(query).split(' ').filter((t) => t.length > 0);
  if (!tokens.length) return [];
  const catName = new Map(categories.map((c) => [c.id, normalize(c.name)]));
  const hits: SearchHit[] = [];
  for (const product of products) {
    const name = normalize(product.name);
    const fields = [
      { text: name, weight: 10 },
      { text: normalize(product.tags.join(' ')), weight: 5 },
      { text: catName.get(product.categoryId) ?? '', weight: 4 },
      { text: normalize(product.ingredients.join(' ')), weight: 3 },
      { text: normalize(product.description), weight: 2 },
    ];
    let score = 0;
    let all = true;
    for (const token of tokens) {
      let best = 0;
      for (const f of fields) {
        const idx = f.text.indexOf(token);
        if (idx === -1) continue;
        const wordStart = idx === 0 || f.text[idx - 1] === ' ';
        best = Math.max(best, f.weight * (wordStart ? 1.5 : 1));
      }
      if (!best) { all = false; break; }
      score += best;
    }
    if (!all) continue;
    if (name.startsWith(tokens.join(' '))) score += 20;
    hits.push({ product, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
}
