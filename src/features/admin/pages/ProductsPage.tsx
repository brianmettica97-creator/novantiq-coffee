import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../AdminContext';
import { MediaThumb, PageHeader, money } from '../ui';
import { normalize } from '../../../domain/search';
import type { Product, ProductStatus } from '../../../domain/types';

const STATUS_LABEL: Record<ProductStatus, string> = { published: 'Publicado', draft: 'Borrador', archived: 'Archivado' };

export function ProductsPage() {
  const { bundle, repo, orgId, run, canEdit } = useAdmin();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProductStatus | 'all'>('all');
  const [cat, setCat] = useState('all');
  const media = useMemo(() => new Map(bundle.media.map((m) => [m.id, m])), [bundle.media]);
  const categories = [...bundle.categories].sort((a, b) => a.position - b.position);

  const save = (p: Product, patch: Partial<Product>, msg: string) => run(() => repo.saveProduct(orgId, { ...p, ...patch }), msg);

  const move = (p: Product, list: Product[], dir: -1 | 1) => {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => repo.reorderProducts(orgId, p.categoryId, ids));
  };

  const filtered = (list: Product[]) => list.filter((p) =>
    (status === 'all' ? p.status !== 'archived' : p.status === status) &&
    (!q || normalize(p.name).includes(normalize(q))));

  return (
    <>
      <PageHeader
        title="Productos"
        description="Creá, editá, ordená y publicá los productos de la carta."
        actions={canEdit && <Link className="ad-btn ad-btn--primary" to="/admin/productos/nuevo">Nuevo producto</Link>}
      />
      <div className="ad-filters">
        <input type="search" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
          <option value="all">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus | 'all')} aria-label="Estado">
          <option value="all">Activos (publicados y borradores)</option>
          <option value="published">Publicados</option>
          <option value="draft">Borradores</option>
          <option value="archived">Archivados</option>
        </select>
      </div>

      {categories.filter((c) => cat === 'all' || c.id === cat).map((c) => {
        const all = bundle.products.filter((p) => p.categoryId === c.id).sort((a, b) => a.position - b.position);
        const list = filtered(all);
        if (!list.length) return null;
        return (
          <section key={c.id} className="ad-card ad-card--flush">
            <h2 className="ad-card__title">{c.name} {!c.visible && <span className="ad-pill">Categoría oculta</span>}</h2>
            <ul className="ad-products">
              {list.map((p) => {
                const primary = p.media.find((m) => m.role === 'primary');
                const extras = [p.media.some((m) => m.role === 'video') && 'Video'].filter(Boolean);
                return (
                  <li key={p.id} className={`ad-product ${p.status !== 'published' ? 'is-muted' : ''}`}>
                    <MediaThumb asset={primary ? media.get(primary.assetId) : null} size={56} />
                    <button type="button" className="ad-product__main" onClick={() => navigate(`/admin/productos/${p.id}`)}>
                      <strong>{p.name}</strong>
                      <small>
                        {money(p.price)} · {STATUS_LABEL[p.status]}{p.kind === 'combo' ? ' · Combo' : ''}{extras.length ? ` · ${extras.join(', ')}` : ''}
                        {!p.available && ' · Agotado'}
                      </small>
                    </button>
                    {canEdit && (
                      <div className="ad-product__actions">
                        <button type="button" className="ad-btn ad-btn--sm" onClick={() => save(p, { available: !p.available }, p.available ? 'Marcado como agotado' : 'Disponible nuevamente')}>
                          {p.available ? 'Agotar' : 'Reponer'}
                        </button>
                        {p.status === 'published'
                          ? <button type="button" className="ad-btn ad-btn--sm" onClick={() => save(p, { status: 'draft' }, 'Producto despublicado')}>Despublicar</button>
                          : <button type="button" className="ad-btn ad-btn--sm ad-btn--primary" onClick={() => save(p, { status: 'published' }, 'Producto publicado')}>Publicar</button>}
                        <button type="button" className="ad-btn ad-btn--sm" onClick={() => run(() => repo.duplicateProduct(orgId, p.id), 'Producto duplicado como borrador')}>Duplicar</button>
                        {p.status !== 'archived'
                          ? <button type="button" className="ad-btn ad-btn--sm" onClick={() => save(p, { status: 'archived' }, 'Producto archivado')}>Archivar</button>
                          : <button type="button" className="ad-btn ad-btn--sm" onClick={() => save(p, { status: 'draft' }, 'Producto restaurado como borrador')}>Restaurar</button>}
                        <span className="ad-order">
                          <button type="button" className="ad-icon" onClick={() => move(p, all, -1)} aria-label={`Subir ${p.name}`} disabled={all[0].id === p.id}>↑</button>
                          <button type="button" className="ad-icon" onClick={() => move(p, all, 1)} aria-label={`Bajar ${p.name}`} disabled={all[all.length - 1].id === p.id}>↓</button>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
