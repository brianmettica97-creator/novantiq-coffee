import { useState } from 'react';
import { useAdmin } from '../AdminContext';
import { ConfirmButton, Field, MediaPicker, PageHeader, Toggle } from '../ui';
import type { Promotion, PromotionKind } from '../../../domain/types';
import { promotionSchema, fieldErrors, type FieldErrors } from '../../../domain/validation';
import { describeSchedule, promotionState, type PromotionState } from '../../../domain/promotions';
import { DAY_NAMES } from '../../../domain/time';

const STATE: Record<PromotionState, string> = {
  active: 'Activa ahora', scheduled: 'Programada', expired: 'Vencida', paused: 'Pausada', outside_hours: 'Fuera de horario',
};
const KIND: Record<PromotionKind, string> = {
  announcement: 'Anuncio (sin cambio de precio)', percent_off: 'Descuento porcentual', combo_price: 'Combo con precio especial',
};

const toLocalInput = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const fromLocalInput = (v: string) => v ? new Date(v).toISOString() : null;

function PromoForm({ initial, onDone }: { initial: Promotion; onDone: () => void }) {
  const { bundle, repo, orgId, run } = useAdmin();
  const [p, setP] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof Promotion>(k: K, v: Promotion[K]) => setP({ ...p, [k]: v });
  const save = async () => {
    const parsed = promotionSchema.safeParse(p);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    if (await run(() => repo.savePromotion(orgId, p), 'Promoción guardada')) onDone();
  };
  const candidates = bundle.products.filter((x) => x.status !== 'archived' && (p.kind !== 'combo_price' || x.kind === 'combo'));
  return (
    <div className="ad-inline-form">
      <div className="ad-grid2">
        <Field label="Título" error={errors.title}><input value={p.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Tipo">
          <select value={p.kind} onChange={(e) => set('kind', e.target.value as PromotionKind)}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descripción"><textarea rows={2} value={p.description} onChange={(e) => set('description', e.target.value)} /></Field>
      {p.kind === 'percent_off' && (
        <Field label="Porcentaje de descuento" error={errors.percentOff} hint="Se aplica sobre el precio final con opciones, solo mientras la promoción está activa.">
          <input type="number" min={1} max={90} value={p.percentOff ?? ''} onChange={(e) => set('percentOff', e.target.value ? Number(e.target.value) : null)} />
        </Field>
      )}
      <Field label={p.kind === 'combo_price' ? 'Combos destacados' : 'Productos alcanzados'} error={errors.productIds} hint="Ctrl/Cmd + clic para elegir varios.">
        <select multiple value={p.productIds} onChange={(e) => set('productIds', [...e.target.selectedOptions].map((o) => o.value))} size={6}>
          {candidates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <div className="ad-grid2">
        <Field label="Desde (opcional)"><input type="datetime-local" value={toLocalInput(p.startsAt)} onChange={(e) => set('startsAt', fromLocalInput(e.target.value))} /></Field>
        <Field label="Hasta (opcional)" error={errors.endsAt}><input type="datetime-local" value={toLocalInput(p.endsAt)} onChange={(e) => set('endsAt', fromLocalInput(e.target.value))} /></Field>
      </div>
      <fieldset className="ad-days">
        <legend>Días (ninguno = todos)</legend>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <label key={d} className="ad-check">
            <input type="checkbox" checked={p.days.includes(d)} onChange={(e) => set('days', e.target.checked ? [...p.days, d] : p.days.filter((x) => x !== d))} />
            {DAY_NAMES[d].slice(0, 3)}
          </label>
        ))}
      </fieldset>
      <div className="ad-grid2">
        <Field label="Hora de inicio" hint="Hora del local" error={errors.startTime}><input type="time" value={p.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
        <Field label="Hora de fin" error={errors.endTime}><input type="time" value={p.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
      </div>
      <Field label="Condiciones"><textarea rows={2} value={p.conditions} onChange={(e) => set('conditions', e.target.value)} /></Field>
      <div className="ad-media-grid">
        <MediaPicker kind="image" label="Imagen" value={p.imageAssetId} onChange={(v) => set('imageAssetId', v)} />
        <MediaPicker kind="video" label="Video (opcional)" value={p.videoAssetId} onChange={(v) => set('videoAssetId', v)} />
      </div>
      <Toggle checked={p.active} onChange={(v) => set('active', v)} label="Activada" hint="Además debe estar dentro de su vigencia para mostrarse." />
      <div className="ad-row">
        <button type="button" className="ad-btn ad-btn--primary" onClick={save}>Guardar promoción</button>
        <button type="button" className="ad-btn" onClick={onDone}>Cancelar</button>
      </div>
    </div>
  );
}

export function PromotionsPage() {
  const { bundle, repo, orgId, run, canEdit } = useAdmin();
  const [editing, setEditing] = useState<string | null>(null);
  const now = new Date();
  const blank: Promotion = {
    id: '', organizationId: orgId, title: '', description: '', kind: 'announcement', percentOff: null, productIds: [],
    imageAssetId: null, videoAssetId: null, startsAt: null, endsAt: null, days: [], startTime: '', endTime: '',
    active: true, conditions: '', position: bundle.promotions.length,
  };
  return (
    <>
      <PageHeader title="Promociones" description="Las promociones vencidas o fuera de horario no se muestran en la carta. Los cambios de precio no alteran pedidos ya confirmados."
        actions={canEdit && <button className="ad-btn ad-btn--primary" onClick={() => setEditing('new')}>Nueva promoción</button>} />
      {editing === 'new' && <section className="ad-card"><h2>Nueva promoción</h2><PromoForm initial={blank} onDone={() => setEditing(null)} /></section>}
      <ul className="ad-card ad-list">
        {bundle.promotions.length === 0 && <li className="ad-empty">No hay promociones.</li>}
        {bundle.promotions.map((p) => {
          const st = promotionState(p, now, bundle.settings.timeZone);
          return (
            <li key={p.id}>
              {editing === p.id ? <PromoForm initial={p} onDone={() => setEditing(null)} /> : (
                <div className="ad-list__row">
                  <div className="ad-list__main">
                    <strong>{p.title} <span className={`ad-pill ad-pill--${st}`}>{STATE[st]}</span></strong>
                    <small>{KIND[p.kind]}{p.percentOff ? ` · −${p.percentOff}%` : ''}{describeSchedule(p) ? ` · ${describeSchedule(p)}` : ''}</small>
                  </div>
                  {canEdit && (
                    <div className="ad-row">
                      <button className="ad-btn ad-btn--sm" onClick={() => setEditing(p.id)}>Editar</button>
                      <ConfirmButton className="ad-btn ad-btn--sm ad-btn--danger" question="¿Eliminar la promoción?" onConfirm={() => run(() => repo.deletePromotion(orgId, p.id), 'Promoción eliminada')}>Eliminar</ConfirmButton>
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
