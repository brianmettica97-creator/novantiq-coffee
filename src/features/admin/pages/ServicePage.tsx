import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin, errorText } from '../AdminContext';
import { PageHeader, Toggle } from '../ui';
import type { ServiceRequest } from '../../../domain/types';
import { Icon } from '../../../ui/Icon';

const POLL_MS = 8000;

function ago(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return min < 1 ? 'recién' : min === 1 ? 'hace 1 min' : `hace ${min} min`;
}

/** Tono corto con Web Audio: no requiere archivos. */
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* sin audio */ }
}

export function ServicePage() {
  const { bundle, repo, orgId, notify } = useAdmin();
  const [list, setList] = useState<ServiceRequest[] | null>(null);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(Date.now());
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const items = await repo.listServiceRequests(orgId);
      const fresh = items.filter((r) => r.status === 'open' && seen.current && !seen.current.has(r.id));
      if (fresh.length && sound) beep();
      seen.current = new Set(items.map((r) => r.id));
      setList(items);
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
    setNow(Date.now());
  }, [repo, orgId, sound]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const open = list?.filter((r) => r.status === 'open').length ?? 0;
  useEffect(() => {
    document.title = `${open ? `(${open}) ` : ''}Avisos de mesas · Panel NOVANTIQ COFFEE`;
  }, [open]);

  const update = async (r: ServiceRequest, status: 'acknowledged' | 'closed') => {
    try {
      await repo.setServiceRequestStatus(orgId, r.id, status);
      await load();
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  const tables = bundle.qrCodes.filter((q) => q.tableLabel && !q.revokedAt).length;

  return (
    <>
      <PageHeader title="Avisos de mesas" description="Pedidos de atención y de cuenta hechos desde la carta. Se actualiza solo cada pocos segundos." />
      {!bundle.settings.tableService && (
        <p className="ad-warn">El servicio de mesa está desactivado. Activalo en <Link to="/admin/local">Datos del local</Link>.</p>
      )}
      {bundle.settings.tableService && tables === 0 && (
        <p className="ad-warn">No hay QR de mesa. Creá uno por mesa en <Link to="/admin/qr">Código QR</Link> indicando el nombre de la mesa.</p>
      )}
      <div className="ad-row ad-row--wrap ad-service__bar">
        <Toggle checked={sound} onChange={setSound} label="Sonido ante avisos nuevos" hint="Dejá esta pantalla abierta en la caja o en la barra." />
      </div>
      {error && <p className="ad-error">{error}</p>}
      {list && list.length === 0 && (
        <div className="ad-card ad-empty-state">
          <Icon name="check" size={28} />
          <p><strong>Sin avisos pendientes.</strong></p>
          <p className="ad-muted ad-small">Cuando un cliente toque “Llamar al mozo” o “Pedir la cuenta”, aparece acá.</p>
        </div>
      )}
      <ul className="ad-requests">
        {list?.map((r) => (
          <li key={r.id} className={`ad-request ad-request--${r.kind} is-${r.status}`}>
            <span className="ad-request__icon"><Icon name={r.kind === 'bill' ? 'receipt' : 'bell'} size={26} /></span>
            <div className="ad-request__body">
              <strong>{r.tableLabel}</strong>
              <span>{r.kind === 'bill' ? 'Pide la cuenta' : 'Llama al mozo'}</span>
              <small>{ago(r.createdAt, now)}{r.status === 'acknowledged' ? ' · en camino' : ''}</small>
            </div>
            <div className="ad-request__actions">
              {r.status === 'open' && <button type="button" className="ad-btn" onClick={() => update(r, 'acknowledged')}>Voy</button>}
              <button type="button" className="ad-btn ad-btn--primary" onClick={() => update(r, 'closed')}>Listo</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
