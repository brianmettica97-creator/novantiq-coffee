import { describe, expect, it } from 'vitest';
import { buildMokaStudioBundle } from '../demo/mokaStudio';
import {
  availableModes, buildPublicMenu, comboSeparateValue, dietOptions, homeSections, matchesDiet, productsByCategory, resolveProductMedia,
} from './menu';
import { localizeMenu, pickLanguage, translatableGroups, translationProgress } from './i18n';
import { isPromotionActive, promotionState } from './promotions';
import { normalize, searchProducts } from './search';
import { openStatus } from './time';
import { formatPrice, parsePriceInput, slugify, uniqueSlug } from './format';
import { checkExternalVideoUrl, checkUpload, productSchema, promotionSchema } from './validation';
import type { Promotion } from './types';
import { THEME_PRESETS } from '../theme/presets';
import { contrastRatio } from '../theme/applyTheme';

const TZ = 'America/Argentina/Buenos_Aires';

describe('carta pública', () => {
  const bundle = buildMokaStudioBundle();
  const menu = buildPublicMenu(bundle)!;

  it('muestra las categorías visibles en orden y cada producto en su categoría', () => {
    const sections = productsByCategory(menu);
    const positions = sections.map((s) => s.category.position);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    for (const s of sections) for (const p of s.products) expect(p.categoryId).toBe(s.category.id);
    const cafes = sections.find((s) => s.category.slug === 'cafes')!;
    expect(cafes.products.map((p) => p.slug)).toContain('cappuccino');
  });

  it('los precios publicados coinciden con los cargados', () => {
    const cap = menu.products.find((p) => p.slug === 'cappuccino')!;
    expect(cap.price).toBe(460000);
    expect(formatPrice(cap.price)).toMatch(/4\.600/);
  });

  it('no publica borradores, archivados ni productos de categorías ocultas', () => {
    const b = buildMokaStudioBundle();
    b.products[0].status = 'archived';
    const hiddenCat = b.categories.find((c) => c.slug === 'salados')!;
    hiddenCat.visible = false;
    const m = buildPublicMenu(b)!;
    expect(m.products.some((p) => p.id === b.products[0].id)).toBe(false);
    expect(m.products.some((p) => p.slug === 'iced-latte-brownie')).toBe(false); // borrador
    expect(m.products.some((p) => p.categoryId === hiddenCat.id)).toBe(false);
    expect(m.categories.some((c) => c.id === hiddenCat.id)).toBe(false);
  });

  it('una carta despublicada o suspendida no se sirve', () => {
    const b = buildMokaStudioBundle();
    b.settings.menuPublished = false;
    expect(buildPublicMenu(b)).toBeNull();
    const c = buildMokaStudioBundle();
    c.organization.status = 'suspended';
    expect(buildPublicMenu(c)).toBeNull();
  });

  it('elimina referencias a productos no publicados', () => {
    const b = buildMokaStudioBundle();
    const medialuna = b.products.find((p) => p.slug === 'medialuna-de-manteca')!;
    medialuna.status = 'draft';
    const m = buildPublicMenu(b)!;
    const cap = m.products.find((p) => p.slug === 'cappuccino')!;
    expect(cap.pairingIds).not.toContain(medialuna.id);
  });

  it('solo incluye archivos referenciados', () => {
    const used = new Set(menu.media.map((m) => m.id));
    for (const p of menu.products) for (const l of p.media) expect(used.has(l.assetId)).toBe(true);
    expect(menu.media.length).toBeLessThan(bundle.media.length + 1);
  });

  it('expone los modos multimedia disponibles, con la foto como alternativa', () => {
    const assets = new Map(menu.media.map((m) => [m.id, m]));
    const cap = menu.products.find((p) => p.slug === 'cappuccino')!;
    const modes = availableModes(cap, resolveProductMedia(cap, assets)).map((m) => m.mode);
    expect(modes).toEqual(['gallery', 'video']);
    const iced = menu.products.find((p) => p.slug === 'iced-latte')!;
    expect(availableModes(iced, resolveProductMedia(iced, assets)).map((m) => m.mode)).toContain('video');
    const chai = menu.products.find((p) => p.slug === 'chai-latte')!;
    expect(availableModes(chai, resolveProductMedia(chai, assets))).toEqual([]);
  });

  it('un video inexistente no rompe la ficha: cae a la foto', () => {
    const espresso = menu.products.find((p) => p.slug === 'espresso')!;
    const assets = new Map(menu.media.filter((m) => m.kind !== 'video').map((m) => [m.id, m]));
    const modes = availableModes(espresso, resolveProductMedia(espresso, assets)).map((m) => m.mode);
    expect(modes).not.toContain('video');
    expect(modes[0]).toBe('gallery');
  });

  it('filtra por dieta y por alérgenos a evitar', () => {
    const { tags, allergens } = dietOptions(menu.products);
    expect(tags).toEqual(expect.arrayContaining(['Vegano', 'Sin TACC', 'Vegetariano']));
    expect(allergens).toEqual(expect.arrayContaining(['Gluten', 'Leche', 'Huevo']));
    const vegan = menu.products.filter((p) => matchesDiet(p, { include: ['Vegano'], avoid: [] }));
    expect(vegan.length).toBeGreaterThan(0);
    expect(vegan.every((p) => p.tags.includes('Vegano'))).toBe(true);
    const noGluten = menu.products.filter((p) => matchesDiet(p, { include: [], avoid: ['Gluten'] }));
    expect(noGluten.length).toBeGreaterThan(0);
    expect(noGluten.some((p) => p.allergens.includes('Gluten'))).toBe(false);
  });

  it('ubica la tarjeta de fidelidad aunque el orden guardado no la incluya', () => {
    expect(homeSections(['promotions', 'featured', 'categories'])).toEqual(['promotions', 'loyalty', 'featured', 'categories']);
    expect(homeSections(['categories', 'loyalty', 'promotions'])).toEqual(['categories', 'loyalty', 'promotions']);
  });

  it('la tarjeta de fidelidad solo se publica con el módulo y el programa activos', () => {
    expect(menu.loyalty?.stampsForReward).toBe(8);
    const off = buildPublicMenu({ ...bundle, settings: { ...bundle.settings, features: { ...bundle.settings.features, loyalty: false } } })!;
    expect(off.loyalty).toBeNull();
    expect(buildPublicMenu({ ...bundle, loyalty: { ...bundle.loyalty, active: false } })!.loyalty).toBeNull();
  });

  it('traduce el contenido y cae al español donde falta', () => {
    const en = localizeMenu(menu, 'en');
    const cat = (m: typeof menu) => m.categories.find((c) => c.slug === 'cafes')!;
    expect(cat(en).name).toBe('Specialty coffee');
    const espresso = en.products.find((p) => p.slug === 'espresso')!;
    expect(espresso.name).toBe('Espresso');
    expect(espresso.description).toMatch(/house blend/);
    // Vocabulario incorporado para alérgenos.
    expect(en.products.find((p) => p.slug === 'cortado')!.allergens).toEqual(['Milk']);
    // Un idioma que la carta no ofrece devuelve la carta original.
    expect(localizeMenu({ ...menu, settings: { ...menu.settings, languages: [] } }, 'pt')).toEqual({ ...menu, settings: { ...menu.settings, languages: [] } });
    expect(translationProgress(translatableGroups(bundle), bundle.settings.translations, 'en')).toBeGreaterThan(90);
  });

  it('elige el idioma guardado, el del navegador o español', () => {
    expect(pickLanguage(['en', 'pt'], 'pt', ['en-US'])).toBe('pt');
    expect(pickLanguage(['en', 'pt'], null, ['pt-BR', 'en'])).toBe('pt');
    expect(pickLanguage(['en'], null, ['fr-FR', 'de'])).toBe('es');
    expect(pickLanguage([], 'en', ['en-US'])).toBe('es');
  });

  it('calcula el valor por separado de un combo', () => {
    const combo = menu.products.find((p) => p.slug === 'desayuno-moka')!;
    expect(comboSeparateValue(combo, menu.products)).toBe(460000 + 2 * 130000 + 390000);
  });
});

describe('promociones', () => {
  const promo: Promotion = {
    id: 'p', organizationId: 'o', title: 'Happy hour', description: '', kind: 'percent_off', percentOff: 20, productIds: ['x'],
    imageAssetId: null, videoAssetId: null, startsAt: '2026-10-01T03:00:00Z', endsAt: '2026-11-01T03:00:00Z',
    days: [1, 2, 3, 4, 5], startTime: '15:00', endTime: '18:00', active: true, conditions: '', position: 0,
  };
  // 2026-10-28 es miércoles. 19:00 UTC = 16:00 en Buenos Aires.
  it('está activa dentro de día, horario y vigencia (hora del local)', () => {
    expect(isPromotionActive(promo, new Date('2026-10-28T19:00:00Z'), TZ)).toBe(true);
  });
  it('fuera de horario o en fin de semana no está activa', () => {
    expect(promotionState(promo, new Date('2026-10-28T22:30:00Z'), TZ)).toBe('outside_hours');
    expect(promotionState(promo, new Date('2026-10-31T19:00:00Z'), TZ)).toBe('outside_hours');
  });
  it('una promoción vencida o programada no se muestra como activa', () => {
    expect(promotionState(promo, new Date('2026-11-02T19:00:00Z'), TZ)).toBe('expired');
    expect(promotionState(promo, new Date('2026-09-15T19:00:00Z'), TZ)).toBe('scheduled');
    expect(promotionState({ ...promo, active: false }, new Date('2026-10-28T19:00:00Z'), TZ)).toBe('paused');
  });
  it('admite horarios que cruzan la medianoche', () => {
    const night = { ...promo, days: [], startTime: '22:00', endTime: '02:00' };
    expect(isPromotionActive(night, new Date('2026-10-29T04:00:00Z'), TZ)).toBe(true); // 01:00 local
    expect(isPromotionActive(night, new Date('2026-10-28T19:00:00Z'), TZ)).toBe(false);
  });
  it('la validación rechaza fechas invertidas y descuentos sin productos', () => {
    const r = promotionSchema.safeParse({ ...promo, productIds: [], endsAt: '2026-09-01T00:00:00Z' });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['productIds', 'endsAt']));
  });
});

describe('búsqueda', () => {
  const b = buildMokaStudioBundle();
  const find = (q: string) => searchProducts(b.products, b.categories, q).map((h) => h.product.slug);
  it('ignora mayúsculas y acentos', () => {
    expect(normalize('  CAFÉ  Frío ')).toBe('cafe frio');
    expect(find('tiramisu')).toContain('tiramisu');
    expect(find('TÉ')[0]).toMatch(/^te-/);
  });
  it('busca por ingredientes, etiquetas y categoría', () => {
    expect(find('sin tacc')).toEqual(expect.arrayContaining(['cold-brew-tonic', 'jugo-de-naranja']));
    expect(find('frambuesas')).toContain('torta-de-chocolate');
    expect(find('panaderia')).toContain('medialuna-de-manteca');
  });
  it('prioriza coincidencias en el nombre', () => {
    expect(find('latte')[0]).toBe('latte');
  });
  it('sin resultados devuelve vacío', () => {
    expect(find('pizza napolitana')).toEqual([]);
  });
});

describe('horarios', () => {
  const hours = [{ day: 3, opens: '08:00', closes: '20:00' }, { day: 4, opens: '08:00', closes: '20:00' }];
  it('indica abierto y la hora de cierre', () => {
    expect(openStatus(hours, new Date('2026-10-28T15:00:00Z'), TZ)).toEqual({ open: true, label: 'Abierto · cierra 20:00' });
  });
  it('indica cuándo abre', () => {
    expect(openStatus(hours, new Date('2026-10-28T06:00:00Z'), TZ)?.label).toBe('Cerrado · abre 08:00');
    expect(openStatus(hours, new Date('2026-10-28T23:30:00Z'), TZ)?.label).toBe('Cerrado · abre mañana 08:00');
  });
});

describe('formatos y validaciones', () => {
  it('interpreta importes en formato local', () => {
    expect(parsePriceInput('4.600')).toBe(460000);
    expect(parsePriceInput('4600,50')).toBe(460050);
    expect(parsePriceInput('$ 12.900')).toBe(1290000);
    expect(parsePriceInput('abc')).toBeNull();
  });
  it('genera slugs únicos y legibles', () => {
    expect(slugify('Café con Leche & Medialunas')).toBe('cafe-con-leche-medialunas');
    expect(uniqueSlug('Latte', ['latte', 'latte-2'])).toBe('latte-3');
  });
  it('valida archivos por tipo, tamaño y extensión', () => {
    expect(checkUpload({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }, 'image').ok).toBe(true);
    expect(checkUpload({ name: 'a.gif', type: 'image/gif', size: 1000 }, 'image').ok).toBe(false);
    expect(checkUpload({ name: 'a.mp4', type: 'video/mp4', size: 60 * 1024 * 1024 }, 'video').ok).toBe(false);
  });
  it('solo acepta videos externos HTTPS de hosts aprobados', () => {
    expect(checkExternalVideoUrl('https://assets.mixkit.co/videos/1/1-720.mp4').ok).toBe(true);
    expect(checkExternalVideoUrl('http://assets.mixkit.co/videos/1/1-720.mp4').ok).toBe(false);
    expect(checkExternalVideoUrl('https://evil.example.com/v.mp4').ok).toBe(false);
    expect(checkExternalVideoUrl('javascript:alert(1)').ok).toBe(false);
  });
  it('un combo necesita al menos dos productos', () => {
    const p = buildMokaStudioBundle().products.find((x) => x.kind === 'combo')!;
    expect(productSchema.safeParse({ ...p, comboItems: p.comboItems.slice(0, 1) }).success).toBe(false);
    expect(productSchema.safeParse(p).success).toBe(true);
  });
});

describe('temas', () => {
  it('todas las paletas predefinidas cumplen contraste AA', () => {
    for (const t of THEME_PRESETS) {
      expect(contrastRatio(t.colors.ink, t.colors.background), `${t.key} ink`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.colors.muted, t.colors.background), `${t.key} muted`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.colors.accentInk, t.colors.accent), `${t.key} accent`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
