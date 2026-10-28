import { useState } from 'react';
import { useAdmin } from '../AdminContext';
import { ConfirmButton, Field, PageHeader, Toggle } from '../ui';
import type { OrganizationSettings } from '../../../domain/types';
import { EXTRA_LANGUAGES } from '../../../domain/types';
import { LANGUAGE_NAMES } from '../../../domain/i18n';
import { Link } from 'react-router-dom';
import { settingsSchema, fieldErrors, type FieldErrors } from '../../../domain/validation';
import { DAY_NAMES } from '../../../domain/time';

export function SettingsPage() {
  const { bundle, repo, orgId, run, canEdit, membership } = useAdmin();
  const [s, setS] = useState<OrganizationSettings>(bundle.settings);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof OrganizationSettings>(k: K, v: OrganizationSettings[K]) => setS({ ...s, [k]: v });
  const hourFor = (d: number) => s.hours.find((h) => h.day === d);
  const setHour = (d: number, patch: { opens?: string; closes?: string } | null) => {
    const rest = s.hours.filter((h) => h.day !== d);
    set('hours', patch === null ? rest : [...rest, { day: d, opens: '', closes: '', ...hourFor(d), ...patch }]);
  };

  const save = () => {
    const parsed = settingsSchema.safeParse(s);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({});
    run(() => repo.saveSettings(orgId, s), 'Datos guardados');
  };

  return (
    <>
      <PageHeader title="Datos del local" description="Información visible en la carta y estado de publicación."
        actions={canEdit && <button className="ad-btn ad-btn--primary" onClick={save}>Guardar</button>} />
      <fieldset className="ad-form" disabled={!canEdit}>
        <section className="ad-card">
          <h2>Publicación</h2>
          <Toggle checked={s.menuPublished} onChange={(v) => set('menuPublished', v)} label="Carta publicada"
            hint="Si la despublicás, el QR muestra “Carta no disponible” hasta que vuelvas a activarla." />
        </section>
        <section className="ad-card">
          <h2>Presentación</h2>
          <Field label="Frase breve" error={errors.tagline}><input value={s.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={90} /></Field>
          <Field label="Texto de bienvenida" hint="Aparece al pie de la carta." error={errors.intro}><textarea rows={3} value={s.intro} onChange={(e) => set('intro', e.target.value)} maxLength={400} /></Field>
        </section>
        <section className="ad-card">
          <h2>Contacto y ubicación</h2>
          <div className="ad-grid2">
            <Field label="Dirección" error={errors.address}><input value={s.address} onChange={(e) => set('address', e.target.value)} /></Field>
            <Field label="Ciudad"><input value={s.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="Teléfono"><input value={s.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Instagram" error={errors.instagram}><input value={s.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@tucafeteria" /></Field>
            <Field label="Sitio web" error={errors.website}><input value={s.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
            <Field label="WhatsApp" hint="Con código de país, p. ej. +54 9 11 5555-0000." error={errors.whatsapp}>
              <input value={s.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} inputMode="tel" placeholder="+54 9 11 …" />
            </Field>
            <Field label="Enlace para dejar reseñas" hint="En Google Maps: tu local → “Pedir reseñas” → copiar enlace." error={errors.reviewUrl}>
              <input value={s.reviewUrl} onChange={(e) => set('reviewUrl', e.target.value)} placeholder="https://g.page/r/…" />
            </Field>
            <Field label="Enlace de Google Maps (opcional)" hint="Si lo dejás vacío, “Cómo llegar” usa la dirección." error={errors.mapsUrl}>
              <input value={s.mapsUrl} onChange={(e) => set('mapsUrl', e.target.value)} placeholder="https://maps.app.goo.gl/…" />
            </Field>
          </div>
          <p className="ad-muted ad-small">Estos datos aparecen como botones al pie de la carta: WhatsApp, Instagram, Cómo llegar, Llamar y Dejanos tu reseña.</p>
        </section>
        <section className="ad-card">
          <h2>Idiomas de la carta</h2>
          <p className="ad-muted ad-small">El español es el idioma principal. Activá otros idiomas y cargá las traducciones en <Link to="/admin/idiomas">Idiomas</Link>; lo que no esté traducido se muestra en español.</p>
          <div className="ad-row ad-row--wrap">
            {EXTRA_LANGUAGES.map((l) => (
              <label key={l} className="ad-check">
                <input type="checkbox" checked={s.languages.includes(l)}
                  onChange={(e) => set('languages', e.target.checked ? [...s.languages, l] : s.languages.filter((x) => x !== l))} />
                {LANGUAGE_NAMES[l]}
              </label>
            ))}
          </div>
        </section>
        <section className="ad-card">
          <h2>Servicio de mesa</h2>
          <Toggle checked={s.tableService} onChange={(v) => set('tableService', v)} label="Llamar al mozo y pedir la cuenta"
            hint="Con los QR de mesa, el cliente puede avisar desde su teléfono. Los avisos aparecen en “Avisos de mesas”." />
        </section>
        <section className="ad-card">
          <h2>Horarios</h2>
          <p className="ad-muted ad-small">Se usan para el indicador “Abierto / Cerrado” de la portada. Zona horaria: {s.timeZone}.</p>
          {errors.hours && <p className="ad-error">{errors.hours}</p>}
          <table className="ad-table">
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const h = hourFor(d);
                return (
                  <tr key={d}>
                    <th scope="row">{DAY_NAMES[d]}</th>
                    <td><label className="ad-check"><input type="checkbox" checked={!!h} onChange={(e) => setHour(d, e.target.checked ? { opens: '08:00', closes: '20:00' } : null)} /> Abre</label></td>
                    <td>{h && <input type="time" value={h.opens} onChange={(e) => setHour(d, { opens: e.target.value })} aria-label={`Apertura ${DAY_NAMES[d]}`} />}</td>
                    <td>{h && <input type="time" value={h.closes} onChange={(e) => setHour(d, { closes: e.target.value })} aria-label={`Cierre ${DAY_NAMES[d]}`} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </fieldset>

      <section className="ad-card">
        <h2>Módulos</h2>
        <ul className="ad-modules">
          <li><strong>Carta digital</strong> <span className="ad-pill ad-pill--active">Activo</span></li>
          <li><strong>Analítica de la carta</strong> <span className={`ad-pill ${s.features.analytics ? 'ad-pill--active' : ''}`}>{s.features.analytics ? 'Activo' : 'Inactivo'}</span></li>
          <li><strong>Pedidos y comandas</strong> <span className="ad-pill">Próximamente · fase 6</span></li>
          <li><strong>Tarjeta de fidelidad</strong> <span className={`ad-pill ${s.features.loyalty ? 'ad-pill--active' : ''}`}>{s.features.loyalty ? 'Activo' : 'No incluido en el plan'}</span></li>
        </ul>
        <p className="ad-muted ad-small">Los módulos se habilitan desde NOVANTIQ según el plan contratado.</p>
      </section>

      {bundle.organization.isDemo && membership.role === 'owner' && (
        <section className="ad-card ad-danger-zone">
          <h2>Demostración</h2>
          <p>Esta es una cafetería de demostración. Podés restaurar el contenido original (productos, precios, diseño y fotos) y borrar sus estadísticas.</p>
          <ConfirmButton question="¿Restaurar la demo? Se perderán los cambios hechos." onConfirm={() => run(() => repo.resetDemo(orgId), 'Demo restaurada')}>
            Restaurar datos de demostración
          </ConfirmButton>
        </section>
      )}
    </>
  );
}
