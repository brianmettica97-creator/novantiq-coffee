import { useState } from 'react';
import { useAdmin } from '../AdminContext';
import { ConfirmButton, Field, MediaPicker, PageHeader, Toggle } from '../ui';
import type { Category, CategoryLayout } from '../../../domain/types';
import { categorySchema, fieldErrors, type FieldErrors } from '../../../domain/validation';

const LAYOUTS: Record<CategoryLayout, string> = {
  feature: 'Portada: primer producto grande + grilla',
  grid: 'Grilla de fotos',
  list: 'Lista editorial (ideal sin fotos)',
  carousel: 'Carrusel horizontal',
};

function CategoryForm({ initial, onDone }: { initial: Category; onDone: () => void }) {
  const { repo, orgId, run } = useAdmin();
  const [c, setC] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = async () => {
    const parsed = categorySchema.safeParse(c);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    const ok = await run(() => repo.saveCategory(orgId, c), 'Categoría guardada');
    if (ok) onDone();
  };
  return (
    <div className="ad-inline-form">
      <div className="ad-grid2">
        <Field label="Nombre" error={errors.name}><input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus /></Field>
        <Field label="Presentación">
          <select value={c.layout} onChange={(e) => setC({ ...c, layout: e.target.value as CategoryLayout })}>
            {Object.entries(LAYOUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descripción" hint="Opcional, se muestra bajo el título." error={errors.description}>
        <textarea rows={2} value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} />
      </Field>
      <MediaPicker kind="image" label="Imagen de la categoría (opcional)" value={c.imageAssetId} onChange={(v) => setC({ ...c, imageAssetId: v })} />
      <Toggle checked={c.visible} onChange={(v) => setC({ ...c, visible: v })} label="Visible en la carta" hint="Ocultala temporalmente sin borrar sus productos." />
      <div className="ad-row">
        <button type="button" className="ad-btn ad-btn--primary" onClick={save}>Guardar</button>
        <button type="button" className="ad-btn" onClick={onDone}>Cancelar</button>
      </div>
    </div>
  );
}

export function CategoriesPage() {
  const { bundle, repo, orgId, run, canEdit } = useAdmin();
  const [editing, setEditing] = useState<string | null>(null);
  const cats = [...bundle.categories].sort((a, b) => a.position - b.position);
  const move = (i: number, dir: -1 | 1) => {
    const ids = cats.map((c) => c.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => repo.reorderCategories(orgId, ids));
  };
  const blank: Category = { id: '', organizationId: orgId, name: '', slug: '', description: '', imageAssetId: null, position: cats.length, visible: true, layout: 'grid' };

  return (
    <>
      <PageHeader title="Categorías" description="Ordená las secciones de la carta y elegí cómo se presenta cada una."
        actions={canEdit && <button className="ad-btn ad-btn--primary" onClick={() => setEditing('new')}>Nueva categoría</button>} />
      {editing === 'new' && <section className="ad-card"><h2>Nueva categoría</h2><CategoryForm initial={blank} onDone={() => setEditing(null)} /></section>}
      <ul className="ad-card ad-list">
        {cats.map((c, i) => {
          const count = bundle.products.filter((p) => p.categoryId === c.id && p.status !== 'archived').length;
          return (
            <li key={c.id}>
              {editing === c.id ? <CategoryForm initial={c} onDone={() => setEditing(null)} /> : (
                <div className="ad-list__row">
                  <span className="ad-order">
                    <button className="ad-icon" disabled={!canEdit || i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${c.name}`}>↑</button>
                    <button className="ad-icon" disabled={!canEdit || i === cats.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${c.name}`}>↓</button>
                  </span>
                  <div className="ad-list__main">
                    <strong>{c.name}</strong>
                    <small>{count} producto(s) · {LAYOUTS[c.layout]}{!c.visible && ' · Oculta'}</small>
                  </div>
                  {canEdit && (
                    <div className="ad-row">
                      <button className="ad-btn ad-btn--sm" onClick={() => run(() => repo.saveCategory(orgId, { ...c, visible: !c.visible }), c.visible ? 'Categoría oculta' : 'Categoría visible')}>{c.visible ? 'Ocultar' : 'Mostrar'}</button>
                      <button className="ad-btn ad-btn--sm" onClick={() => setEditing(c.id)}>Editar</button>
                      <ConfirmButton className="ad-btn ad-btn--sm ad-btn--danger" question={`¿Eliminar “${c.name}”?`} onConfirm={() => run(() => repo.deleteCategory(orgId, c.id), 'Categoría eliminada')} disabled={count > 0}>
                        Eliminar
                      </ConfirmButton>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="ad-muted ad-small">Una categoría solo puede eliminarse cuando no tiene productos activos. Movelos o archivalos primero.</p>
    </>
  );
}
