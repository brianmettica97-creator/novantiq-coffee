import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdmin } from '../AdminContext';
import { ConfirmButton, Field, MediaPicker, MediaThumb, PageHeader, PriceInput, TagInput, Toggle, money } from '../ui';
import type { DisplayMode, MediaRole, Product, PublicMenu } from '../../../domain/types';
import { productSchema, fieldErrors, type FieldErrors } from '../../../domain/validation';
import { availableModes, buildPublicMenu, comboSeparateValue, resolveProductMedia } from '../../../domain/menu';
import { MenuView } from '../../menu/MenuView';

const ALLERGENS = ['Gluten', 'Leche', 'Huevo', 'Frutos secos', 'Maní', 'Soja', 'Sésamo', 'Pescado', 'Mostaza', 'Apio', 'Sulfitos'];
const TAGS = ['Vegano', 'Vegetariano', 'Sin TACC', 'Sin lactosa', 'Sin azúcar agregada', 'Picante'];
const MODE_LABEL: Record<DisplayMode, string> = { photo: 'Fotografía', gallery: 'Galería', video: 'Video' };

function blank(orgId: string, categoryId: string): Product {
  const now = new Date().toISOString();
  return {
    id: '', organizationId: orgId, categoryId, kind: 'item', name: '', slug: '', description: '', story: '', price: 0,
    status: 'draft', available: true, position: 0, badges: [], tags: [], allergens: [], ingredients: [], size: '', portion: '',
    prepMinutes: null, foodInfo: '', displayMode: 'photo', media: [], optionGroups: [], pairingIds: [], relatedIds: [],
    comboItems: [], station: null, createdAt: now, updatedAt: now,
  };
}

export function ProductEditor() {
  const { id } = useParams();
  const { bundle, repo, orgId, run, canEdit, notify } = useAdmin();
  const navigate = useNavigate();
  const original = bundle.products.find((p) => p.id === id);
  const [p, setP] = useState<Product>(() => original ? structuredClone(original) : blank(orgId, bundle.categories[0]?.id ?? ''));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState(false);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setP((x) => ({ ...x, [k]: v }));
  const assets = useMemo(() => new Map(bundle.media.map((m) => [m.id, m])), [bundle.media]);
  const others = bundle.products.filter((x) => x.id !== p.id && x.status !== 'archived');

  if (id && !original) return <p>El producto no existe o fue eliminado.</p>;

  const roleId = (role: MediaRole) => p.media.find((m) => m.role === role)?.assetId ?? null;
  const setRole = (role: MediaRole, assetId: string | null) => {
    const rest = p.media.filter((m) => m.role !== role);
    set('media', (assetId ? [...rest, { assetId, role, position: rest.length }] : rest).map((m, i) => ({ ...m, position: i })));
  };
  const gallery = p.media.filter((m) => m.role === 'gallery');
  const modes = availableModes(p, resolveProductMedia(p, assets));
  const separate = comboSeparateValue(p, bundle.products);

  const save = async (status?: Product['status']) => {
    const draft = { ...p, status: status ?? p.status };
    const parsed = productSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      notify('Revisá los campos marcados', 'error');
      return;
    }
    setErrors({});
    const saved = await run(() => repo.saveProduct(orgId, draft), 'Producto guardado');
    if (saved) {
      setP(saved);
      if (!id) navigate(`/admin/productos/${saved.id}`, { replace: true });
    }
  };

  // Vista previa: la carta tal como quedaría con este producto publicado.
  const previewMenu: PublicMenu | null = preview ? buildPublicMenu({
    ...bundle,
    settings: { ...bundle.settings, menuPublished: true, showCover: false },
    products: [...bundle.products.filter((x) => x.id !== p.id), { ...p, id: p.id || 'preview', slug: p.slug || 'vista-previa', status: 'published' }],
  }) : null;

  return (
    <>
      <PageHeader
        title={id ? p.name || 'Producto' : 'Nuevo producto'}
        description={id ? `Estado: ${{ published: 'publicado', draft: 'borrador', archived: 'archivado' }[p.status]}` : 'Completá solo lo que necesites: ningún campo extra es obligatorio.'}
        actions={canEdit && (
          <>
            <button className="ad-btn" type="button" onClick={() => setPreview(true)}>Vista previa</button>
            <button className="ad-btn" type="button" onClick={() => save()}>Guardar</button>
            {p.status !== 'published' && <button className="ad-btn ad-btn--primary" type="button" onClick={() => save('published')}>Guardar y publicar</button>}
          </>
        )}
      />

      <fieldset className="ad-form" disabled={!canEdit}>
        <section className="ad-card">
          <h2>Información principal</h2>
          <div className="ad-grid2">
            <Field label="Nombre" error={errors.name}><input value={p.name} onChange={(e) => set('name', e.target.value)} maxLength={80} /></Field>
            <Field label="Categoría" error={errors.categoryId}>
              <select value={p.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                {bundle.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Precio" error={errors.price} hint={p.kind === 'combo' ? 'Precio fijo del combo: no cambia si cambian los precios de sus productos.' : 'Precio base. Las opciones suman o restan sobre este valor.'}>
              <PriceInput value={p.price} onChange={(v) => set('price', v)} />
            </Field>
            <Field label="Tipo">
              <select value={p.kind} onChange={(e) => set('kind', e.target.value as Product['kind'])}>
                <option value="item">Producto</option>
                <option value="combo">Combo</option>
              </select>
            </Field>
          </div>
          <Field label="Descripción breve" hint="Se muestra en la tarjeta. Hasta 280 caracteres." error={errors.description}>
            <textarea rows={2} value={p.description} onChange={(e) => set('description', e.target.value)} maxLength={280} />
          </Field>
          <Field label="Historia o detalle" hint="Opcional. Aparece al abrir la ficha.">
            <textarea rows={3} value={p.story} onChange={(e) => set('story', e.target.value)} maxLength={1200} />
          </Field>
          <div className="ad-row ad-row--wrap">
            <Toggle checked={p.available} onChange={(v) => set('available', v)} label="Disponible" hint="Desactivalo para mostrarlo como agotado sin quitarlo de la carta." />
          </div>
        </section>

        {p.kind === 'combo' && (
          <section className="ad-card">
            <h2>Productos incluidos</h2>
            {errors.comboItems && <p className="ad-error">{errors.comboItems}</p>}
            {p.comboItems.map((item, i) => (
              <div key={i} className="ad-combo-row">
                <select value={item.productId} onChange={(e) => set('comboItems', p.comboItems.map((c, j) => j === i ? { ...c, productId: e.target.value } : c))} aria-label="Producto">
                  {others.filter((o) => o.kind === 'item').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <input type="number" min={1} max={20} value={item.quantity} aria-label="Cantidad"
                  onChange={(e) => set('comboItems', p.comboItems.map((c, j) => j === i ? { ...c, quantity: Math.max(1, Number(e.target.value)) } : c))} />
                <select multiple value={item.substituteIds} aria-label="Sustitutos permitidos" title="Sustitutos permitidos (Ctrl/Cmd para elegir varios)"
                  onChange={(e) => set('comboItems', p.comboItems.map((c, j) => j === i ? { ...c, substituteIds: [...e.target.selectedOptions].map((o) => o.value) } : c))}>
                  {others.filter((o) => o.kind === 'item' && o.id !== item.productId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button type="button" className="ad-link" onClick={() => set('comboItems', p.comboItems.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            ))}
            <button type="button" className="ad-btn ad-btn--sm" onClick={() => set('comboItems', [...p.comboItems, { productId: others.find((o) => o.kind === 'item')?.id ?? '', quantity: 1, substituteIds: [] }])}>Agregar producto</button>
            {separate !== null && (
              <p className={separate <= p.price ? 'ad-error' : 'ad-muted'}>
                Valor por separado: {money(separate)}. {separate <= p.price ? 'El combo no ofrece ahorro: revisá el precio.' : `Ahorro para el cliente: ${money(separate - p.price)}.`}
              </p>
            )}
          </section>
        )}

        <section className="ad-card">
          <h2>Opciones y variantes</h2>
          <p className="ad-muted">Grupos reutilizables (tamaños, leches, extras). Los ajustes de precio de abajo solo afectan a este producto.</p>
          {p.optionGroups.sort((a, b) => a.position - b.position).map((link, i) => {
            const g = bundle.optionGroups.find((x) => x.id === link.groupId);
            if (!g) return null;
            return (
              <details key={link.groupId} className="ad-group">
                <summary>
                  <strong>{g.name}</strong> <small>{g.internalName} · {g.required ? 'obligatorio' : 'opcional'}</small>
                  <span className="ad-order">
                    <button type="button" className="ad-icon" disabled={i === 0} aria-label="Subir grupo" onClick={(e) => {
                      e.preventDefault();
                      const l = [...p.optionGroups]; [l[i - 1], l[i]] = [l[i], l[i - 1]];
                      set('optionGroups', l.map((x, j) => ({ ...x, position: j })));
                    }}>↑</button>
                    <button type="button" className="ad-link" onClick={(e) => { e.preventDefault(); set('optionGroups', p.optionGroups.filter((x) => x.groupId !== g.id).map((x, j) => ({ ...x, position: j }))); }}>Quitar</button>
                  </span>
                </summary>
                <table className="ad-table">
                  <thead><tr><th>Opción</th><th>Precio del grupo</th><th>Ajuste para este producto</th><th>Ofrecer</th></tr></thead>
                  <tbody>
                    {g.options.map((o) => {
                      const ov = link.overrides[o.id] ?? {};
                      const update = (patch: typeof ov) => set('optionGroups', p.optionGroups.map((x) => x.groupId === g.id
                        ? { ...x, overrides: { ...x.overrides, [o.id]: { ...ov, ...patch } } } : x));
                      return (
                        <tr key={o.id}>
                          <td>{o.name}</td>
                          <td>{o.priceDelta ? money(o.priceDelta) : '—'}</td>
                          <td>
                            {ov.priceDelta !== undefined
                              ? <span className="ad-row"><PriceInput value={ov.priceDelta} allowNegative onChange={(v) => update({ priceDelta: v })} /><button type="button" className="ad-link" onClick={() => { const { priceDelta: _drop, ...rest } = ov; set('optionGroups', p.optionGroups.map((x) => x.groupId === g.id ? { ...x, overrides: { ...x.overrides, [o.id]: rest } } : x)); }}>Usar el del grupo</button></span>
                              : <button type="button" className="ad-link" onClick={() => update({ priceDelta: o.priceDelta })}>Ajustar</button>}
                          </td>
                          <td><input type="checkbox" checked={ov.available ?? true} onChange={(e) => update({ available: e.target.checked })} aria-label={`Ofrecer ${o.name}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            );
          })}
          <select value="" onChange={(e) => e.target.value && set('optionGroups', [...p.optionGroups, { groupId: e.target.value, position: p.optionGroups.length, overrides: {} }])} aria-label="Agregar grupo de opciones">
            <option value="">+ Agregar grupo de opciones…</option>
            {bundle.optionGroups.filter((g) => !p.optionGroups.some((l) => l.groupId === g.id)).map((g) => <option key={g.id} value={g.id}>{g.name} — {g.internalName}</option>)}
          </select>
        </section>

        <section className="ad-card">
          <h2>Fotos y video</h2>
          <div className="ad-media-grid">
            <MediaPicker kind="image" label="Fotografía principal" value={roleId('primary')} onChange={(v) => setRole('primary', v)} />
            <MediaPicker kind="video" label="Video del producto" value={roleId('video')} onChange={(v) => setRole('video', v)} />
          </div>
          <h3>Galería</h3>
          <div className="ad-row ad-row--wrap">
            {gallery.map((g) => (
              <span key={g.assetId} className="ad-gallery-item">
                <MediaThumb asset={assets.get(g.assetId)} size={84} />
                <button type="button" className="ad-link" onClick={() => set('media', p.media.filter((m) => !(m.role === 'gallery' && m.assetId === g.assetId)))}>Quitar</button>
              </span>
            ))}
            <select value="" aria-label="Agregar foto a la galería" onChange={(e) => e.target.value && set('media', [...p.media, { assetId: e.target.value, role: 'gallery', position: p.media.length }])}>
              <option value="">+ Agregar foto existente…</option>
              {bundle.media.filter((m) => m.kind === 'image' && !p.media.some((x) => x.assetId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
          <Field label="Presentación inicial en la ficha" hint="Si el recurso elegido no existe o falla, la carta muestra la fotografía.">
            <select value={p.displayMode} onChange={(e) => set('displayMode', e.target.value as DisplayMode)}>
              {(['photo', 'gallery', 'video'] as DisplayMode[]).map((m) => (
                <option key={m} value={m} disabled={m !== 'photo' && !modes.some((x) => x.mode === m)}>{MODE_LABEL[m]}</option>
              ))}
            </select>
          </Field>
        </section>

        <section className="ad-card">
          <h2>Información alimentaria</h2>
          <div className="ad-grid3">
            <Field label="Tamaño" hint="Ej.: 240 ml"><input value={p.size} onChange={(e) => set('size', e.target.value)} /></Field>
            <Field label="Porción" hint="Ej.: 1 unidad, para 2"><input value={p.portion} onChange={(e) => set('portion', e.target.value)} /></Field>
            <Field label="Preparación (min)"><input type="number" min={0} max={240} value={p.prepMinutes ?? ''} onChange={(e) => set('prepMinutes', e.target.value === '' ? null : Number(e.target.value))} /></Field>
          </div>
          <Field label="Ingredientes"><TagInput value={p.ingredients} onChange={(v) => set('ingredients', v)} placeholder="Escribí y presioná Enter" /></Field>
          <Field label="Alérgenos declarados"><TagInput value={p.allergens} onChange={(v) => set('allergens', v)} suggestions={ALLERGENS} placeholder="Otro alérgeno…" /></Field>
          <Field label="Etiquetas" hint="Las etiquetas compartidas por 2 o más productos aparecen como filtro en la carta."><TagInput value={p.tags} onChange={(v) => set('tags', v)} suggestions={TAGS} placeholder="Otra etiqueta…" /></Field>
          <Field label="Información adicional"><textarea rows={2} value={p.foodInfo} onChange={(e) => set('foodInfo', e.target.value)} /></Field>
          <Field label="Estación de preparación" hint="Se usará para enviar comandas a barra o cocina (fase 6).">
            <select value={p.station ?? ''} onChange={(e) => set('station', (e.target.value || null) as Product['station'])}>
              <option value="">Sin definir</option><option value="barra">Barra de café</option><option value="cocina">Cocina</option>
              <option value="pasteleria">Pastelería</option><option value="despacho">Despacho</option>
            </select>
          </Field>
        </section>

        <section className="ad-card">
          <h2>Destacar y recomendar</h2>
          {errors.badges && <p className="ad-error">{errors.badges}</p>}
          <div className="ad-row ad-row--wrap">
            {bundle.badges.map((b) => (
              <label key={b.key} className="ad-check">
                <input type="checkbox" checked={p.badges.includes(b.key)} onChange={(e) => set('badges', e.target.checked ? [...p.badges, b.key] : p.badges.filter((x) => x !== b.key))} />
                {b.label}
              </label>
            ))}
          </div>
          {p.badges.some((k) => bundle.badges.find((b) => b.key === k)?.requiresEvidence) && (
            <p className="ad-warn">Usá “Más vendido” solo si tus registros de venta lo respaldan.</p>
          )}
          <div className="ad-grid2">
            <Field label="Va bien con" hint="Sugerencias de combinación">
              <select multiple value={p.pairingIds} onChange={(e) => set('pairingIds', [...e.target.selectedOptions].map((o) => o.value))}>
                {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Productos relacionados">
              <select multiple value={p.relatedIds} onChange={(e) => set('relatedIds', [...e.target.selectedOptions].map((o) => o.value))}>
                {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
          </div>
        </section>
      </fieldset>

      {canEdit && id && (
        <div className="ad-row ad-danger-zone">
          {p.status !== 'archived'
            ? <ConfirmButton question="¿Archivar este producto? Dejará de verse en la carta." onConfirm={() => save('archived')}>Archivar producto</ConfirmButton>
            : <button className="ad-btn" type="button" onClick={() => save('draft')}>Restaurar como borrador</button>}
        </div>
      )}

      {preview && previewMenu && (
        <div className="ad-preview-modal" role="dialog" aria-modal="true" aria-label="Vista previa del producto">
          <div className="ad-preview-modal__bar">
            <strong>Vista previa (sin guardar)</strong>
            <button className="ad-btn" type="button" onClick={() => setPreview(false)}>Cerrar vista previa</button>
          </div>
          <div className="ad-phone"><div className="ad-phone__screen">
            <MenuView menu={previewMenu} openSlug={p.slug || 'vista-previa'} onOpenSlug={(s) => { if (!s) setPreview(false); }} embedded />
          </div></div>
        </div>
      )}
    </>
  );
}
