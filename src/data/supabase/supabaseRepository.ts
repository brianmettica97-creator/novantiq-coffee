// Repositorio Supabase (producción).
// Toda la lógica de negocio y autorización vive en PostgreSQL: funciones RPC
// que se ejecutan con los permisos del usuario (RLS activo) y devuelven JSON
// con la misma forma que los tipos de dominio. Este archivo solo traduce
// llamadas y sube archivos a Storage.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';
import type {
  Category, ID, LoyaltyCard, LoyaltyMember, LoyaltyProgram, LoyaltyStats, MediaAsset, MenuTheme, OptionGroup,
  OrganizationBundle, OrganizationSettings, Product, Promotion, PublicMenu, QrCode, ServiceKind, ServiceRequest,
  ServiceStatus,
} from '../../domain/types';
import type { AnalyticsSummary } from '../../domain/analytics';
import { randomId } from '../../domain/crypto';
import {
  RepositoryError, type Membership, type MenuRepository, type PreparedUpload, type PublicEventInput, type Session,
} from '../repository';

function mapError(error: { message: string; code?: string }): RepositoryError {
  // Las funciones SQL lanzan errores con prefijo: "forbidden: …", "conflict: …".
  const m = /^(forbidden|not_found|conflict|invalid):\s*(.*)$/s.exec(error.message);
  if (m) return new RepositoryError(m[2], m[1] as RepositoryError['code']);
  if (error.code === '42501') return new RepositoryError('No tenés permisos para esta operación.', 'forbidden');
  return new RepositoryError('El servicio no está disponible. Intentá nuevamente.', 'unavailable');
}

export class SupabaseRepository implements MenuRepository {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.sb = client ?? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw mapError(error);
    return data as T;
  }

  /* ------------------------------------------------------------ público */

  getPublicMenu(slug: string) {
    return this.rpc<PublicMenu | null>('public_menu', { p_slug: slug });
  }

  async trackEvent(slug: string, e: PublicEventInput) {
    await this.sb.rpc('track_menu_event', {
      p_slug: slug, p_type: e.type, p_session: e.sessionId, p_product: e.productId ?? null,
      p_category: e.categoryId ?? null, p_promotion: e.promotionId ?? null, p_query: e.query ?? null,
      p_qr_token: e.qrToken ?? null,
    });
  }

  getTableForQr(slug: string, qrToken: string) {
    return this.rpc<string | null>('qr_table', { p_slug: slug, p_token: qrToken });
  }

  requestService(slug: string, qrToken: string, kind: ServiceKind) {
    return this.rpc<'sent' | 'already'>('request_service', { p_slug: slug, p_token: qrToken, p_kind: kind });
  }

  joinLoyalty(slug: string) {
    return this.rpc<LoyaltyCard>('loyalty_join', { p_slug: slug });
  }

  getLoyaltyCard(slug: string, code: string) {
    return this.rpc<LoyaltyCard | null>('loyalty_card', { p_slug: slug, p_code: code });
  }

  /* ---------------------------------------------------------- sesiones */

  async getSession(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { userId: u.id, email: u.email ?? '' } : null;
  }

  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new RepositoryError('Correo o contraseña incorrectos.', 'forbidden');
    return { userId: data.user.id, email: data.user.email ?? email };
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  onAuthChange(cb: (s: Session | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => {
      cb(session?.user ? { userId: session.user.id, email: session.user.email ?? '' } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  listMemberships() {
    return this.rpc<Membership[]>('my_memberships', {});
  }

  /* ------------------------------------------------------------- panel */

  getBundle(orgId: ID) { return this.rpc<OrganizationBundle>('admin_bundle', { p_org: orgId }); }
  saveCategory(orgId: ID, c: Category) { return this.rpc<Category>('save_category', { p_org: orgId, p_data: c }); }
  async deleteCategory(orgId: ID, id: ID) { await this.rpc('delete_category', { p_org: orgId, p_id: id }); }
  async reorderCategories(orgId: ID, ids: ID[]) { await this.rpc('reorder_categories', { p_org: orgId, p_ids: ids }); }
  saveProduct(orgId: ID, p: Product) { return this.rpc<Product>('save_product', { p_org: orgId, p_data: p }); }
  duplicateProduct(orgId: ID, id: ID) { return this.rpc<Product>('duplicate_product', { p_org: orgId, p_id: id }); }
  async reorderProducts(orgId: ID, categoryId: ID, ids: ID[]) {
    await this.rpc('reorder_products', { p_org: orgId, p_category: categoryId, p_ids: ids });
  }
  saveOptionGroup(orgId: ID, g: OptionGroup) { return this.rpc<OptionGroup>('save_option_group', { p_org: orgId, p_data: g }); }
  async deleteOptionGroup(orgId: ID, id: ID) { await this.rpc('delete_option_group', { p_org: orgId, p_id: id }); }
  savePromotion(orgId: ID, p: Promotion) { return this.rpc<Promotion>('save_promotion', { p_org: orgId, p_data: p }); }
  async deletePromotion(orgId: ID, id: ID) { await this.rpc('delete_promotion', { p_org: orgId, p_id: id }); }
  saveSettings(orgId: ID, s: OrganizationSettings) { return this.rpc<OrganizationSettings>('save_settings', { p_org: orgId, p_data: s }); }
  saveTheme(orgId: ID, t: MenuTheme) { return this.rpc<MenuTheme>('save_theme', { p_org: orgId, p_data: t }); }
  createQrCode(orgId: ID, input: { label: string; tableLabel: string | null }) {
    return this.rpc<QrCode>('create_qr_code', { p_org: orgId, p_label: input.label, p_table: input.tableLabel });
  }
  async revokeQrCode(orgId: ID, id: ID) { await this.rpc('revoke_qr_code', { p_org: orgId, p_id: id }); }
  getAnalyticsSummary(orgId: ID, days: number) { return this.rpc<AnalyticsSummary>('analytics_summary', { p_org: orgId, p_days: days }); }
  async resetDemo(orgId: ID) { await this.rpc('reset_demo_organization', { p_org: orgId }); }
  saveLoyaltyProgram(orgId: ID, p: LoyaltyProgram) { return this.rpc<LoyaltyProgram>('save_loyalty_program', { p_org: orgId, p_data: p }); }
  findLoyaltyMember(orgId: ID, code: string) { return this.rpc<LoyaltyMember | null>('loyalty_find_member', { p_org: orgId, p_code: code }); }
  addLoyaltyStamps(orgId: ID, memberId: ID, stamps: number) {
    return this.rpc<LoyaltyMember>('loyalty_add_stamps', { p_org: orgId, p_member: memberId, p_stamps: stamps });
  }
  redeemLoyaltyReward(orgId: ID, memberId: ID) { return this.rpc<LoyaltyMember>('loyalty_redeem', { p_org: orgId, p_member: memberId }); }
  getLoyaltyStats(orgId: ID) { return this.rpc<LoyaltyStats>('loyalty_stats', { p_org: orgId }); }
  listServiceRequests(orgId: ID) { return this.rpc<ServiceRequest[]>('list_service_requests', { p_org: orgId }); }
  async setServiceRequestStatus(orgId: ID, id: ID, status: Exclude<ServiceStatus, 'open'>) {
    await this.rpc('set_service_request_status', { p_org: orgId, p_id: id, p_status: status });
  }

  /* ---------------------------------------------------------- archivos */

  /** Sube los archivos a {org}/{asset}/… — las políticas de Storage exigen ser miembro de {org}. */
  private async upload(orgId: ID, folder: string, up: PreparedUpload) {
    const bucket = this.sb.storage.from(config.mediaBucket);
    const put = async (name: string, blob: Blob) => {
      const path = `${orgId}/${folder}/${name}`;
      const { error } = await bucket.upload(path, blob, { contentType: blob.type || up.mimeType, cacheControl: '31536000', upsert: false });
      if (error) throw new RepositoryError(`No se pudo subir ${name}: ${error.message}`, 'unavailable');
      return { path, url: bucket.getPublicUrl(path).data.publicUrl };
    };
    const main = await put(up.main.name, up.main.blob);
    const variants = [];
    for (const v of up.variants) variants.push({ width: v.width, url: (await put(v.file.name, v.file.blob)).url });
    const poster = up.poster ? (await put(up.poster.name, up.poster.blob)).url : null;
    return {
      url: main.url, storagePrefix: `${orgId}/${folder}/`, variants, posterUrl: poster,
      kind: up.kind, title: up.title, alt: up.alt, mimeType: up.mimeType, bytes: up.bytes,
      width: up.width, height: up.height, placeholder: up.placeholder,
    };
  }

  async uploadMedia(orgId: ID, up: PreparedUpload): Promise<MediaAsset> {
    const id = randomId();
    const files = await this.upload(orgId, id, up);
    return this.rpc<MediaAsset>('register_media', { p_org: orgId, p_data: { id, ...files } });
  }

  async replaceMedia(orgId: ID, assetId: ID, up: PreparedUpload): Promise<MediaAsset> {
    // Carpeta nueva: evita servir versiones viejas desde la caché/CDN.
    const files = await this.upload(orgId, `${assetId}/v${Date.now()}`, up);
    const result = await this.rpc<{ asset: MediaAsset; removed: string[] }>('replace_media_files', { p_org: orgId, p_id: assetId, p_data: files });
    await this.removeStorage(result.removed);
    return result.asset;
  }

  updateMedia(orgId: ID, a: Pick<MediaAsset, 'id' | 'title' | 'alt' | 'focalX' | 'focalY'>) {
    return this.rpc<MediaAsset>('update_media', { p_org: orgId, p_data: a });
  }

  async deleteMedia(orgId: ID, assetId: ID) {
    const prefixes = await this.rpc<string[]>('delete_media', { p_org: orgId, p_id: assetId });
    await this.removeStorage(prefixes);
  }

  private async removeStorage(prefixes: string[]) {
    const bucket = this.sb.storage.from(config.mediaBucket);
    for (const prefix of prefixes) {
      const { data } = await bucket.list(prefix.replace(/\/$/, ''), { limit: 1000 });
      const paths = (data ?? []).filter((f) => f.id).map((f) => `${prefix.replace(/\/$/, '')}/${f.name}`);
      if (paths.length) await bucket.remove(paths);
    }
  }
}
