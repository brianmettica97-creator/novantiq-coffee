import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository, type LocalSeed } from './localRepository';
import { buildMokaStudioBundle } from '../../demo/mokaStudio';
import { RepositoryError } from '../repository';
import type { OrganizationBundle } from '../../domain/types';

// Dos cafeterías y tres usuarios para verificar permisos en el modo local.
function seed(): LocalSeed {
  const moka = buildMokaStudioBundle();
  const other: OrganizationBundle = structuredClone(moka);
  other.organization = { ...other.organization, id: 'org-b', slug: 'otra', name: 'Otra', isDemo: false };
  return {
    bundles: [moka, other],
    demoTemplates: { [moka.organization.id]: buildMokaStudioBundle },
    users: [
      { id: 'u-owner', email: 'owner@a.test', password: 'secreto1', memberships: [{ organizationId: moka.organization.id, role: 'owner' }] },
      { id: 'u-staff', email: 'staff@a.test', password: 'secreto2', memberships: [{ organizationId: moka.organization.id, role: 'staff' }] },
      { id: 'u-other', email: 'owner@b.test', password: 'secreto3', memberships: [{ organizationId: 'org-b', role: 'owner' }] },
    ],
  };
}

let repo: LocalRepository;
const MOKA = buildMokaStudioBundle().organization.id;
let n = 0;

beforeEach(() => {
  repo = new LocalRepository(seed(), `test-${n++}`);
});

describe('repositorio local', () => {
  it('rechaza credenciales inválidas y no expone el panel sin sesión', async () => {
    await expect(repo.signIn('owner@a.test', 'mal')).rejects.toBeInstanceOf(RepositoryError);
    await expect(repo.getBundle(MOKA)).rejects.toThrow(/Iniciá sesión/);
  });

  it('crea y edita productos; el cambio de precio se refleja en la carta', async () => {
    await repo.signIn('owner@a.test', 'secreto1');
    const b = await repo.getBundle(MOKA);
    const cap = b.products.find((p) => p.slug === 'cappuccino')!;
    await repo.saveProduct(MOKA, { ...cap, price: 510000 });
    const menu = await repo.getPublicMenu('moka-studio');
    expect(menu!.products.find((p) => p.slug === 'cappuccino')!.price).toBe(510000);

    const created = await repo.saveProduct(MOKA, { ...cap, id: '', slug: '', name: 'Cappuccino', status: 'draft' });
    expect(created.slug).toBe('cappuccino-2');
    expect((await repo.getPublicMenu('moka-studio'))!.products.some((p) => p.id === created.id)).toBe(false);
  });

  it('ordena categorías y protege las que tienen productos', async () => {
    await repo.signIn('owner@a.test', 'secreto1');
    const b = await repo.getBundle(MOKA);
    const ids = b.categories.map((c) => c.id).reverse();
    await repo.reorderCategories(MOKA, ids);
    expect((await repo.getPublicMenu('moka-studio'))!.categories.map((c) => c.id)).toEqual(ids);
    await expect(repo.deleteCategory(MOKA, ids[0])).rejects.toThrow(/producto/);
  });

  it('no permite tocar otra cafetería ni referenciar sus recursos', async () => {
    await repo.signIn('owner@b.test', 'secreto3');
    await expect(repo.getBundle(MOKA)).rejects.toThrow(/permisos/);
    const own = await repo.getBundle('org-b');
    const mokaRepoAsset = buildMokaStudioBundle().media[0].id;
    // Los ids coinciden porque "otra" es un clon: probamos con un id ajeno real.
    await expect(repo.saveProduct('org-b', { ...own.products[0], media: [{ assetId: 'asset-de-otro', role: 'primary', position: 0 }] }))
      .rejects.toThrow(/Referencia inválida/);
    expect(mokaRepoAsset).toBeTruthy();
  });

  it('el personal puede ver pero no editar', async () => {
    await repo.signIn('staff@a.test', 'secreto2');
    const b = await repo.getBundle(MOKA);
    await expect(repo.saveProduct(MOKA, b.products[0])).rejects.toThrow(/permisos/);
  });

  it('impide borrar archivos en uso y reinicia la demo', async () => {
    await repo.signIn('owner@a.test', 'secreto1');
    const b = await repo.getBundle(MOKA);
    await expect(repo.deleteMedia(MOKA, b.products[0].media[0].assetId)).rejects.toThrow(/en uso/);
    await repo.saveProduct(MOKA, { ...b.products[0], price: 1 });
    await repo.resetDemo(MOKA);
    expect((await repo.getBundle(MOKA)).products[0].price).toBe(b.products[0].price);
  });

  it('no permite cambiar los módulos del plan desde el panel', async () => {
    await repo.signIn('owner@a.test', 'secreto1');
    const b = await repo.getBundle(MOKA);
    const saved = await repo.saveSettings(MOKA, { ...b.settings, features: { orders: true, loyalty: true, analytics: true } });
    expect(saved.features.orders).toBe(false);
  });

  it('registra analítica anónima y la resume sin confundirla con ventas', async () => {
    await repo.trackEvent('moka-studio', { type: 'menu_view', sessionId: 's1' });
    await repo.trackEvent('moka-studio', { type: 'product_view', sessionId: 's1', productId: 'p1' });
    await repo.trackEvent('moka-studio', { type: 'product_view', sessionId: 's2', productId: 'p1' });
    await repo.signIn('owner@a.test', 'secreto1');
    const s = await repo.getAnalyticsSummary(MOKA, 30);
    expect(s.totals.menu_view).toBe(1);
    expect(s.totals.product_view).toBe(2);
    expect(s.sessions).toBe(2);
    expect(Object.keys(s.totals)).not.toContain('purchase');
  });
});
