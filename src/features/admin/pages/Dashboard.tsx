import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin, errorText } from '../AdminContext';
import { PageHeader } from '../ui';
import type { AnalyticsSummary } from '../../../domain/analytics';
import { EVENT_LABELS, MIN_EVENTS_FOR_RANKING } from '../../../domain/analytics';
import { promotionState } from '../../../domain/promotions';

export function Dashboard() {
  const { bundle, repo, orgId } = useAdmin();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AnalyticsSummary | null>(null);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    repo.getAnalyticsSummary(orgId, days).then(setStats).catch((e) => setStatsError(errorText(e)));
  }, [repo, orgId, days]);

  const p = bundle.products;
  const now = new Date();
  const tz = bundle.settings.timeZone;
  const published = p.filter((x) => x.status === 'published');
  const soldOut = published.filter((x) => !x.available);
  const drafts = p.filter((x) => x.status === 'draft');
  const featured = published.filter((x) => x.badges.length);
  const promoActive = bundle.promotions.filter((x) => promotionState(x, now, tz) === 'active');
  const promoScheduled = bundle.promotions.filter((x) => ['outside_hours', 'scheduled'].includes(promotionState(x, now, tz)));
  const noPhoto = published.filter((x) => !x.media.some((m) => m.role === 'primary'));
  const missingAlt = bundle.media.filter((m) => m.kind === 'image' && !m.alt.trim());
  const name = (id: string) => p.find((x) => x.id === id)?.name ?? 'Producto eliminado';
  const catName = (id: string) => bundle.categories.find((x) => x.id === id)?.name ?? 'Categoría eliminada';

  const totalViews = stats ? stats.totals.menu_view : 0;

  return (
    <>
      <PageHeader
        title="Resumen"
        description={`Estado de la carta de ${bundle.organization.name}.`}
        actions={<Link className="ad-btn ad-btn--primary" to="/admin/productos/nuevo">Nuevo producto</Link>}
      />

      <div className={`ad-status ${bundle.settings.menuPublished ? 'is-on' : ''}`}>
        <span aria-hidden="true" />
        {bundle.settings.menuPublished ? 'Carta publicada: el QR muestra los cambios al instante.' : 'Carta despublicada: quien escanee el QR verá "Carta no disponible".'}
        <Link to="/admin/local">Cambiar</Link>
      </div>

      <section className="ad-kpis">
        <Kpi label="Productos publicados" value={published.length} to="/admin/productos" />
        <Kpi label="Categorías visibles" value={bundle.categories.filter((c) => c.visible).length} sub={`de ${bundle.categories.length}`} to="/admin/categorias" />
        <Kpi label="Destacados" value={featured.length} to="/admin/productos" />
        <Kpi label="Agotados" value={soldOut.length} tone={soldOut.length ? 'warn' : undefined} to="/admin/productos" />
        <Kpi label="Promociones activas ahora" value={promoActive.length} sub={promoScheduled.length ? `${promoScheduled.length} programadas` : undefined} to="/admin/promociones" />
        <Kpi label="Borradores" value={drafts.length} to="/admin/productos" />
      </section>

      {(noPhoto.length > 0 || missingAlt.length > 0) && (
        <section className="ad-card">
          <h2>Contenido pendiente</h2>
          <ul className="ad-checklist">
            {noPhoto.length > 0 && <li>{noPhoto.length} producto(s) publicados sin fotografía: {noPhoto.slice(0, 5).map((x) => x.name).join(', ')}{noPhoto.length > 5 ? '…' : ''}.</li>}
            {missingAlt.length > 0 && <li>{missingAlt.length} imagen(es) sin texto alternativo (accesibilidad). <Link to="/admin/multimedia">Completar</Link></li>}
          </ul>
        </section>
      )}

      <section className="ad-card">
        <div className="ad-card__head">
          <h2>Interacción con la carta</h2>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período">
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
        <p className="ad-muted">
          Son interacciones anónimas, no ventas: abrir la ficha de un producto no significa que se haya pedido o comprado.
          {repo.mode === 'local' && ' En modo local solo se registran las visitas hechas desde este navegador.'}
        </p>
        {statsError && <p className="ad-error">{statsError}</p>}
        {stats && (
          <>
            <div className="ad-metrics">
              <Metric label="Sesiones" value={stats.sessions} />
              {(Object.keys(EVENT_LABELS) as (keyof typeof EVENT_LABELS)[]).map((k) => <Metric key={k} label={EVENT_LABELS[k]} value={stats.totals[k]} />)}
            </div>
            {totalViews < MIN_EVENTS_FOR_RANKING ? (
              <p className="ad-empty">Todavía no hay suficientes visitas ({totalViews}) para mostrar rankings confiables. Aparecerán a partir de {MIN_EVENTS_FOR_RANKING} visitas a la carta.</p>
            ) : (
              <div className="ad-two">
                <Ranking title="Productos más consultados" rows={stats.topProducts.map((r) => [name(r.productId), r.views])} />
                <Ranking title="Categorías más vistas" rows={stats.topCategories.map((r) => [catName(r.categoryId), r.views])} />
                <Ranking title="Búsquedas frecuentes" rows={stats.topSearches.map((r) => [r.query, r.count])} />
              </div>
            )}
          </>
        )}
        <p className="ad-muted ad-small">Pedidos iniciados, pedidos enviados y compras confirmadas se medirán por separado cuando se active el módulo de pedidos (fase 6).</p>
      </section>
    </>
  );
}

function Kpi({ label, value, sub, to, tone }: { label: string; value: number; sub?: string; to: string; tone?: 'warn' }) {
  return (
    <Link to={to} className={`ad-kpi ${tone ? `ad-kpi--${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="ad-metric"><strong>{value.toLocaleString('es-AR')}</strong><span>{label}</span></div>;
}

function Ranking({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div>
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="ad-muted">Sin datos.</p> : (
        <ol className="ad-rank">{rows.map(([k, v]) => <li key={k}><span>{k}</span><strong>{v}</strong></li>)}</ol>
      )}
    </div>
  );
}
