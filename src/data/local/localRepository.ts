// Repositorio local (IndexedDB). Permite usar la plataforma completa sin
// credenciales externas: ideal para demostraciones y desarrollo.
// LIMITACIÓN: los datos viven en ESTE navegador. Para que los cambios del
// panel se vean en otros dispositivos hace falta el modo Supabase.
import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type {
  AnalyticsEvent, Category, ID, LoyaltyCard, LoyaltyMember, LoyaltyProgram, LoyaltyStats, MediaAsset, MemberRole,
  MenuTheme, OptionGroup, OrganizationBundle, OrganizationSettings, Product, Promotion, PublicMenu, QrCode,
  ServiceKind, ServiceRequest, ServiceStatus,
} from '../../domain/types';
import { buildPublicMenu } from '../../domain/menu';
import { summarize } from '../../domain/analytics';
import { uniqueSlug } from '../../domain/format';
import { mediaUsage } from '../../domain/usage';
import { randomId, sha256 } from '../../domain/crypto';
import {
  RepositoryError, type Membership, type MenuRepository, type PreparedUpload, type PublicEventInput, type Session,
} from '../repository';

export interface LocalUser {
  id: string;
  email: string;
  /** SHA-256 hex de la contraseña. Es una barrera de demo, no seguridad real. */
  passwordHash: string;
}

interface LocalLoyaltyMember { id: ID; organizationId: ID; code: string; createdAt: string }
interface LocalLoyaltyTx { id: ID; organizationId: ID; memberId: ID; kind: 'earn' | 'redeem'; stamps: number; at: string; by: string }

export interface LocalDb {
  version: 2;
  bundles: Record<ID, OrganizationBundle>;
  users: LocalUser[];
  members: { userId: string; organizationId: ID; role: MemberRole }[];
  events: AnalyticsEvent[];
  audit: { at: string; userId: string; organizationId: ID; action: string; entityId: string }[];
  loyaltyMembers: LocalLoyaltyMember[];
  loyaltyTx: LocalLoyaltyTx[];
  serviceRequests: (ServiceRequest & { organizationId: ID })[];
}

export interface LocalSeed {
  bundles: OrganizationBundle[];
  /** Plantillas para reiniciar organizaciones de demo. */
  demoTemplates: Record<ID, () => OrganizationBundle>;
  users: { id: string; email: string; password: string; memberships: { organizationId: ID; role: MemberRole }[] }[];
}

// v2: tarjeta de fidelidad, servicio de mesa e idiomas. Los datos v1 se descartan.
const DB_KEY = 'db:v2';
const OLD_DB_KEYS = ['db:v1'];
const SESSION_KEY = 'session';
const MAX_EVENTS = 20_000;
const EDIT_ROLES: MemberRole[] = ['owner', 'admin'];

/** Código de tarjeta: aleatorio, no derivado de datos personales. */
function memberCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((x) => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join('');
}

const uid = () => randomId();
const now = () => new Date().toISOString();

export class LocalRepository implements MenuRepository {
  readonly mode = 'local' as const;
  private store: UseStore;
  private db: LocalDb | null = null;
  private listeners = new Set<(s: Session | null) => void>();
  private blobUrls = new Map<string, string>();

  private seed: LocalSeed;

  constructor(seed: LocalSeed, storeName = 'novantiq-coffee') {
    this.seed = seed;
    this.store = createStore(storeName, 'kv');
  }

  /* ------------------------------------------------------------ interno */

  private async load(): Promise<LocalDb> {
    if (this.db) return this.db;
    let db = await get<LocalDb>(DB_KEY, this.store);
    if (!db || db.version !== 2) {
      db = {
        version: 2,
        bundles: Object.fromEntries(this.seed.bundles.map((b) => [b.organization.id, structuredClone(b)])),
        users: await Promise.all(this.seed.users.map(async (u) => ({ id: u.id, email: u.email, passwordHash: await sha256(u.password) }))),
        members: this.seed.users.flatMap((u) => u.memberships.map((m) => ({ userId: u.id, ...m }))),
        events: [],
        audit: [],
        loyaltyMembers: [],
        loyaltyTx: [],
        serviceRequests: [],
      };
      await set(DB_KEY, db, this.store);
      for (const k of OLD_DB_KEYS) await del(k, this.store);
    }
    this.db = db;
    return db;
  }

  private async persist() {
    if (this.db) await set(DB_KEY, this.db, this.store);
  }

  private async requireRole(orgId: ID, roles: MemberRole[] = EDIT_ROLES) {
    const session = await this.getSession();
    if (!session) throw new RepositoryError('Iniciá sesión para continuar.', 'forbidden');
    const db = await this.load();
    const member = db.members.find((m) => m.userId === session.userId && m.organizationId === orgId);
    if (!member || !roles.includes(member.role)) {
      throw new RepositoryError('No tenés permisos sobre esta cafetería.', 'forbidden');
    }
    const bundle = db.bundles[orgId];
    if (!bundle) throw new RepositoryError('Cafetería inexistente.', 'not_found');
    return { db, bundle, session };
  }

  private async mutate<T>(orgId: ID, action: string, fn: (b: OrganizationBundle) => T & { id?: string }): Promise<T> {
    const { db, bundle, session } = await this.requireRole(orgId);
    const result = fn(bundle);
    db.audit.push({ at: now(), userId: session.userId, organizationId: orgId, action, entityId: result?.id ?? '' });
    if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
    await this.persist();
    return structuredClone(result);
  }

  /** Verifica que los ids referenciados pertenezcan a la misma organización. */
  private assertOwned(bundle: OrganizationBundle, ids: { products?: ID[]; categories?: ID[]; media?: ID[]; groups?: ID[] }) {
    const check = (list: ID[] | undefined, pool: { id: ID }[], what: string) => {
      for (const id of list ?? []) {
        if (!pool.some((x) => x.id === id)) throw new RepositoryError(`Referencia inválida (${what}).`, 'invalid');
      }
    };
    check(ids.products, bundle.products, 'producto');
    check(ids.categories, bundle.categories, 'categoría');
    check(ids.media, bundle.media, 'archivo');
    check(ids.groups, bundle.optionGroups, 'grupo de opciones');
  }

  private upsert<T extends { id: ID }>(list: T[], item: T): T {
    const i = list.findIndex((x) => x.id === item.id);
    if (i === -1) list.push(item);
    else list[i] = item;
    return item;
  }

  /* ------------------------------------------------------------ público */

  async getPublicMenu(slug: string): Promise<PublicMenu | null> {
    const db = await this.load();
    const bundle = Object.values(db.bundles).find((b) => b.organization.slug === slug);
    return bundle ? buildPublicMenu(structuredClone(bundle)) : null;
  }

  async trackEvent(slug: string, e: PublicEventInput): Promise<void> {
    const db = await this.load();
    const bundle = Object.values(db.bundles).find((b) => b.organization.slug === slug);
    if (!bundle || !bundle.settings.features.analytics) return;
    db.events.push({
      id: uid(), organizationId: bundle.organization.id, type: e.type, sessionId: e.sessionId.slice(0, 64),
      productId: e.productId ?? null, categoryId: e.categoryId ?? null, promotionId: e.promotionId ?? null,
      query: e.query ? e.query.slice(0, 60) : null, occurredAt: now(),
    });
    if (db.events.length > MAX_EVENTS) db.events.splice(0, db.events.length - MAX_EVENTS);
    await this.persist();
  }

  private async publicBundle(slug: string) {
    const db = await this.load();
    const bundle = Object.values(db.bundles).find((b) => b.organization.slug === slug);
    if (!bundle || bundle.organization.status !== 'active' || !bundle.settings.menuPublished) return { db, bundle: null };
    return { db, bundle };
  }

  async getTableForQr(slug: string, qrToken: string) {
    const { bundle } = await this.publicBundle(slug);
    if (!bundle?.settings.tableService) return null;
    return bundle.qrCodes.find((q) => q.token === qrToken && !q.revokedAt)?.tableLabel ?? null;
  }

  async requestService(slug: string, qrToken: string, kind: ServiceKind): Promise<'sent' | 'already'> {
    const { db, bundle } = await this.publicBundle(slug);
    const table = bundle && (await this.getTableForQr(slug, qrToken));
    if (!bundle || !table) throw new RepositoryError('Escaneá el código QR de tu mesa para usar este servicio.', 'invalid');
    const orgId = bundle.organization.id;
    const recent = Date.now() - 30 * 60_000;
    if (db.serviceRequests.some((r) => r.organizationId === orgId && r.tableLabel === table && r.kind === kind
      && r.status !== 'closed' && Date.parse(r.createdAt) > recent)) return 'already';
    db.serviceRequests.push({ id: uid(), organizationId: orgId, kind, tableLabel: table, status: 'open', createdAt: now() });
    if (db.serviceRequests.length > 2000) db.serviceRequests.splice(0, db.serviceRequests.length - 2000);
    await this.persist();
    return 'sent';
  }

  private stampsOf(db: LocalDb, memberId: ID) {
    const tx = db.loyaltyTx.filter((t) => t.memberId === memberId);
    return {
      stamps: tx.reduce((s, t) => s + t.stamps, 0),
      redeemed: tx.filter((t) => t.kind === 'redeem').length,
      lastVisit: tx.filter((t) => t.kind === 'earn').map((t) => t.at).sort().pop() ?? null,
    };
  }

  private card(db: LocalDb, m: LocalLoyaltyMember, goal: number): LoyaltyCard {
    const { stamps, redeemed } = this.stampsOf(db, m.id);
    return { code: m.code, stamps, goal, redeemed, createdAt: m.createdAt };
  }

  async joinLoyalty(slug: string): Promise<LoyaltyCard> {
    const { db, bundle } = await this.publicBundle(slug);
    if (!bundle?.settings.features.loyalty || !bundle.loyalty.active) {
      throw new RepositoryError('La tarjeta de fidelidad no está disponible.', 'not_found');
    }
    const member = { id: uid(), organizationId: bundle.organization.id, code: memberCode(), createdAt: now() };
    db.loyaltyMembers.push(member);
    await this.persist();
    return this.card(db, member, bundle.loyalty.stampsForReward);
  }

  async getLoyaltyCard(slug: string, code: string): Promise<LoyaltyCard | null> {
    const { db, bundle } = await this.publicBundle(slug);
    if (!bundle?.settings.features.loyalty || !bundle.loyalty.active) return null;
    const m = db.loyaltyMembers.find((x) => x.organizationId === bundle.organization.id && x.code === code);
    return m ? this.card(db, m, bundle.loyalty.stampsForReward) : null;
  }

  /* ---------------------------------------------------------- sesiones */

  async getSession(): Promise<Session | null> {
    const db = await this.load();
    const userId = await get<string>(SESSION_KEY, this.store);
    const user = db.users.find((u) => u.id === userId);
    return user ? { userId: user.id, email: user.email } : null;
  }

  async signIn(email: string, password: string): Promise<Session> {
    const db = await this.load();
    const hash = await sha256(password);
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.passwordHash === hash);
    if (!user) throw new RepositoryError('Correo o contraseña incorrectos.', 'forbidden');
    await set(SESSION_KEY, user.id, this.store);
    const session = { userId: user.id, email: user.email };
    this.listeners.forEach((l) => l(session));
    return session;
  }

  async signOut(): Promise<void> {
    await del(SESSION_KEY, this.store);
    this.listeners.forEach((l) => l(null));
  }

  onAuthChange(cb: (s: Session | null) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  async listMemberships(): Promise<Membership[]> {
    const session = await this.getSession();
    if (!session) return [];
    const db = await this.load();
    return db.members
      .filter((m) => m.userId === session.userId && db.bundles[m.organizationId])
      .map((m) => ({ organization: structuredClone(db.bundles[m.organizationId].organization), role: m.role }));
  }

  /* ------------------------------------------------------------- panel */

  async getBundle(orgId: ID): Promise<OrganizationBundle> {
    const { bundle } = await this.requireRole(orgId, ['owner', 'admin', 'staff']);
    return structuredClone(bundle);
  }

  saveCategory(orgId: ID, category: Category) {
    return this.mutate(orgId, 'category.save', (b) => {
      if (category.imageAssetId) this.assertOwned(b, { media: [category.imageAssetId] });
      const exists = b.categories.some((c) => c.id === category.id);
      const slug = uniqueSlug(category.slug || category.name, b.categories.filter((c) => c.id !== category.id).map((c) => c.slug));
      return this.upsert(b.categories, {
        ...category, organizationId: orgId, slug, id: category.id || uid(),
        position: exists ? category.position : b.categories.length,
      });
    });
  }

  async deleteCategory(orgId: ID, categoryId: ID) {
    await this.mutate(orgId, 'category.delete', (b) => {
      const used = b.products.filter((p) => p.categoryId === categoryId && p.status !== 'archived');
      if (used.length) {
        throw new RepositoryError(`La categoría tiene ${used.length} producto(s). Movelos o archivalos antes de eliminarla.`, 'conflict');
      }
      b.categories = b.categories.filter((c) => c.id !== categoryId);
      b.products = b.products.filter((p) => p.categoryId !== categoryId);
      return { id: categoryId };
    });
  }

  async reorderCategories(orgId: ID, orderedIds: ID[]) {
    await this.mutate(orgId, 'category.reorder', (b) => {
      this.assertOwned(b, { categories: orderedIds });
      for (const c of b.categories) {
        const i = orderedIds.indexOf(c.id);
        if (i !== -1) c.position = i;
      }
      return { id: '' };
    });
  }

  saveProduct(orgId: ID, product: Product) {
    return this.mutate(orgId, 'product.save', (b) => {
      this.assertOwned(b, {
        categories: [product.categoryId],
        media: product.media.map((m) => m.assetId),
        groups: product.optionGroups.map((l) => l.groupId),
        products: [...product.pairingIds, ...product.relatedIds, ...product.comboItems.flatMap((c) => [c.productId, ...c.substituteIds])],
      });
      const existing = b.products.find((p) => p.id === product.id);
      const slug = uniqueSlug(product.slug || product.name, b.products.filter((p) => p.id !== product.id).map((p) => p.slug));
      return this.upsert(b.products, {
        ...product,
        id: product.id || uid(),
        organizationId: orgId,
        slug,
        position: existing && existing.categoryId === product.categoryId
          ? product.position
          : b.products.filter((p) => p.categoryId === product.categoryId).length,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      });
    });
  }

  duplicateProduct(orgId: ID, productId: ID) {
    return this.mutate(orgId, 'product.duplicate', (b) => {
      const src = b.products.find((p) => p.id === productId);
      if (!src) throw new RepositoryError('Producto inexistente.', 'not_found');
      const copy: Product = {
        ...structuredClone(src), id: uid(), name: `${src.name} (copia)`, status: 'draft',
        slug: uniqueSlug(`${src.slug}-copia`, b.products.map((p) => p.slug)),
        position: b.products.filter((p) => p.categoryId === src.categoryId).length,
        createdAt: now(), updatedAt: now(),
      };
      b.products.push(copy);
      return copy;
    });
  }

  async reorderProducts(orgId: ID, categoryId: ID, orderedIds: ID[]) {
    await this.mutate(orgId, 'product.reorder', (b) => {
      this.assertOwned(b, { products: orderedIds, categories: [categoryId] });
      for (const p of b.products) {
        if (p.categoryId !== categoryId) continue;
        const i = orderedIds.indexOf(p.id);
        if (i !== -1) p.position = i;
      }
      return { id: categoryId };
    });
  }

  saveOptionGroup(orgId: ID, group: OptionGroup) {
    return this.mutate(orgId, 'option_group.save', (b) =>
      this.upsert(b.optionGroups, {
        ...group, id: group.id || uid(), organizationId: orgId,
        options: group.options.map((o, i) => ({ ...o, id: o.id || uid(), position: i })),
      }));
  }

  async deleteOptionGroup(orgId: ID, groupId: ID) {
    await this.mutate(orgId, 'option_group.delete', (b) => {
      const users = b.products.filter((p) => p.optionGroups.some((l) => l.groupId === groupId));
      if (users.length) {
        throw new RepositoryError(`El grupo se usa en: ${users.slice(0, 4).map((p) => p.name).join(', ')}${users.length > 4 ? '…' : ''}.`, 'conflict');
      }
      b.optionGroups = b.optionGroups.filter((g) => g.id !== groupId);
      return { id: groupId };
    });
  }

  savePromotion(orgId: ID, promotion: Promotion) {
    return this.mutate(orgId, 'promotion.save', (b) => {
      this.assertOwned(b, {
        products: promotion.productIds,
        media: [promotion.imageAssetId, promotion.videoAssetId].filter((x): x is string => !!x),
      });
      const exists = b.promotions.some((p) => p.id === promotion.id);
      return this.upsert(b.promotions, {
        ...promotion, id: promotion.id || uid(), organizationId: orgId,
        position: exists ? promotion.position : b.promotions.length,
      });
    });
  }

  async deletePromotion(orgId: ID, promotionId: ID) {
    await this.mutate(orgId, 'promotion.delete', (b) => {
      b.promotions = b.promotions.filter((p) => p.id !== promotionId);
      return { id: promotionId };
    });
  }

  /* ---------------------------------------------------------- archivos */

  private async storeUpload(assetId: ID, up: PreparedUpload) {
    const put = async (name: string, blob: Blob) => {
      await set(`blob:${assetId}/${name}`, blob, this.store);
      return `idb:${assetId}/${name}`;
    };
    const url = await put(up.main.name, up.main.blob);
    const variants = [];
    for (const v of up.variants) variants.push({ width: v.width, url: await put(v.file.name, v.file.blob) });
    const posterUrl = up.poster ? await put(up.poster.name, up.poster.blob) : null;
    return { url, variants, posterUrl };
  }

  /** Resuelve una URL "idb:" a un object URL del blob guardado. */
  async resolveBlobUrl(url: string): Promise<string | null> {
    const cached = this.blobUrls.get(url);
    if (cached) return cached;
    const blob = await get<Blob>(`blob:${url.slice(4)}`, this.store);
    if (!blob) return null;
    const objectUrl = URL.createObjectURL(blob);
    this.blobUrls.set(url, objectUrl);
    return objectUrl;
  }

  async uploadMedia(orgId: ID, up: PreparedUpload): Promise<MediaAsset> {
    await this.requireRole(orgId);
    const id = uid();
    const stored = await this.storeUpload(id, up);
    return this.mutate(orgId, 'media.upload', (b) => {
      const asset: MediaAsset = {
        id, organizationId: orgId, kind: up.kind, title: up.title, alt: up.alt, ...stored,
        placeholder: up.placeholder, mimeType: up.mimeType, bytes: up.bytes, width: up.width, height: up.height,
        focalX: 50, focalY: 50, credit: 'Subido desde el panel', createdAt: now(),
      };
      b.media.push(asset);
      return asset;
    });
  }

  async replaceMedia(orgId: ID, assetId: ID, up: PreparedUpload): Promise<MediaAsset> {
    const { bundle } = await this.requireRole(orgId);
    const current = bundle.media.find((m) => m.id === assetId);
    if (!current) throw new RepositoryError('Archivo inexistente.', 'not_found');
    if (current.kind !== up.kind) throw new RepositoryError('El reemplazo debe ser del mismo tipo de archivo.', 'invalid');
    // Prefijo nuevo para invalidar cachés del navegador.
    const stored = await this.storeUpload(`${assetId}-${Date.now()}`, up);
    return this.mutate(orgId, 'media.replace', (b) => {
      const asset = b.media.find((m) => m.id === assetId)!;
      Object.assign(asset, stored, {
        mimeType: up.mimeType, bytes: up.bytes, width: up.width, height: up.height, placeholder: up.placeholder,
        credit: 'Subido desde el panel',
      });
      return asset;
    });
  }

  updateMedia(orgId: ID, patch: Pick<MediaAsset, 'id' | 'title' | 'alt' | 'focalX' | 'focalY'>) {
    return this.mutate(orgId, 'media.update', (b) => {
      const asset = b.media.find((m) => m.id === patch.id);
      if (!asset) throw new RepositoryError('Archivo inexistente.', 'not_found');
      Object.assign(asset, patch);
      return asset;
    });
  }

  async deleteMedia(orgId: ID, assetId: ID) {
    await this.mutate(orgId, 'media.delete', (b) => {
      const usage = mediaUsage(b, assetId);
      if (usage.length) throw new RepositoryError(`El archivo está en uso: ${usage.join(', ')}.`, 'conflict');
      b.media = b.media.filter((m) => m.id !== assetId);
      return { id: assetId };
    });
  }

  /* ------------------------------------------------- configuración/QR */

  saveSettings(orgId: ID, settings: OrganizationSettings) {
    return this.mutate(orgId, 'settings.save', (b) => {
      const ids = [settings.logoAssetId, settings.coverImageAssetId, settings.coverVideoAssetId].filter((x): x is string => !!x);
      this.assertOwned(b, { media: ids });
      // Las funciones habilitadas por plan no se cambian desde el panel del local.
      b.settings = { ...settings, organizationId: orgId, features: b.settings.features, updatedAt: now() };
      return b.settings;
    });
  }

  saveTheme(orgId: ID, theme: MenuTheme) {
    return this.mutate(orgId, 'theme.save', (b) => {
      b.theme = { ...theme, organizationId: orgId, updatedAt: now() };
      return b.theme;
    });
  }

  createQrCode(orgId: ID, input: { label: string; tableLabel: string | null }) {
    return this.mutate(orgId, 'qr.create', (b) => {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      const token = [...bytes].map((x) => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join('');
      const qr: QrCode = {
        id: uid(), organizationId: orgId, label: input.label.trim() || 'QR', token,
        tableLabel: input.tableLabel?.trim() || null, createdAt: now(), revokedAt: null,
      };
      b.qrCodes.push(qr);
      return qr;
    });
  }

  async revokeQrCode(orgId: ID, qrId: ID) {
    await this.mutate(orgId, 'qr.revoke', (b) => {
      const qr = b.qrCodes.find((q) => q.id === qrId);
      if (!qr) throw new RepositoryError('QR inexistente.', 'not_found');
      qr.revokedAt = now();
      return qr;
    });
  }

  async getAnalyticsSummary(orgId: ID, days: number) {
    const { db } = await this.requireRole(orgId, ['owner', 'admin', 'staff']);
    return summarize(db.events.filter((e) => e.organizationId === orgId), new Date(), days);
  }

  /* ---------------------------------------------------------- fidelidad */

  saveLoyaltyProgram(orgId: ID, program: LoyaltyProgram) {
    return this.mutate(orgId, 'loyalty.save', (b) => {
      b.loyalty = { ...program, organizationId: orgId };
      return b.loyalty;
    });
  }

  private member(db: LocalDb, m: LocalLoyaltyMember): LoyaltyMember {
    return { id: m.id, code: m.code, createdAt: m.createdAt, ...this.stampsOf(db, m.id) };
  }

  async findLoyaltyMember(orgId: ID, code: string) {
    const { db } = await this.requireRole(orgId, ['owner', 'admin', 'staff']);
    const clean = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const m = db.loyaltyMembers.find((x) => x.organizationId === orgId && x.code === clean);
    return m ? this.member(db, m) : null;
  }

  private async loyaltyMove(orgId: ID, memberId: ID, kind: LocalLoyaltyTx['kind'], delta: (goal: number) => number) {
    const { db, bundle, session } = await this.requireRole(orgId, ['owner', 'admin', 'staff']);
    const m = db.loyaltyMembers.find((x) => x.id === memberId && x.organizationId === orgId);
    if (!m) throw new RepositoryError('Tarjeta inexistente.', 'not_found');
    const stamps = delta(bundle.loyalty.stampsForReward);
    if (this.stampsOf(db, memberId).stamps + stamps < 0) throw new RepositoryError('La tarjeta todavía no completó los sellos.', 'conflict');
    db.loyaltyTx.push({ id: uid(), organizationId: orgId, memberId, kind, stamps, at: now(), by: session.userId });
    await this.persist();
    return this.member(db, m);
  }

  async addLoyaltyStamps(orgId: ID, memberId: ID, stamps: number) {
    if (!Number.isInteger(stamps) || stamps < 1 || stamps > 5) throw new RepositoryError('Se pueden sumar de 1 a 5 sellos por vez.', 'invalid');
    return this.loyaltyMove(orgId, memberId, 'earn', () => stamps);
  }

  redeemLoyaltyReward(orgId: ID, memberId: ID) {
    return this.loyaltyMove(orgId, memberId, 'redeem', (goal) => -goal);
  }

  async getLoyaltyStats(orgId: ID): Promise<LoyaltyStats> {
    const { db, bundle } = await this.requireRole(orgId, ['owner', 'admin', 'staff']);
    const since = Date.now() - 30 * 86_400_000;
    const members = db.loyaltyMembers.filter((m) => m.organizationId === orgId);
    const tx = db.loyaltyTx.filter((t) => t.organizationId === orgId && Date.parse(t.at) >= since);
    return {
      members: members.length,
      stampsLast30: tx.filter((t) => t.kind === 'earn').reduce((s, t) => s + t.stamps, 0),
      redeemedLast30: tx.filter((t) => t.kind === 'redeem').length,
      readyForReward: members.filter((m) => this.stampsOf(db, m.id).stamps >= bundle.loyalty.stampsForReward).length,
    };
  }

  /* --------------------------------------------------- servicio de mesa */

  async listServiceRequests(orgId: ID): Promise<ServiceRequest[]> {
    const { db } = await this.requireRole(orgId, ['owner', 'admin', 'staff']);
    const since = Date.now() - 12 * 3_600_000;
    return db.serviceRequests
      .filter((r) => r.organizationId === orgId && r.status !== 'closed' && Date.parse(r.createdAt) >= since)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(({ organizationId: _org, ...r }) => r);
  }

  async setServiceRequestStatus(orgId: ID, requestId: ID, status: Exclude<ServiceStatus, 'open'>) {
    const { db } = await this.requireRole(orgId, ['owner', 'admin', 'staff']);
    const r = db.serviceRequests.find((x) => x.id === requestId && x.organizationId === orgId);
    if (!r) throw new RepositoryError('Aviso inexistente.', 'not_found');
    r.status = status;
    await this.persist();
  }

  async resetDemo(orgId: ID) {
    const { db, bundle } = await this.requireRole(orgId, ['owner']);
    const template = this.seed.demoTemplates[orgId];
    if (!bundle.organization.isDemo || !template) {
      throw new RepositoryError('Solo se pueden reiniciar organizaciones de demostración.', 'forbidden');
    }
    db.bundles[orgId] = template();
    db.events = db.events.filter((e) => e.organizationId !== orgId);
    db.serviceRequests = db.serviceRequests.filter((r) => r.organizationId !== orgId);
    await this.persist();
  }
}
