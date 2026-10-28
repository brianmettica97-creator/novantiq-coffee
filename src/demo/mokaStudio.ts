// Cafetería ficticia de demostración "Moka Studio".
// Todo lo de este archivo es contenido de DEMOSTRACIÓN: precios, dirección y
// textos son ilustrativos. La organización se marca con isDemo = true y la
// misma definición genera supabase/seed.sql (scripts/generate-seed-sql.ts).
import { demoTranslations } from './translations';
import mediaIndex from './generated/media-index.json';
import { withBase } from '../config/env';
import type {
  Badge, Category, CategoryLayout, MediaAsset, MediaRole, OptionGroup, OrganizationBundle,
  Product, ProductOptionGroupLink, Promotion,
} from '../domain/types';
import { THEME_PRESETS } from '../theme/presets';
import { demoId } from './ids';

export const DEMO_SLUG = 'moka-studio';
const ORG = demoId('org:moka-studio');
const CREATED = '2026-10-01T12:00:00.000Z';

type ImageEntry = { width: number; height: number; variants: Record<string, string>; lqip: string; source: string; license: string };
const idx = mediaIndex as unknown as {
  images: Record<string, ImageEntry>;
  videos: Record<string, { src: string; poster: string; bytes: number; source: string; license: string }>;
};

/* -------------------------------------------------------------- Media */

const media: MediaAsset[] = [];
const base = {
  organizationId: ORG, focalX: 50, focalY: 50, createdAt: CREATED,
  placeholder: null as string | null, posterUrl: null as string | null, width: null as number | null,
  height: null as number | null, variants: [] as MediaAsset['variants'],
};

function img(key: string, alt: string, focalY = 50): string {
  const e = idx.images[key];
  if (!e) throw new Error(`Falta la imagen de demo "${key}". Ejecutá npm run media:demo`);
  const id = demoId(`img:${key}`);
  if (media.some((m) => m.id === id)) return id;
  const ratio = e.height / e.width;
  media.push({
    ...base, id, kind: 'image', title: key, alt, focalY,
    url: withBase(e.variants['1600']),
    variants: Object.entries(e.variants).map(([w, url]) => ({ width: Number(w), url: withBase(url) })),
    placeholder: e.lqip, width: 1600, height: Math.round(1600 * ratio),
    mimeType: 'image/webp', bytes: 0, credit: `${e.license} · ${e.source}`,
  });
  return id;
}

function video(key: string, title: string): string {
  const e = idx.videos[key];
  const id = demoId(`video:${key}`);
  media.push({
    ...base, id, kind: 'video', title, alt: title, url: withBase(e.src), posterUrl: withBase(e.poster),
    mimeType: 'video/mp4', bytes: e.bytes, credit: `${e.license} · ${e.source}`,
  });
  return id;
}

const logoId = demoId('img:logo');
media.push({
  ...base, id: logoId, kind: 'image', title: 'Logotipo Moka Studio', alt: 'Moka Studio',
  url: withBase('/demo/moka-studio/logo.svg'), variants: [], mimeType: 'image/svg+xml', bytes: 0,
  width: 240, height: 240, credit: 'Logotipo ficticio creado para la demo',
});

/* ----------------------------------------------------- Option groups */

let optSeq = 0;
function group(key: string, g: Omit<OptionGroup, 'id' | 'organizationId' | 'options'> & {
  options: [name: string, delta: number, isDefault?: boolean, available?: boolean][];
}): OptionGroup {
  return {
    ...g,
    id: demoId(`group:${key}`),
    organizationId: ORG,
    options: g.options.map(([name, delta, isDefault = false, available = true], i) => ({
      id: demoId(`opt:${key}:${optSeq++}`), name, priceDelta: delta * 100, isDefault, available, position: i,
    })),
  };
}

const G = {
  size: group('size', {
    name: 'Tamaño', internalName: 'Tamaños de bebida caliente', required: true, minSelect: 1, maxSelect: 1,
    options: [['Chico · 240 ml', 0, true], ['Mediano · 360 ml', 900], ['Grande · 480 ml', 1600]],
  }),
  coldSize: group('cold-size', {
    name: 'Tamaño', internalName: 'Tamaños de bebida fría', required: true, minSelect: 1, maxSelect: 1,
    options: [['Regular · 400 ml', 0, true], ['Grande · 550 ml', 1400]],
  }),
  milk: group('milk', {
    name: 'Leche', internalName: 'Tipos de leche', required: true, minSelect: 1, maxSelect: 1,
    options: [['Entera', 0, true], ['Descremada', 0], ['Deslactosada', 0], ['Avena', 700], ['Almendras', 900]],
  }),
  coffee: group('coffee', {
    name: 'Café', internalName: 'Regular o descafeinado', required: true, minSelect: 1, maxSelect: 1,
    options: [['Blend de la casa', 0, true], ['Descafeinado', 0]],
  }),
  extras: group('extras', {
    name: 'Extras', internalName: 'Extras de cafetería', required: false, minSelect: 0, maxSelect: 3,
    options: [['Shot extra de espresso', 1100], ['Jarabe de vainilla', 600], ['Jarabe de caramelo', 600], ['Crema batida', 700], ['Canela', 0]],
  }),
  ice: group('ice', {
    name: 'Hielo', internalName: 'Cantidad de hielo', required: true, minSelect: 1, maxSelect: 1,
    options: [['Normal', 0, true], ['Poco hielo', 0], ['Sin hielo', 0]],
  }),
  sweet: group('sweet', {
    name: 'Endulzar', internalName: 'Endulzantes', required: false, minSelect: 0, maxSelect: 1,
    options: [['Azúcar', 0], ['Edulcorante', 0], ['Miel orgánica', 400]],
  }),
  bread: group('bread', {
    name: 'Pan', internalName: 'Panes para tostadas', required: true, minSelect: 1, maxSelect: 1,
    options: [['Masa madre', 0, true], ['Integral de semillas', 0], ['Sin TACC', 1500]],
  }),
  eggs: group('eggs', {
    name: 'Huevos', internalName: 'Cocción de huevos', required: true, minSelect: 1, maxSelect: 1,
    options: [['Revueltos', 0, true], ['Poché', 0], ['Fritos', 0]],
  }),
  brunchDrink: group('brunch-drink', {
    name: 'Bebida incluida', internalName: 'Bebida de desayunos', required: true, minSelect: 1, maxSelect: 1,
    options: [['Café con leche', 0, true], ['Cappuccino', 0], ['Té de hebras', 0], ['Jugo de naranja', 900]],
  }),
};
const optionGroups = Object.values(G);

function links(...groups: (OptionGroup | [OptionGroup, Record<number, { delta?: number; available?: boolean }>])[]): ProductOptionGroupLink[] {
  return groups.map((entry, position) => {
    const [g, ov] = Array.isArray(entry) ? entry : [entry, {}];
    const overrides: ProductOptionGroupLink['overrides'] = {};
    for (const [i, o] of Object.entries(ov)) {
      overrides[g.options[Number(i)].id] = {
        ...(o.delta !== undefined ? { priceDelta: o.delta * 100 } : {}),
        ...(o.available !== undefined ? { available: o.available } : {}),
      };
    }
    return { groupId: g.id, position, overrides };
  });
}

/* --------------------------------------------------------- Categories */

const categories: Category[] = [];
function category(slug: string, name: string, layout: CategoryLayout, description: string, image?: string): string {
  const id = demoId(`cat:${slug}`);
  categories.push({
    id, organizationId: ORG, slug, name, description, layout, visible: true,
    position: categories.length, imageAssetId: image ?? null,
  });
  return id;
}

const C = {
  cafes: category('cafes', 'Cafés de especialidad', 'feature', 'Blend de la casa de Brasil y Colombia, tostado medio. Filtrados de origen único que rotan cada mes.', img('cat-cafe', 'Herramientas de barista y café en granos sobre madera')),
  frios: category('cafes-frios', 'Cafés fríos', 'grid', 'Extracciones en frío y espresso sobre hielo.'),
  te: category('te-matcha-chocolate', 'Té, matcha y chocolate', 'list', 'Para los que prefieren algo distinto al café.'),
  jugos: category('limonadas-jugos', 'Limonadas y jugos', 'list', 'Exprimidos en el momento.'),
  panaderia: category('panaderia', 'Panadería', 'carousel', 'Laminados con manteca y horneados durante toda la mañana.', img('cat-pasteleria', 'Vitrina de panadería con medialunas y croissants')),
  tortas: category('tortas-pasteleria', 'Tortas y pastelería', 'grid', 'Pastelería de autor. Porciones generosas, ideales para compartir.'),
  brunch: category('desayunos-brunch', 'Desayunos y brunch', 'feature', 'Servimos brunch todo el día.', img('cat-brunch', 'Mesa de brunch con waffles, frutas y café')),
  salados: category('salados', 'Salados', 'grid', 'Tostados y sándwiches en pan de masa madre.'),
  combos: category('combos-meriendas', 'Combos y meriendas', 'grid', 'Combinaciones pensadas para cada momento del día.'),
};

/* ----------------------------------------------------------- Products */

const products: Product[] = [];
type ProductInput = Partial<Omit<Product, 'media' | 'price' | 'optionGroups'>> & {
  slug: string; name: string; category: string; price: number;
  photo?: string; gallery?: string[]; video?: string;
  options?: ProductOptionGroupLink[];
};

function product(p: ProductInput): string {
  const id = demoId(`product:${p.slug}`);
  const linksM: { assetId: string; role: MediaRole }[] = [];
  if (p.photo) linksM.push({ assetId: p.photo, role: 'primary' });
  for (const g of p.gallery ?? []) linksM.push({ assetId: g, role: 'gallery' });
  if (p.video) linksM.push({ assetId: p.video, role: 'video' });
  products.push({
    id, organizationId: ORG, categoryId: p.category, kind: p.kind ?? 'item', name: p.name, slug: p.slug,
    description: p.description ?? '', story: p.story ?? '', price: p.price * 100,
    status: p.status ?? 'published', available: p.available ?? true,
    position: products.filter((x) => x.categoryId === p.category).length,
    badges: p.badges ?? [], tags: p.tags ?? [], allergens: p.allergens ?? [], ingredients: p.ingredients ?? [],
    size: p.size ?? '', portion: p.portion ?? '', prepMinutes: p.prepMinutes ?? null, foodInfo: p.foodInfo ?? '',
    displayMode: p.displayMode ?? 'photo',
    media: linksM.map((m, position) => ({ ...m, position })),
    optionGroups: p.options ?? [], pairingIds: [], relatedIds: [], comboItems: p.comboItems ?? [],
    station: p.station ?? null, createdAt: CREATED, updatedAt: CREATED,
  });
  return id;
}

const LACTOSA = 'Leche';

// Cafés
const espresso = product({
  slug: 'espresso', name: 'Espresso', category: C.cafes, price: 3200,
  description: 'Doble ristretto del blend de la casa. Notas de cacao, nuez y caramelo.',
  story: 'Extraemos 18 g de café en 28 segundos para lograr un espresso denso, dulce y con crema persistente.',
  photo: img('espresso', 'Espresso en vaso de vidrio sobre plato'), gallery: [img('espresso-2', 'Taza de espresso vista desde arriba'), img('espresso-3', 'Portafiltros con café molido y en grano')],
  video: video('espresso', 'Extracción de espresso'), displayMode: 'video', size: '60 ml', prepMinutes: 3,
  options: links(G.coffee, G.sweet), station: 'barra', ingredients: ['Café de especialidad'],
});
const cortado = product({
  slug: 'cortado', name: 'Cortado', category: C.cafes, price: 3500,
  description: 'Espresso con un toque de leche texturizada, servido en vaso.',
  photo: img('cortado', 'Cortado en vaso pequeño sobre mesa clara'), size: '120 ml',
  options: links(G.coffee, G.milk, G.sweet), allergens: [LACTOSA], station: 'barra',
});
const cappuccino = product({
  slug: 'cappuccino', name: 'Cappuccino', category: C.cafes, price: 4600,
  description: 'Espresso, leche texturizada y una capa de espuma sedosa con latte art.',
  story: 'Nuestro cappuccino clásico en taza de cerámica. Se sirve con plato, cucharita y amaretti.',
  photo: img('cappuccino', 'Cappuccino con latte art en taza blanca'), gallery: [img('cappuccino-2', 'Dos cappuccinos con latte art sobre mesa')],
  video: video('cappuccino', 'Latte art de un cappuccino'),
  badges: ['casa'], options: links(G.size, G.milk, G.coffee, G.extras), allergens: [LACTOSA], size: '240 ml',
  prepMinutes: 4, station: 'barra', ingredients: ['Espresso doble', 'Leche texturizada', 'Amaretti'],
});
const flatWhite = product({
  slug: 'flat-white', name: 'Flat white', category: C.cafes, price: 4800,
  description: 'Doble ristretto con microespuma fina. Más café, menos espuma.',
  photo: img('flat-white', 'Leche vertida formando latte art en una taza'),
  options: links(G.milk, G.coffee, G.extras), allergens: [LACTOSA], size: '180 ml', station: 'barra', badges: ['recomendado'],
});
const latte = product({
  slug: 'latte', name: 'Latte', category: C.cafes, price: 4900,
  description: 'Espresso suave con abundante leche texturizada. Servido en vaso doble.',
  photo: img('latte', 'Latte con latte art en vaso de vidrio doble'),
  options: links(G.size, G.milk, G.coffee, G.extras), allergens: [LACTOSA], station: 'barra',
});
const filtrado = product({
  slug: 'filtrado-v60', name: 'Filtrado V60', category: C.cafes, price: 5200,
  description: 'Café de origen único preparado a mano en V60. Pregunta por el origen del mes.',
  story: 'Un método lento que resalta la acidez y las notas frutales del grano. Lo preparamos en la barra frente a vos.',
  photo: img('filtrado', 'Taza de café de filtro vista desde arriba'), video: video('filtrado', 'Preparación de café en V60'),
  displayMode: 'video', size: '300 ml', prepMinutes: 6, badges: ['limitado'], tags: ['Vegano'], station: 'barra',
  ingredients: ['Café de origen único', 'Agua filtrada'],
});

// Fríos
const icedLatte = product({
  slug: 'iced-latte', name: 'Iced latte', category: C.frios, price: 5400,
  description: 'Doble espresso sobre leche fría y hielo.',
  photo: img('iced-latte', 'Iced latte en vaso con capas de café y leche'), gallery: [img('iced-latte-2', 'Iced latte servido en vaso de vidrio')],
  video: video('iced-latte', 'Barista preparando un iced latte'),
  badges: ['nuevo'], options: links(G.coldSize, G.milk, G.ice, G.extras), allergens: [LACTOSA], station: 'barra',
});
const coldBrew = product({
  slug: 'cold-brew-tonic', name: 'Cold brew tonic', category: C.frios, price: 5600,
  description: 'Cold brew de 18 horas con agua tónica y piel de naranja.',
  photo: img('cold-brew', 'Cold brew con tónica en vaso alto'), options: links(G.coldSize, G.ice),
  tags: ['Vegano', 'Sin TACC'], station: 'barra',
});
const frappe = product({
  slug: 'frappe-moka', name: 'Frappé moka', category: C.frios, price: 6200,
  description: 'Café, chocolate amargo, hielo y crema batida con galletitas.',
  photo: img('frappe', 'Frappé de chocolate con crema y galletitas'),
  options: links([G.coldSize, { 1: { delta: 1800 } }], G.milk), allergens: [LACTOSA, 'Gluten'], station: 'barra',
});

// Té, matcha y chocolate
const matcha = product({
  slug: 'matcha-latte', name: 'Matcha latte', category: C.te, price: 5300,
  description: 'Matcha ceremonial batido a mano con leche texturizada.',
  photo: img('matcha', 'Matcha latte con latte art en taza'), options: links(G.size, G.milk, G.sweet), allergens: [LACTOSA], station: 'barra',
});
const teHebras = product({
  slug: 'te-de-hebras', name: 'Té de hebras', category: C.te, price: 3600,
  description: 'Selección de blends: earl grey, verde jazmín, rooibos o frutos rojos.',
  photo: img('te-hebras', 'Taza de té de hebras con velas'), tags: ['Vegano', 'Sin TACC'], options: links(G.sweet), station: 'barra',
});
const chocolate = product({
  slug: 'chocolate-caliente', name: 'Chocolate caliente', category: C.te, price: 4900,
  description: 'Chocolate semiamargo 70 % fundido en leche. Espeso y poco dulce.',
  photo: img('chocolate-caliente', 'Chocolate caliente vertido en una taza'), options: links(G.size, G.milk, G.extras), allergens: [LACTOSA], station: 'barra',
});
product({
  slug: 'chai-latte', name: 'Chai latte', category: C.te, price: 4900,
  description: 'Té negro especiado con cardamomo, canela y jengibre.', options: links(G.size, G.milk), allergens: [LACTOSA], station: 'barra',
});

// Limonadas y jugos
product({
  slug: 'limonada-menta-jengibre', name: 'Limonada de menta y jengibre', category: C.jugos, price: 4200,
  description: 'Limón exprimido, menta fresca y jengibre.', photo: img('limonada', 'Limonada con menta y rodajas de limón'),
  tags: ['Vegano', 'Sin TACC'], options: links(G.ice, G.sweet), station: 'barra',
});
const jugo = product({
  slug: 'jugo-de-naranja', name: 'Jugo de naranja', category: C.jugos, price: 3900,
  description: 'Naranjas exprimidas en el momento.', photo: img('jugo-naranja', 'Vaso de jugo de naranja con rodaja'),
  tags: ['Vegano', 'Sin TACC'], size: '350 ml', station: 'barra',
});
product({
  slug: 'te-frio-durazno', name: 'Té frío de durazno', category: C.jugos, price: 4000,
  description: 'Té negro infusionado en frío con durazno y lima.', photo: img('te-frio', 'Té frío con hielo y lima'),
  tags: ['Vegano', 'Sin TACC'], options: links(G.ice), station: 'barra',
});

// Panadería
const medialuna = product({
  slug: 'medialuna-de-manteca', name: 'Medialuna de manteca', category: C.panaderia, price: 1300,
  description: 'Laminada con manteca y pintada con almíbar. Horneada cada mañana.',
  photo: img('medialunas', 'Medialunas de manteca apiladas'),
  badges: ['casa'], allergens: ['Gluten', LACTOSA, 'Huevo'], portion: '1 unidad', station: 'pasteleria',
});
const croissant = product({
  slug: 'croissant-frances', name: 'Croissant francés', category: C.panaderia, price: 2400,
  description: 'Croissant de 27 capas, crocante por fuera y alveolado por dentro.',
  photo: img('croissant', 'Croissant dorado con azúcar impalpable'), allergens: ['Gluten', LACTOSA], station: 'pasteleria',
});
const cookie = product({
  slug: 'cookie-chocolate', name: 'Cookie de chocolate', category: C.panaderia, price: 2600,
  description: 'Masa madurada 24 horas, chips de chocolate semiamargo y sal en escamas.',
  photo: img('cookie', 'Cookies con chips de chocolate en una canasta'), gallery: [img('cookie-2', 'Cookie partida con chocolate fundido')],
  allergens: ['Gluten', LACTOSA, 'Huevo'], badges: ['recomendado'], station: 'pasteleria',
});
const brownie = product({
  slug: 'brownie', name: 'Brownie húmedo', category: C.panaderia, price: 3100,
  description: 'Chocolate 70 %, nueces tostadas y centro húmedo.',
  photo: img('brownie', 'Brownies de chocolate apilados'), allergens: ['Gluten', LACTOSA, 'Huevo', 'Frutos secos'], station: 'pasteleria',
});
product({
  slug: 'alfajor-maicena', name: 'Alfajor de maicena', category: C.panaderia, price: 1900,
  description: 'Dulce de leche y coco rallado. Receta de la casa.', allergens: ['Gluten', LACTOSA, 'Huevo'], station: 'pasteleria',
});

// Tortas
const tortaChoco = product({
  slug: 'torta-de-chocolate', name: 'Torta de chocolate', category: C.tortas, price: 6500,
  description: 'Bizcocho de cacao, ganache brillante, rosetas de crema y frambuesas.',
  story: 'Nuestra torta insignia. Se vende por porción o entera por encargo.',
  photo: img('torta-chocolate', 'Torta de chocolate con ganache y rosetas'),
  badges: ['casa'], allergens: ['Gluten', LACTOSA, 'Huevo'], portion: 'Porción · torta entera por encargo', station: 'pasteleria',
});
product({
  slug: 'selva-negra', name: 'Selva negra', category: C.tortas, price: 6800,
  description: 'Capas de chocolate, crema y cerezas al kirsch.',
  photo: img('selva-negra', 'Torta selva negra con cerezas'), allergens: ['Gluten', LACTOSA, 'Huevo'], station: 'pasteleria',
});
const cheesecake = product({
  slug: 'cheesecake-frutos-rojos', name: 'Cheesecake de frutos rojos', category: C.tortas, price: 6600,
  description: 'Estilo New York sobre base de galletas, con coulis de frutos del bosque.',
  photo: img('cheesecake', 'Porción de cheesecake con frutos rojos'), allergens: ['Gluten', LACTOSA, 'Huevo'], station: 'pasteleria',
});
const tiramisu = product({
  slug: 'tiramisu', name: 'Tiramisú de la casa', category: C.tortas, price: 6900,
  description: 'Vainillas embebidas en espresso, crema de mascarpone y cacao amargo.',
  photo: img('tiramisu', 'Porción de tiramisú en capas con cacao'), video: video('tiramisu', 'Corte de una torta de chocolate'),
  badges: ['recomendado'], allergens: ['Gluten', LACTOSA, 'Huevo'], station: 'pasteleria',
});
product({
  slug: 'fraisier', name: 'Fraisier', category: C.tortas, price: 7200,
  description: 'Bizcocho genovés, crema muselina y frutillas frescas.',
  photo: img('fraisier', 'Fraisier con frutillas y cobertura rosada'), badges: ['limitado'],
  allergens: ['Gluten', LACTOSA, 'Huevo'], station: 'pasteleria', available: false,
});

// Desayunos y brunch
const brunch = product({
  slug: 'brunch-para-compartir', name: 'Brunch para compartir', category: C.brunch, price: 26900,
  description: 'Waffles, huevos, frutas, yogur con granola, tostadas, dos bebidas calientes y dos jugos.',
  story: 'Pensado para dos personas. Ideal para sentarse sin apuro el fin de semana.',
  photo: img('brunch-compartir', 'Mesa de brunch con waffles, huevos y frutas'), portion: 'Para 2 personas', prepMinutes: 20,
  badges: ['casa'], allergens: ['Gluten', LACTOSA, 'Huevo'], station: 'cocina',
});
const benedict = product({
  slug: 'huevos-benedictinos', name: 'Huevos benedictinos', category: C.brunch, price: 11800,
  description: 'Muffin inglés, jamón natural, huevos poché y salsa holandesa.',
  photo: img('benedictinos', 'Huevos benedictinos con salsa holandesa'), allergens: ['Gluten', LACTOSA, 'Huevo'], prepMinutes: 15, station: 'cocina',
});
const avocado = product({
  slug: 'tostada-de-palta', name: 'Tostada de palta', category: C.brunch, price: 9800,
  description: 'Masa madre, palta, huevo a elección, semillas y aceite de oliva.',
  photo: img('tostada-palta', 'Tostadas de palta con huevo'), options: links(G.bread, G.eggs),
  tags: ['Vegetariano'], allergens: ['Gluten', 'Huevo', 'Sésamo'], prepMinutes: 12, station: 'cocina',
});
product({
  slug: 'pancakes', name: 'Pancakes con banana', category: C.brunch, price: 9200,
  description: 'Pila de pancakes, banana caramelizada y miel de maple.',
  photo: img('pancakes', 'Pila de pancakes con banana y miel'), tags: ['Vegetariano'], allergens: ['Gluten', LACTOSA, 'Huevo'], station: 'cocina',
});
product({
  slug: 'french-toast', name: 'French toast', category: C.brunch, price: 9600,
  description: 'Brioche, frutos rojos, banana y crema de mascarpone.',
  photo: img('french-toast', 'French toast con frutos rojos y banana'), tags: ['Vegetariano'], allergens: ['Gluten', LACTOSA, 'Huevo'], station: 'cocina',
});
product({
  slug: 'bowl-de-huevos', name: 'Bowl de huevos y palta', category: C.brunch, price: 10400,
  description: 'Huevos duros, palta, hojas verdes, semillas y pan tostado.',
  photo: img('bowl-huevos', 'Bowl con huevos, palta y hojas verdes'), tags: ['Vegetariano'], allergens: ['Huevo', 'Gluten'], station: 'cocina',
  options: links(G.bread, G.brunchDrink), badges: ['nuevo'],
});

// Salados
product({
  slug: 'tostado-jamon-queso', name: 'Tostado de jamón y queso', category: C.salados, price: 6900,
  description: 'Pan de miga, jamón natural y queso tybo. Un clásico.',
  photo: img('tostado', 'Tostado de jamón y queso cortado en triángulos'), allergens: ['Gluten', LACTOSA], station: 'cocina',
});
product({
  slug: 'baguette-caprese', name: 'Baguette caprese', category: C.salados, price: 8400,
  description: 'Baguette, tomate, mozzarella fresca, rúcula y pesto.',
  photo: img('baguette', 'Baguette rellena con tomate y hojas verdes'), tags: ['Vegetariano'], allergens: ['Gluten', LACTOSA, 'Frutos secos'], station: 'cocina',
});
product({
  slug: 'sandwich-club', name: 'Sándwich club', category: C.salados, price: 9100,
  description: 'Pan integral, pollo, panceta, lechuga, tomate y mayonesa casera.',
  photo: img('club', 'Sándwich club con lechuga y tomate'), allergens: ['Gluten', 'Huevo'], station: 'cocina',
});

// Combos (precio fijo: no cambia si cambia el precio de sus componentes)
const desayunoMoka = product({
  slug: 'desayuno-moka', name: 'Desayuno Moka', category: C.combos, kind: 'combo', price: 6800,
  description: 'Café con leche o cappuccino chico, dos medialunas y jugo de naranja chico.',
  photo: img('te-cookies', 'Taza de café con galletitas'), station: null,
  comboItems: [
    { productId: cappuccino, quantity: 1, substituteIds: [latte, teHebras] },
    { productId: medialuna, quantity: 2, substituteIds: [croissant] },
    { productId: jugo, quantity: 1, substituteIds: [] },
  ],
  badges: ['recomendado'],
});
product({
  slug: 'merienda-para-dos', name: 'Merienda para dos', category: C.combos, kind: 'combo', price: 17900,
  description: 'Dos cafés a elección, dos porciones de torta y dos cookies.',
  photo: img('merienda-dos', 'Dos personas brindando con cappuccinos'),
  comboItems: [
    { productId: latte, quantity: 2, substituteIds: [cappuccino, flatWhite] },
    { productId: tortaChoco, quantity: 2, substituteIds: [cheesecake, tiramisu] },
    { productId: cookie, quantity: 2, substituteIds: [brownie] },
  ],
});
const cafeTorta = product({
  slug: 'cafe-y-torta', name: 'Café + porción de torta', category: C.combos, kind: 'combo', price: 9900,
  description: 'Cualquier café de la carta con una porción de torta a elección.',
  photo: img('frambuesa', 'Porción de torta de frambuesa con frutillas'), video: video('promo-cafe-torta', 'Café y torta de chocolate'),
  displayMode: 'video',
  comboItems: [
    { productId: cappuccino, quantity: 1, substituteIds: [latte, flatWhite, espresso] },
    { productId: tortaChoco, quantity: 1, substituteIds: [cheesecake, tiramisu] },
  ],
});
product({
  slug: 'iced-latte-brownie', name: 'Iced latte + brownie', category: C.combos, kind: 'combo', price: 7600,
  description: 'Para las tardes de calor: iced latte regular y brownie húmedo.',
  photo: img('brownie', 'Brownies de chocolate apilados'), status: 'draft',
  comboItems: [{ productId: icedLatte, quantity: 1, substituteIds: [coldBrew] }, { productId: brownie, quantity: 1, substituteIds: [] }],
});

// Recomendaciones de combinación y relacionados
const pairings: Record<string, string[]> = {
  [cappuccino]: [medialuna, cookie, tortaChoco],
  [espresso]: [brownie, cookie],
  [flatWhite]: [croissant, cheesecake],
  [latte]: [medialuna, tiramisu],
  [icedLatte]: [brownie, cookie],
  [tortaChoco]: [espresso, filtrado],
  [tiramisu]: [espresso, cappuccino],
  [medialuna]: [cappuccino, latte],
  [brunch]: [jugo, chocolate],
  [avocado]: [jugo, flatWhite],
  [benedict]: [cappuccino],
  [matcha]: [cookie],
};
const related: Record<string, string[]> = {
  [cappuccino]: [flatWhite, latte, cortado],
  [latte]: [cappuccino, flatWhite],
  [icedLatte]: [coldBrew, frappe],
  [tortaChoco]: [tiramisu, cheesecake],
  [medialuna]: [croissant],
  [cafeTorta]: [desayunoMoka],
};
for (const p of products) {
  p.pairingIds = pairings[p.id] ?? [];
  p.relatedIds = related[p.id] ?? [];
}

/* --------------------------------------------------------- Promotions */

const promotions: Promotion[] = [
  {
    id: demoId('promo:happy-hour-frio'), organizationId: ORG, title: 'Happy hour de cafés fríos',
    description: '20 % de descuento en cafés fríos de lunes a viernes por la tarde.',
    kind: 'percent_off', percentOff: 20, productIds: [icedLatte, coldBrew, frappe],
    imageAssetId: img('iced-latte-2', 'Iced latte'), videoAssetId: null,
    startsAt: '2026-10-01T03:00:00.000Z', endsAt: '2027-03-31T03:00:00.000Z',
    days: [1, 2, 3, 4, 5], startTime: '15:00', endTime: '18:00', active: true,
    conditions: 'Válido para consumo en el local. No acumulable con otras promociones.', position: 0,
  },
  {
    id: demoId('promo:cafe-torta'), organizationId: ORG, title: 'Café + porción de torta',
    description: 'Tu café favorito con una porción de torta a elección por un precio especial.',
    kind: 'combo_price', percentOff: null, productIds: [cafeTorta],
    imageAssetId: null, videoAssetId: demoId('video:promo-cafe-torta'),
    startsAt: null, endsAt: null, days: [], startTime: '', endTime: '', active: true,
    conditions: 'Todos los días, hasta agotar stock de tortas.', position: 1,
  },
  {
    id: demoId('promo:semana-alfajor'), organizationId: ORG, title: 'Semana del alfajor',
    description: 'Promoción vencida: se conserva como ejemplo y no aparece en la carta pública.',
    kind: 'announcement', percentOff: null, productIds: [], imageAssetId: null, videoAssetId: null,
    startsAt: '2026-09-01T03:00:00.000Z', endsAt: '2026-09-08T03:00:00.000Z', days: [], startTime: '', endTime: '',
    active: true, conditions: '', position: 2,
  },
];

/* --------------------------------------------------------- Bundle */

export const DEFAULT_BADGES: Badge[] = [
  { key: 'casa', label: 'Especialidad de la casa', tone: 'accent', requiresEvidence: false },
  { key: 'nuevo', label: 'Nuevo', tone: 'dark', requiresEvidence: false },
  { key: 'limitado', label: 'Edición limitada', tone: 'dark', requiresEvidence: false },
  { key: 'recomendado', label: 'Recomendado', tone: 'light', requiresEvidence: false },
  { key: 'mas-vendido', label: 'Más vendido', tone: 'accent', requiresEvidence: true },
];

const coverImage = img('hero', 'Barra de café de especialidad con métodos de filtrado', 40);
const coverVideo = video('hero', 'Barista preparando café en la máquina de espresso');
const moka = THEME_PRESETS[0];

export function buildMokaStudioBundle(): OrganizationBundle {
  // Copia profunda: quien la use puede mutarla sin alterar la definición.
  const bundle = structuredClone({
    organization: { id: ORG, slug: DEMO_SLUG, name: 'Moka Studio', isDemo: true, status: 'active', createdAt: CREATED },
    settings: {
      organizationId: ORG,
      tagline: 'Café de especialidad, pastelería de autor y brunch todo el día.',
      intro: 'Tostamos en pequeños lotes, horneamos cada mañana y servimos sin apuro. Bienvenido a Moka Studio.',
      logoAssetId: logoId, coverImageAssetId: coverImage, coverVideoAssetId: coverVideo, showCover: true,
      address: 'Av. Demostración 1234', city: 'Buenos Aires', phone: '+54 11 0000-0000',
      instagram: '@moka.studio.demo', website: '',
      whatsapp: '+54 9 11 0000-0000', reviewUrl: 'https://www.google.com/maps', mapsUrl: '',
      tableService: true, languages: ['en', 'pt'], translations: {},
      hours: [
        { day: 1, opens: '08:00', closes: '20:00' }, { day: 2, opens: '08:00', closes: '20:00' },
        { day: 3, opens: '08:00', closes: '20:00' }, { day: 4, opens: '08:00', closes: '20:00' },
        { day: 5, opens: '08:00', closes: '21:00' }, { day: 6, opens: '09:00', closes: '21:00' },
        { day: 0, opens: '09:00', closes: '14:00' },
      ],
      currency: 'ARS', locale: 'es-AR', timeZone: 'America/Argentina/Buenos_Aires',
      features: { orders: false, loyalty: true, analytics: true },
      menuPublished: true,
      sectionOrder: ['promotions', 'loyalty', 'featured', 'categories'],
      updatedAt: CREATED,
    },
    theme: {
      organizationId: ORG, preset: moka.key, colors: moka.colors, fontDisplay: moka.fontDisplay, fontBody: moka.fontBody,
      cardStyle: 'soft', categoryNavStyle: 'pills', promoStyle: 'band', coverLayout: 'immersive', updatedAt: CREATED,
    },
    badges: DEFAULT_BADGES,
    categories, products, optionGroups, promotions, media,
    qrCodes: [
      {
        id: demoId('qr:principal'), organizationId: ORG, label: 'QR principal de mesas', token: 'mk7q2d9wz4',
        tableLabel: null, createdAt: CREATED, revokedAt: null,
      },
      ...[1, 2, 3, 4].map((n) => ({
        id: demoId(`qr:mesa-${n}`), organizationId: ORG, label: `Mesa ${n}`, token: `mkmesa${n}x7q`,
        tableLabel: `Mesa ${n}`, createdAt: CREATED, revokedAt: null,
      })),
    ],
    loyalty: {
      organizationId: ORG, active: true, name: 'Club Moka', stampsForReward: 8,
      reward: 'Un café de especialidad a elección',
      terms: 'Sumás un sello por cada café de la carta. Mostrá tu tarjeta al pagar. El premio no se canjea por dinero.',
    },
  } satisfies OrganizationBundle);
  bundle.settings.translations = demoTranslations(bundle);
  return bundle;
}
