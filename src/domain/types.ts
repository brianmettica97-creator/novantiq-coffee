// Modelo de dominio de NOVANTIQ COFFEE. Es independiente del almacenamiento:
// los repositorios (local o Supabase) traducen sus filas a estos tipos.
// Los importes se expresan siempre en unidades menores (centavos) como enteros.

export type ID = string;
export type Cents = number;

export type MemberRole = 'owner' | 'admin' | 'staff';

export interface Organization {
  id: ID;
  slug: string;
  name: string;
  isDemo: boolean;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface OpeningHours {
  /** 0 = domingo … 6 = sábado */
  day: number;
  /** "08:00"; vacío = cerrado ese día */
  opens: string;
  closes: string;
}

export interface FeatureFlags {
  /** Pedidos digitales (fase 6). Desactivado hasta que el módulo exista. */
  orders: boolean;
  /** Club de beneficios (fase 7). */
  loyalty: boolean;
  analytics: boolean;
}

export interface OrganizationSettings {
  organizationId: ID;
  tagline: string;
  intro: string;
  logoAssetId: ID | null;
  coverImageAssetId: ID | null;
  coverVideoAssetId: ID | null;
  showCover: boolean;
  address: string;
  city: string;
  phone: string;
  instagram: string;
  website: string;
  /** Número de WhatsApp en formato internacional (solo dígitos y +). */
  whatsapp: string;
  /** Enlace para dejar una reseña (p. ej. Google). */
  reviewUrl: string;
  /** Enlace de Google Maps; vacío = se arma con la dirección. */
  mapsUrl: string;
  /** Botones "Llamar al mozo" y "Pedir la cuenta" en los QR de mesa. */
  tableService: boolean;
  /** Idiomas adicionales al español que ofrece la carta. */
  languages: ExtraLanguage[];
  /** Traducciones del contenido: idioma → clave (ver domain/i18n.ts) → texto. */
  translations: Translations;
  hours: OpeningHours[];
  currency: string;
  locale: string;
  /** Zona horaria IANA del local: horarios y promociones se evalúan en ella. */
  timeZone: string;
  features: FeatureFlags;
  /** La carta pública solo se sirve cuando está publicada. */
  menuPublished: boolean;
  /** Sección de la carta que aparece justo después de la portada. */
  sectionOrder: HomeSection[];
  updatedAt: string;
}

export type HomeSection = 'promotions' | 'loyalty' | 'featured' | 'categories';

export type MenuLanguage = 'es' | 'en' | 'pt';
export const EXTRA_LANGUAGES = ['en', 'pt'] as const;
export type ExtraLanguage = (typeof EXTRA_LANGUAGES)[number];
export type Translations = Partial<Record<ExtraLanguage, Record<string, string>>>;

export const FONT_DISPLAY = ['Fraunces', 'Cormorant Garamond', 'Playfair Display', 'DM Serif Display'] as const;
export const FONT_BODY = ['Manrope', 'DM Sans', 'Outfit', 'Inter'] as const;
export type DisplayFont = (typeof FONT_DISPLAY)[number];
export type BodyFont = (typeof FONT_BODY)[number];

export interface ThemeColors {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  line: string;
}

export interface MenuTheme {
  organizationId: ID;
  preset: string;
  colors: ThemeColors;
  fontDisplay: DisplayFont;
  fontBody: BodyFont;
  /** Forma de las fichas en grillas. */
  cardStyle: 'soft' | 'sharp';
  categoryNavStyle: 'pills' | 'underline';
  promoStyle: 'band' | 'card';
  coverLayout: 'immersive' | 'split';
  updatedAt: string;
}

export type CategoryLayout = 'feature' | 'grid' | 'list' | 'carousel';

export interface Category {
  id: ID;
  organizationId: ID;
  name: string;
  slug: string;
  description: string;
  imageAssetId: ID | null;
  position: number;
  visible: boolean;
  layout: CategoryLayout;
}

export type MediaKind = 'image' | 'video';

export interface ImageVariant {
  width: number;
  url: string;
}

export interface MediaAsset {
  id: ID;
  organizationId: ID;
  kind: MediaKind;
  title: string;
  alt: string;
  /** URL principal: imagen más grande o video. */
  url: string;
  variants: ImageVariant[];
  /** Placeholder difuso para imágenes (data URL pequeña). */
  placeholder: string | null;
  posterUrl: string | null;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** Punto focal 0–100 para recortes adaptables. */
  focalX: number;
  focalY: number;
  credit: string;
  createdAt: string;
}

export type DisplayMode = 'photo' | 'gallery' | 'video';

export type MediaRole = 'primary' | 'gallery' | 'video';

export interface ProductMedia {
  assetId: ID;
  role: MediaRole;
  position: number;
}

export interface OptionChoice {
  id: ID;
  name: string;
  priceDelta: Cents;
  available: boolean;
  isDefault: boolean;
  position: number;
}

/**
 * Grupo de opciones reutilizable (p. ej. "Tamaños de bebida", "Leches").
 * Un grupo obligatorio de selección única cumple el rol de "variante".
 */
export interface OptionGroup {
  id: ID;
  organizationId: ID;
  name: string;
  /** Nombre interno para distinguir grupos parecidos en el panel. */
  internalName: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionChoice[];
}

export interface OptionOverride {
  priceDelta?: Cents;
  available?: boolean;
}

export interface ProductOptionGroupLink {
  groupId: ID;
  position: number;
  /** Ajustes del producto sobre opciones del grupo compartido. */
  overrides: Record<ID, OptionOverride>;
}

export type ProductStatus = 'draft' | 'published' | 'archived';
export type ProductKind = 'item' | 'combo';
export type PrepStation = 'barra' | 'cocina' | 'pasteleria' | 'despacho';

export interface ComboComponent {
  productId: ID;
  quantity: number;
  /** Productos que el cliente puede elegir en lugar del original, sin costo. */
  substituteIds: ID[];
}

export interface Product {
  id: ID;
  organizationId: ID;
  categoryId: ID;
  kind: ProductKind;
  name: string;
  slug: string;
  description: string;
  story: string;
  price: Cents;
  status: ProductStatus;
  /** false = agotado temporalmente (sigue visible, no se puede pedir). */
  available: boolean;
  position: number;
  badges: string[];
  tags: string[];
  allergens: string[];
  ingredients: string[];
  size: string;
  portion: string;
  prepMinutes: number | null;
  foodInfo: string;
  displayMode: DisplayMode;
  media: ProductMedia[];
  optionGroups: ProductOptionGroupLink[];
  pairingIds: ID[];
  relatedIds: ID[];
  comboItems: ComboComponent[];
  station: PrepStation | null;
  createdAt: string;
  updatedAt: string;
}

export interface Badge {
  key: string;
  label: string;
  tone: 'accent' | 'dark' | 'light';
  /** Requiere datos reales (p. ej. "Más vendido"): el panel lo advierte. */
  requiresEvidence: boolean;
}

export type PromotionKind = 'announcement' | 'percent_off' | 'combo_price';

export interface Promotion {
  id: ID;
  organizationId: ID;
  title: string;
  description: string;
  kind: PromotionKind;
  /** Para percent_off: 1–90. */
  percentOff: number | null;
  productIds: ID[];
  imageAssetId: ID | null;
  videoAssetId: ID | null;
  /** ISO date-time; null = sin límite */
  startsAt: string | null;
  endsAt: string | null;
  /** Días de la semana (0 = domingo). Vacío = todos. */
  days: number[];
  /** "HH:MM" en hora local del local; vacíos = todo el día */
  startTime: string;
  endTime: string;
  active: boolean;
  conditions: string;
  position: number;
}

export interface QrCode {
  id: ID;
  organizationId: ID;
  label: string;
  /** Token aleatorio no adivinable; se usa para atribución y, a futuro, mesas. */
  token: string;
  tableLabel: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export type AnalyticsEventType =
  | 'menu_view'
  | 'qr_scan'
  | 'category_view'
  | 'product_view'
  | 'media_play'
  | 'search'
  | 'promo_click';

export interface AnalyticsEvent {
  id: ID;
  organizationId: ID;
  type: AnalyticsEventType;
  productId: ID | null;
  categoryId: ID | null;
  promotionId: ID | null;
  /** Término de búsqueda normalizado (sin datos personales). */
  query: string | null;
  sessionId: string;
  occurredAt: string;
}

/* ------------------------------------------------------------ Fidelidad */

/** Tarjeta de sellos: cada visita suma sellos y al completarla hay un premio. */
export interface LoyaltyProgram {
  organizationId: ID;
  active: boolean;
  name: string;
  /** Sellos necesarios para el premio (3–20). */
  stampsForReward: number;
  reward: string;
  terms: string;
}

/** Lo que ve el cliente en su teléfono. El código es su credencial: no se muestra a terceros. */
export interface LoyaltyCard {
  code: string;
  stamps: number;
  goal: number;
  redeemed: number;
  createdAt: string;
}

/** Lo que ve el personal al buscar una tarjeta. */
export interface LoyaltyMember {
  id: ID;
  code: string;
  stamps: number;
  redeemed: number;
  createdAt: string;
  lastVisit: string | null;
}

export interface LoyaltyStats {
  members: number;
  stampsLast30: number;
  redeemedLast30: number;
  readyForReward: number;
}

/* ------------------------------------------------------- Servicio de mesa */

export type ServiceKind = 'assistance' | 'bill';
export type ServiceStatus = 'open' | 'acknowledged' | 'closed';

export interface ServiceRequest {
  id: ID;
  kind: ServiceKind;
  tableLabel: string;
  status: ServiceStatus;
  createdAt: string;
}

/** Todo lo que el panel necesita de una organización. */
export interface OrganizationBundle {
  organization: Organization;
  settings: OrganizationSettings;
  theme: MenuTheme;
  badges: Badge[];
  categories: Category[];
  products: Product[];
  optionGroups: OptionGroup[];
  promotions: Promotion[];
  media: MediaAsset[];
  qrCodes: QrCode[];
  loyalty: LoyaltyProgram;
}

/** Lo que el visitante anónimo recibe: solo contenido publicado. */
export interface PublicMenu {
  organization: Pick<Organization, 'id' | 'slug' | 'name' | 'isDemo'>;
  settings: Omit<OrganizationSettings, 'updatedAt'>;
  theme: MenuTheme;
  badges: Badge[];
  categories: Category[];
  products: Product[];
  optionGroups: OptionGroup[];
  promotions: Promotion[];
  media: MediaAsset[];
  /** Solo si el módulo está contratado y el programa activo. */
  loyalty: LoyaltyProgram | null;
}
