import { z } from 'zod';
import { FONT_BODY, FONT_DISPLAY, type MediaKind } from './types';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)');
const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Hora inválida (HH:MM)');
const cents = z.number().int('El importe debe ser entero').min(0, 'El importe no puede ser negativo').max(100_000_000);
const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

export const categorySchema = z.object({
  name: text(60).min(1, 'El nombre es obligatorio'),
  description: text(240),
  layout: z.enum(['feature', 'grid', 'list', 'carousel']),
  visible: z.boolean(),
  imageAssetId: z.string().nullable(),
});

export const productSchema = z.object({
  name: text(80).min(1, 'El nombre es obligatorio'),
  categoryId: z.string().min(1, 'Elegí una categoría'),
  kind: z.enum(['item', 'combo']),
  description: text(280),
  story: text(1200),
  price: cents,
  status: z.enum(['draft', 'published', 'archived']),
  available: z.boolean(),
  badges: z.array(z.string()).max(3, 'Usá como máximo 3 etiquetas destacadas'),
  tags: z.array(text(30)).max(8),
  allergens: z.array(text(40)).max(14),
  ingredients: z.array(text(60)).max(30),
  size: text(40),
  portion: text(40),
  prepMinutes: z.number().int().min(0).max(240).nullable(),
  foodInfo: text(600),
  displayMode: z.enum(['photo', 'gallery', 'video']),
  station: z.enum(['barra', 'cocina', 'pasteleria', 'despacho']).nullable(),
  comboItems: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
    substituteIds: z.array(z.string()),
  })),
}).superRefine((p, ctx) => {
  if (p.kind === 'combo' && p.comboItems.length < 2) {
    ctx.addIssue({ code: 'custom', path: ['comboItems'], message: 'Un combo necesita al menos 2 productos' });
  }
});

export const optionGroupSchema = z.object({
  name: text(50).min(1, 'El nombre es obligatorio'),
  internalName: text(60),
  required: z.boolean(),
  minSelect: z.number().int().min(0).max(20),
  maxSelect: z.number().int().min(1).max(20),
  options: z.array(z.object({
    id: z.string(),
    name: text(50).min(1, 'Cada opción necesita un nombre'),
    priceDelta: z.number().int().min(-100_000_00).max(100_000_00),
    available: z.boolean(),
    isDefault: z.boolean(),
    position: z.number().int(),
  })).min(1, 'Agregá al menos una opción'),
}).superRefine((g, ctx) => {
  if (g.minSelect > g.maxSelect) {
    ctx.addIssue({ code: 'custom', path: ['minSelect'], message: 'El mínimo no puede superar al máximo' });
  }
  if (g.required && g.options.every((o) => !o.available)) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Un grupo obligatorio necesita opciones disponibles' });
  }
  if (g.options.filter((o) => o.isDefault).length > g.maxSelect) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Hay más opciones predeterminadas que el máximo permitido' });
  }
});

export const promotionSchema = z.object({
  title: text(70).min(1, 'El título es obligatorio'),
  description: text(240),
  kind: z.enum(['announcement', 'percent_off', 'combo_price']),
  percentOff: z.number().int().min(1).max(90).nullable(),
  productIds: z.array(z.string()),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  days: z.array(z.number().int().min(0).max(6)),
  startTime: hhmm,
  endTime: hhmm,
  active: z.boolean(),
  conditions: text(400),
}).superRefine((p, ctx) => {
  if (p.kind === 'percent_off') {
    if (!p.percentOff) ctx.addIssue({ code: 'custom', path: ['percentOff'], message: 'Indicá el porcentaje' });
    if (!p.productIds.length) ctx.addIssue({ code: 'custom', path: ['productIds'], message: 'Elegí los productos alcanzados' });
  }
  if (p.startsAt && p.endsAt && Date.parse(p.endsAt) <= Date.parse(p.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'La fecha de fin debe ser posterior al inicio' });
  }
  if (Boolean(p.startTime) !== Boolean(p.endTime)) {
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Completá ambas horas o ninguna' });
  }
});

export const settingsSchema = z.object({
  tagline: text(90),
  intro: text(400),
  address: text(120),
  city: text(80),
  phone: text(40),
  instagram: z.string().trim().max(40).regex(/^@?[\w.]*$/, 'Usuario de Instagram inválido'),
  website: z.union([z.literal(''), z.string().trim().url('URL inválida').max(200)]),
  whatsapp: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, 'Usá solo números, espacios y el signo +'),
  reviewUrl: z.union([z.literal(''), z.string().trim().max(500).regex(/^https:\/\/\S+$/, 'Debe ser un enlace que empiece con https://')]),
  mapsUrl: z.union([z.literal(''), z.string().trim().max(500).regex(/^https:\/\/\S+$/, 'Debe ser un enlace que empiece con https://')]),
  showCover: z.boolean(),
  hours: z.array(z.object({ day: z.number().int().min(0).max(6), opens: hhmm, closes: hhmm })),
});

export const loyaltySchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(40),
  stampsForReward: z.number().int().min(3, 'Mínimo 3 sellos').max(20, 'Máximo 20 sellos'),
  reward: z.string().trim().min(1, 'Indicá el premio').max(80),
  terms: z.string().trim().max(400),
  active: z.boolean(),
});

export const themeSchema = z.object({
  colors: z.object({
    background: hex, surface: hex, ink: hex, muted: hex, accent: hex, accentInk: hex, line: hex,
  }),
  fontDisplay: z.enum(FONT_DISPLAY),
  fontBody: z.enum(FONT_BODY),
  cardStyle: z.enum(['soft', 'sharp']),
  categoryNavStyle: z.enum(['pills', 'underline']),
  promoStyle: z.enum(['band', 'card']),
  coverLayout: z.enum(['immersive', 'split']),
});

export type FieldErrors = Record<string, string>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

/* --------------------------------------------------------- Archivos */

export const UPLOAD_RULES: Record<MediaKind, { types: string[]; maxBytes: number; label: string }> = {
  image: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], maxBytes: 15 * 1024 * 1024, label: 'JPG, PNG, WebP o AVIF hasta 15 MB' },
  video: { types: ['video/mp4', 'video/webm'], maxBytes: 40 * 1024 * 1024, label: 'MP4 (H.264) o WebM hasta 40 MB' },
};

export type UploadCheck = { ok: true } | { ok: false; error: string };

export function checkUpload(file: { name: string; type: string; size: number }, kind: keyof typeof UPLOAD_RULES): UploadCheck {
  const rule = UPLOAD_RULES[kind];
  if (!rule.types.includes(file.type)) return { ok: false, error: `Formato no admitido. Usá ${rule.label}.` };
  if (file.size > rule.maxBytes) return { ok: false, error: `El archivo supera el máximo (${rule.label}).` };
  if (file.size === 0) return { ok: false, error: 'El archivo está vacío.' };
  return { ok: true };
}

/** Solo se aceptan fuentes de video externas de hosts aprobados y por HTTPS. */
export const ALLOWED_VIDEO_HOSTS = ['assets.mixkit.co', 'videos.pexels.com', 'player.vimeo.com'];

export function checkExternalVideoUrl(raw: string, extraHosts: string[] = []): UploadCheck {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, error: 'La URL no es válida.' }; }
  if (url.protocol !== 'https:') return { ok: false, error: 'La URL debe usar HTTPS.' };
  if (![...ALLOWED_VIDEO_HOSTS, ...extraHosts].includes(url.hostname)) {
    return { ok: false, error: `Origen no permitido. Hosts aprobados: ${[...ALLOWED_VIDEO_HOSTS, ...extraHosts].join(', ')}.` };
  }
  if (!/\.(mp4|webm)$/i.test(url.pathname)) return { ok: false, error: 'La URL debe apuntar a un archivo .mp4 o .webm.' };
  return { ok: true };
}
