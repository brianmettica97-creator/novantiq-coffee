import { useState } from 'react';
import { useAdmin } from '../AdminContext';
import { ConfirmButton, Field, PageHeader, PriceInput, Toggle, money } from '../ui';
import type { OptionGroup } from '../../../domain/types';
import { optionGroupSchema, fieldErrors, type FieldErrors } from '../../../domain/validation';

function GroupForm({ initial, onDone }: { initial: OptionGroup; onDone: () => void }) {
  const { repo, orgId, run } = useAdmin();
  const [g, setG] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const setOpt = (i: number, patch: Partial<OptionGroup['options'][number]>) =>
    setG({ ...g, options: g.options.map((o, j) => j === i ? { ...o, ...patch } : o) });

  const save = async () => {
    const parsed = optionGroupSchema.safeParse(g);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    if (await run(() => repo.saveOptionGroup(orgId, g), 'Grupo guardado')) onDone();
  };

  return (
    <div className="ad-inline-form">
      <div className="ad-grid2">
        <Field label="Nombre visible" hint="Lo que ve el cliente: “Tamaño”, “Leche”…" error={errors.name}><input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></Field>
        <Field label="Nombre interno" hint="Para distinguirlo en el panel."><input value={g.internalName} onChange={(e) => setG({ ...g, internalName: e.target.value })} /></Field>
      </div>
      <div className="ad-row ad-row--wrap">
        <Toggle checked={g.required} onChange={(v) => setG({ ...g, required: v, minSelect: v ? Math.max(1, g.minSelect) : 0 })} label="Obligatorio" hint="El cliente debe elegir para continuar." />
        <Field label="Mínimo" error={errors.minSelect}><input type="number" min={0} max={20} value={g.minSelect} onChange={(e) => setG({ ...g, minSelect: Number(e.target.value) })} /></Field>
        <Field label="Máximo"><input type="number" min={1} max={20} value={g.maxSelect} onChange={(e) => setG({ ...g, maxSelect: Number(e.target.value) })} /></Field>
      </div>
      {errors.options && <p className="ad-error">{errors.options}</p>}
      <table className="ad-table">
        <thead><tr><th>Opción</th><th>Precio adicional</th><th>Predeterminada</th><th>Disponible</th><th /></tr></thead>
        <tbody>
          {g.options.map((o, i) => (
            <tr key={o.id || i}>
              <td><input value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} aria-label="Nombre de la opción" /></td>
              <td><PriceInput value={o.priceDelta} allowNegative onChange={(v) => setOpt(i, { priceDelta: v })} /></td>
              <td><input type="checkbox" checked={o.isDefault} onChange={(e) => setOpt(i, { isDefault: e.target.checked })} aria-label="Predeterminada" /></td>
              <td><input type="checkbox" checked={o.available} onChange={(e) => setOpt(i, { available: e.target.checked })} aria-label="Disponible" /></td>
              <td><button type="button" className="ad-link" onClick={() => setG({ ...g, options: g.options.filter((_, j) => j !== i) })}>Quitar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="ad-btn ad-btn--sm" onClick={() => setG({ ...g, options: [...g.options, { id: '', name: '', priceDelta: 0, available: true, isDefault: false, position: g.options.length }] })}>Agregar opción</button>
      <div className="ad-row">
        <button type="button" className="ad-btn ad-btn--primary" onClick={save}>Guardar grupo</button>
        <button type="button" className="ad-btn" onClick={onDone}>Cancelar</button>
      </div>
    </div>
  );
}

export function OptionGroupsPage() {
  const { bundle, repo, orgId, run, canEdit } = useAdmin();
  const [editing, setEditing] = useState<string | null>(null);
  const blank: OptionGroup = { id: '', organizationId: orgId, name: '', internalName: '', required: false, minSelect: 0, maxSelect: 1, options: [] };
  return (
    <>
      <PageHeader title="Opciones y variantes"
        description="Definí una vez los tamaños, leches o extras y reutilizalos en todos los productos. Un grupo obligatorio de una sola elección funciona como variante."
        actions={canEdit && <button className="ad-btn ad-btn--primary" onClick={() => setEditing('new')}>Nuevo grupo</button>} />
      {editing === 'new' && <section className="ad-card"><h2>Nuevo grupo</h2><GroupForm initial={blank} onDone={() => setEditing(null)} /></section>}
      <ul className="ad-card ad-list">
        {bundle.optionGroups.map((g) => {
          const users = bundle.products.filter((p) => p.optionGroups.some((l) => l.groupId === g.id));
          return (
            <li key={g.id}>
              {editing === g.id ? <GroupForm initial={g} onDone={() => setEditing(null)} /> : (
                <div className="ad-list__row">
                  <div className="ad-list__main">
                    <strong>{g.name} <small className="ad-muted">· {g.internalName}</small></strong>
                    <small>{g.options.map((o) => `${o.name}${o.priceDelta ? ` (${money(o.priceDelta)})` : ''}`).join(' · ')}</small>
                    <small>{g.required ? 'Obligatorio' : 'Opcional'} · elige {g.minSelect === g.maxSelect ? g.maxSelect : `${g.minSelect}–${g.maxSelect}`} · usado en {users.length} producto(s)</small>
                  </div>
                  {canEdit && (
                    <div className="ad-row">
                      <button className="ad-btn ad-btn--sm" onClick={() => setEditing(g.id)}>Editar</button>
                      <ConfirmButton className="ad-btn ad-btn--sm ad-btn--danger" question="¿Eliminar el grupo?" disabled={users.length > 0}
                        onConfirm={() => run(() => repo.deleteOptionGroup(orgId, g.id), 'Grupo eliminado')}>Eliminar</ConfirmButton>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
