import type {
  AnalyticsEventType, Category, ID, LoyaltyCard, LoyaltyMember, LoyaltyProgram, LoyaltyStats, MediaAsset, MediaKind,
  MemberRole, MenuTheme, OptionGroup, Organization, OrganizationBundle, OrganizationSettings, Product, Promotion,
  PublicMenu, QrCode, ServiceKind, ServiceRequest, ServiceStatus,
} from '../domain/types';
import type { AnalyticsSummary } from '../domain/analytics';

export type DataMode = 'local' | 'supabase';

export interface Session {
  userId: string;
  email: string;
}

export interface Membership {
  organization: Organization;
  role: MemberRole;
}

/** Archivo ya procesado en el navegador (variantes WebP, póster, fotogramas). */
export interface PreparedFile {
  name: string;
  blob: Blob;
}

export interface PreparedUpload {
  kind: MediaKind;
  title: string;
  alt: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  placeholder: string | null;
  /** Archivo principal (imagen mayor o video). */
  main: PreparedFile;
  /** Variantes de imagen por ancho. */
  variants: { width: number; file: PreparedFile }[];
  poster: PreparedFile | null;
}

export interface PublicEventInput {
  type: AnalyticsEventType;
  sessionId: string;
  productId?: ID | null;
  categoryId?: ID | null;
  promotionId?: ID | null;
  query?: string | null;
  qrToken?: string | null;
}

export type RepositoryErrorCode = 'forbidden' | 'not_found' | 'conflict' | 'invalid' | 'unavailable';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  constructor(message: string, code: RepositoryErrorCode) {
    super(message);
    this.code = code;
  }
}

/**
 * Contrato único de datos. La UI no sabe si habla con Supabase o con el
 * almacenamiento local del navegador.
 */
export interface MenuRepository {
  readonly mode: DataMode;

  // Público (sin autenticación)
  getPublicMenu(slug: string): Promise<PublicMenu | null>;
  trackEvent(slug: string, event: PublicEventInput): Promise<void>;
  /** Mesa asociada al QR escaneado, si el local tiene el servicio de mesa activo. */
  getTableForQr(slug: string, qrToken: string): Promise<string | null>;
  /** Llamar al mozo o pedir la cuenta. 'already' = ya había un aviso pendiente. */
  requestService(slug: string, qrToken: string, kind: ServiceKind): Promise<'sent' | 'already'>;
  /** Crea una tarjeta de fidelidad anónima. */
  joinLoyalty(slug: string): Promise<LoyaltyCard>;
  getLoyaltyCard(slug: string, code: string): Promise<LoyaltyCard | null>;

  // Autenticación
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  onAuthChange(cb: (session: Session | null) => void): () => void;
  listMemberships(): Promise<Membership[]>;

  // Panel (requieren pertenecer a la organización)
  getBundle(orgId: ID): Promise<OrganizationBundle>;
  saveCategory(orgId: ID, category: Category): Promise<Category>;
  deleteCategory(orgId: ID, categoryId: ID): Promise<void>;
  reorderCategories(orgId: ID, orderedIds: ID[]): Promise<void>;
  saveProduct(orgId: ID, product: Product): Promise<Product>;
  duplicateProduct(orgId: ID, productId: ID): Promise<Product>;
  reorderProducts(orgId: ID, categoryId: ID, orderedIds: ID[]): Promise<void>;
  saveOptionGroup(orgId: ID, group: OptionGroup): Promise<OptionGroup>;
  deleteOptionGroup(orgId: ID, groupId: ID): Promise<void>;
  savePromotion(orgId: ID, promotion: Promotion): Promise<Promotion>;
  deletePromotion(orgId: ID, promotionId: ID): Promise<void>;
  uploadMedia(orgId: ID, upload: PreparedUpload): Promise<MediaAsset>;
  replaceMedia(orgId: ID, assetId: ID, upload: PreparedUpload): Promise<MediaAsset>;
  updateMedia(orgId: ID, asset: Pick<MediaAsset, 'id' | 'title' | 'alt' | 'focalX' | 'focalY'>): Promise<MediaAsset>;
  deleteMedia(orgId: ID, assetId: ID): Promise<void>;
  saveSettings(orgId: ID, settings: OrganizationSettings): Promise<OrganizationSettings>;
  saveTheme(orgId: ID, theme: MenuTheme): Promise<MenuTheme>;
  createQrCode(orgId: ID, input: { label: string; tableLabel: string | null }): Promise<QrCode>;
  revokeQrCode(orgId: ID, qrId: ID): Promise<void>;
  getAnalyticsSummary(orgId: ID, days: number): Promise<AnalyticsSummary>;
  saveLoyaltyProgram(orgId: ID, program: LoyaltyProgram): Promise<LoyaltyProgram>;
  findLoyaltyMember(orgId: ID, code: string): Promise<LoyaltyMember | null>;
  addLoyaltyStamps(orgId: ID, memberId: ID, stamps: number): Promise<LoyaltyMember>;
  redeemLoyaltyReward(orgId: ID, memberId: ID): Promise<LoyaltyMember>;
  getLoyaltyStats(orgId: ID): Promise<LoyaltyStats>;
  listServiceRequests(orgId: ID): Promise<ServiceRequest[]>;
  setServiceRequestStatus(orgId: ID, requestId: ID, status: Exclude<ServiceStatus, 'open'>): Promise<void>;
  resetDemo(orgId: ID): Promise<void>;
}
