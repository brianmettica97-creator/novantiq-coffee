// Traducción del contenido de la carta. El español es el idioma de origen: lo
// que carga el local en el panel. Las traducciones viven en
// settings.translations[idioma][clave] y lo que falte se muestra en español.
import type {
  ExtraLanguage, MenuLanguage, OrganizationBundle, PublicMenu, Translations,
} from './types';

export const LANGUAGE_NAMES: Record<MenuLanguage, string> = { es: 'Español', en: 'English', pt: 'Português' };

/**
 * Vocabulario común (alérgenos y dietas) ya traducido: el local no necesita
 * cargarlo. Una traducción propia con la misma clave lo reemplaza.
 */
const VOCABULARY: Record<ExtraLanguage, Record<string, string>> = {
  en: {
    Gluten: 'Gluten', Leche: 'Milk', Lácteos: 'Dairy', Huevo: 'Egg', 'Frutos secos': 'Tree nuts', Maní: 'Peanuts',
    Sésamo: 'Sesame', Soja: 'Soy', Pescado: 'Fish', Crustáceos: 'Shellfish', Moluscos: 'Molluscs', Mostaza: 'Mustard',
    Apio: 'Celery', Sulfitos: 'Sulphites', Altramuces: 'Lupin', Vegano: 'Vegan', Vegetariano: 'Vegetarian',
    'Sin TACC': 'Gluten-free', 'Sin gluten': 'Gluten-free', 'Sin lactosa': 'Lactose-free', 'Sin azúcar': 'Sugar-free',
  },
  pt: {
    Gluten: 'Glúten', Leche: 'Leite', Lácteos: 'Laticínios', Huevo: 'Ovo', 'Frutos secos': 'Castanhas', Maní: 'Amendoim',
    Sésamo: 'Gergelim', Soja: 'Soja', Pescado: 'Peixe', Crustáceos: 'Crustáceos', Moluscos: 'Moluscos', Mostaza: 'Mostarda',
    Apio: 'Aipo', Sulfitos: 'Sulfitos', Altramuces: 'Tremoço', Vegano: 'Vegano', Vegetariano: 'Vegetariano',
    'Sin TACC': 'Sem glúten', 'Sin gluten': 'Sem glúten', 'Sin lactosa': 'Sem lactose', 'Sin azúcar': 'Sem açúcar',
  },
};

/** Claves de traducción. Los términos (etiquetas, alérgenos, ingredientes) se comparten entre productos. */
export const tkey = {
  tagline: () => 'site.tagline',
  intro: () => 'site.intro',
  category: (id: string, field: 'name' | 'description') => `cat.${id}.${field}`,
  product: (id: string, field: 'name' | 'description' | 'story' | 'portion' | 'foodInfo') => `prod.${id}.${field}`,
  group: (id: string) => `group.${id}.name`,
  option: (id: string) => `opt.${id}.name`,
  promotion: (id: string, field: 'title' | 'description' | 'conditions') => `promo.${id}.${field}`,
  badge: (key: string) => `badge.${key}`,
  term: (text: string) => `term.${text}`,
  loyalty: (field: 'name' | 'reward' | 'terms') => `loyalty.${field}`,
};

export function translator(translations: Translations, lang: MenuLanguage) {
  if (lang === 'es') return (_key: string, source: string) => source;
  const own = translations[lang] ?? {};
  const vocab = VOCABULARY[lang];
  return (key: string, source: string): string => {
    if (!source) return source;
    const t = own[key]?.trim();
    if (t) return t;
    if (key.startsWith('term.')) return vocab[source] ?? source;
    return source;
  };
}

/** Idioma inicial: el elegido antes, el del navegador si la carta lo ofrece, o español. */
export function pickLanguage(available: ExtraLanguage[], stored: string | null, browser: readonly string[]): MenuLanguage {
  const offered: MenuLanguage[] = ['es', ...available];
  if (stored && offered.includes(stored as MenuLanguage)) return stored as MenuLanguage;
  for (const b of browser) {
    const code = b.slice(0, 2).toLowerCase() as MenuLanguage;
    if (offered.includes(code)) return code;
  }
  return 'es';
}

/** Copia de la carta con los textos en el idioma pedido. El resto de la UI no cambia. */
export function localizeMenu(menu: PublicMenu, lang: MenuLanguage): PublicMenu {
  if (lang === 'es' || !menu.settings.languages.includes(lang)) return menu;
  const t = translator(menu.settings.translations, lang);
  const term = (s: string) => t(tkey.term(s), s);
  return {
    ...menu,
    settings: { ...menu.settings, tagline: t(tkey.tagline(), menu.settings.tagline), intro: t(tkey.intro(), menu.settings.intro) },
    badges: menu.badges.map((b) => ({ ...b, label: t(tkey.badge(b.key), b.label) })),
    categories: menu.categories.map((c) => ({
      ...c, name: t(tkey.category(c.id, 'name'), c.name), description: t(tkey.category(c.id, 'description'), c.description),
    })),
    products: menu.products.map((p) => ({
      ...p,
      name: t(tkey.product(p.id, 'name'), p.name),
      description: t(tkey.product(p.id, 'description'), p.description),
      // Una historia sin traducir confunde más de lo que suma: se omite.
      story: (menu.settings.translations[lang]?.[tkey.product(p.id, 'story')] ?? '').trim(),
      portion: t(tkey.product(p.id, 'portion'), p.portion),
      foodInfo: t(tkey.product(p.id, 'foodInfo'), p.foodInfo),
      tags: p.tags.map(term),
      allergens: p.allergens.map(term),
      ingredients: p.ingredients.map(term),
    })),
    optionGroups: menu.optionGroups.map((g) => ({
      ...g, name: t(tkey.group(g.id), g.name), options: g.options.map((o) => ({ ...o, name: t(tkey.option(o.id), o.name) })),
    })),
    promotions: menu.promotions.map((p) => ({
      ...p,
      title: t(tkey.promotion(p.id, 'title'), p.title),
      description: t(tkey.promotion(p.id, 'description'), p.description),
      conditions: t(tkey.promotion(p.id, 'conditions'), p.conditions),
    })),
    loyalty: menu.loyalty && {
      ...menu.loyalty,
      name: t(tkey.loyalty('name'), menu.loyalty.name),
      reward: t(tkey.loyalty('reward'), menu.loyalty.reward),
      terms: t(tkey.loyalty('terms'), menu.loyalty.terms),
    },
  };
}

export interface TranslatableGroup {
  title: string;
  entries: { key: string; label: string; source: string; long?: boolean }[];
}

/** Todos los textos traducibles de la organización, agrupados para el panel. */
export function translatableGroups(b: OrganizationBundle): TranslatableGroup[] {
  const groups: TranslatableGroup[] = [];
  const add = (title: string, entries: TranslatableGroup['entries']) => {
    const filled = entries.filter((e) => e.source.trim());
    if (filled.length) groups.push({ title, entries: filled });
  };
  add('Presentación', [
    { key: tkey.tagline(), label: 'Frase breve', source: b.settings.tagline },
    { key: tkey.intro(), label: 'Texto de bienvenida', source: b.settings.intro, long: true },
  ]);
  for (const c of [...b.categories].sort((x, y) => x.position - y.position)) {
    add(`Categoría · ${c.name}`, [
      { key: tkey.category(c.id, 'name'), label: 'Nombre', source: c.name },
      { key: tkey.category(c.id, 'description'), label: 'Descripción', source: c.description, long: true },
    ]);
    for (const p of b.products.filter((x) => x.categoryId === c.id && x.status !== 'archived').sort((x, y) => x.position - y.position)) {
      add(p.name, [
        { key: tkey.product(p.id, 'name'), label: 'Nombre', source: p.name },
        { key: tkey.product(p.id, 'description'), label: 'Descripción', source: p.description, long: true },
        { key: tkey.product(p.id, 'story'), label: 'Historia', source: p.story, long: true },
        { key: tkey.product(p.id, 'portion'), label: 'Porción', source: p.portion },
        { key: tkey.product(p.id, 'foodInfo'), label: 'Información alimentaria', source: p.foodInfo, long: true },
      ]);
    }
  }
  for (const g of b.optionGroups) {
    add(`Opciones · ${g.internalName || g.name}`, [
      { key: tkey.group(g.id), label: 'Nombre del grupo', source: g.name },
      ...g.options.map((o) => ({ key: tkey.option(o.id), label: 'Opción', source: o.name })),
    ]);
  }
  for (const p of b.promotions) {
    add(`Promoción · ${p.title}`, [
      { key: tkey.promotion(p.id, 'title'), label: 'Título', source: p.title },
      { key: tkey.promotion(p.id, 'description'), label: 'Descripción', source: p.description, long: true },
      { key: tkey.promotion(p.id, 'conditions'), label: 'Condiciones', source: p.conditions, long: true },
    ]);
  }
  add('Etiquetas destacadas', b.badges.map((x) => ({ key: tkey.badge(x.key), label: 'Etiqueta', source: x.label })));
  const terms = [...new Set(b.products.flatMap((p) => [...p.tags, ...p.allergens, ...p.ingredients]))].sort((x, y) => x.localeCompare(y, 'es'));
  add('Etiquetas, alérgenos e ingredientes', terms.map((x) => ({ key: tkey.term(x), label: 'Término', source: x })));
  add('Tarjeta de fidelidad', [
    { key: tkey.loyalty('name'), label: 'Nombre', source: b.loyalty.name },
    { key: tkey.loyalty('reward'), label: 'Premio', source: b.loyalty.reward },
    { key: tkey.loyalty('terms'), label: 'Condiciones', source: b.loyalty.terms, long: true },
  ]);
  return groups;
}

/** Sugerencia del vocabulario incorporado, para mostrar en el panel. */
export function builtInTerm(lang: ExtraLanguage, source: string): string | null {
  return VOCABULARY[lang][source] ?? null;
}

/** Porcentaje traducido por idioma (los términos del vocabulario cuentan como hechos). */
export function translationProgress(groups: TranslatableGroup[], translations: Translations, lang: ExtraLanguage): number {
  const entries = groups.flatMap((g) => g.entries);
  if (!entries.length) return 100;
  const own = translations[lang] ?? {};
  const done = entries.filter((e) => own[e.key]?.trim() || (e.key.startsWith('term.') && builtInTerm(lang, e.source))).length;
  return Math.round((done / entries.length) * 100);
}
