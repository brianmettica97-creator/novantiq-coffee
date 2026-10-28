import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin, errorText } from '../AdminContext';
import { Field, PageHeader, Toggle } from '../ui';
import type { LoyaltyMember, LoyaltyProgram, LoyaltyStats } from '../../../domain/types';
import { loyaltySchema, fieldErrors, type FieldErrors } from '../../../domain/validation';
import { themeStyle } from '../../../theme/applyTheme';
import { LoyaltySection, StampGrid, type LoyaltyState } from '../../menu/Loyalty';
import { Icon } from '../../../ui/Icon';

const PREVIEW_STATE: LoyaltyState = { card: null, status: 'idle', join: async () => null, refresh: async () => {}, enabled: false };

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

/** Lector de QR con la cámara (Chrome en Android y escritorio). */
function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!alive || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ['qr_code'] });
        const tick = async () => {
          if (!alive || !video.current) return;
          const [hit] = await detector.detect(video.current).catch(() => []);
          if (hit?.rawValue) { onCode(hit.rawValue); return; }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError('No se pudo usar la cámara. Revisá los permisos o escribí el código.');
      }
    })();
    return () => { alive = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);
  return (
    <div className="ad-scanner">
      {error ? <p className="ad-error">{error}</p> : <video ref={video} muted playsInline aria-label="Cámara para leer el código de la tarjeta" />}
      <button type="button" className="ad-btn" onClick={onClose}>Cerrar cámara</button>
    </div>
  );
}

function StampConsole({ goal, onChange }: { goal: number; onChange: () => void }) {
  const { repo, orgId, notify } = useAdmin();
  const [code, setCode] = useState('');
  const [member, setMember] = useState<LoyaltyMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [scanning, setScanning] = useState(false);

  const find = async (value = code) => {
    if (!value.trim()) return;
    setBusy(true);
    setNotFound(false);
    try {
      const m = await repo.findLoyaltyMember(orgId, value);
      setMember(m);
      setNotFound(!m);
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<LoyaltyMember>, ok: string) => {
    setBusy(true);
    try {
      setMember(await fn());
      notify(ok);
      onChange();
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ad-card ad-stamp">
      <h2>Sumar sellos</h2>
      <p className="ad-muted ad-small">El cliente muestra su tarjeta desde la carta. Escaneá el QR o escribí el código.</p>
      <form className="ad-row ad-row--wrap" onSubmit={(e) => { e.preventDefault(); find(); }}>
        <input className="ad-stamp__input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de la tarjeta"
          aria-label="Código de la tarjeta" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        <button className="ad-btn ad-btn--primary" disabled={busy || !code.trim()}>Buscar</button>
        {canScan() && (
          <button type="button" className="ad-btn" onClick={() => setScanning(true)}><Icon name="camera" size={18} /> Escanear</button>
        )}
      </form>
      {scanning && <Scanner onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setCode(c); find(c); }} />}
      {notFound && <p className="ad-error" role="status">No encontramos una tarjeta con ese código.</p>}
      {member && (
        <div className="ad-member">
          <div className="nq-menu ad-member__stamps">
            <StampGrid goal={goal} filled={Math.min(member.stamps, goal)} />
          </div>
          <div className="ad-member__info">
            <strong>{Math.min(member.stamps, goal)} de {goal} sellos</strong>
            <span className="ad-muted ad-small">
              Código {member.code.toUpperCase().match(/.{1,4}/g)?.join(' ')} · alta {new Date(member.createdAt).toLocaleDateString('es-AR')}
              {member.lastVisit ? ` · última visita ${new Date(member.lastVisit).toLocaleDateString('es-AR')}` : ''}
              {member.redeemed ? ` · ${member.redeemed} premio(s) canjeado(s)` : ''}
            </span>
            <div className="ad-row ad-row--wrap">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" className="ad-btn" disabled={busy}
                  onClick={() => act(() => repo.addLoyaltyStamps(orgId, member.id, n), n === 1 ? 'Se sumó 1 sello' : `Se sumaron ${n} sellos`)}>
                  +{n} {n === 1 ? 'sello' : 'sellos'}
                </button>
              ))}
              <button type="button" className="ad-btn ad-btn--primary" disabled={busy || member.stamps < goal}
                onClick={() => act(() => repo.redeemLoyaltyReward(orgId, member.id), 'Premio canjeado')}>
                <Icon name="gift" size={18} /> Canjear premio
              </button>
            </div>
            {member.stamps >= goal && <p className="ad-note">Esta tarjeta tiene el premio disponible.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

export function LoyaltyPage() {
  const { bundle, repo, orgId, run, canEdit } = useAdmin();
  const [program, setProgram] = useState<LoyaltyProgram>(bundle.loyalty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const enabled = bundle.settings.features.loyalty;
  const set = <K extends keyof LoyaltyProgram>(k: K, v: LoyaltyProgram[K]) => setProgram({ ...program, [k]: v });

  const loadStats = useCallback(() => { repo.getLoyaltyStats(orgId).then(setStats).catch(() => setStats(null)); }, [repo, orgId]);
  useEffect(() => { loadStats(); }, [loadStats, bundle]);

  const save = () => {
    const parsed = loyaltySchema.safeParse(program);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({});
    run(() => repo.saveLoyaltyProgram(orgId, program), 'Tarjeta guardada');
  };

  return (
    <>
      <PageHeader title="Tarjeta de fidelidad" description="Una tarjeta de sellos digital: el cliente la obtiene gratis desde la carta y vos sumás un sello en cada visita."
        actions={canEdit && enabled && <button className="ad-btn ad-btn--primary" onClick={save}>Guardar</button>} />
      {!enabled && <p className="ad-warn">La tarjeta de fidelidad no está incluida en el plan de esta cafetería. Pedí a NOVANTIQ que la active.</p>}

      {stats && (
        <section className="ad-kpis">
          <div className="ad-kpi"><strong>{stats.members}</strong><span>Clientes con tarjeta</span></div>
          <div className="ad-kpi"><strong>{stats.stampsLast30}</strong><span>Sellos entregados</span><small>últimos 30 días</small></div>
          <div className="ad-kpi"><strong>{stats.redeemedLast30}</strong><span>Premios canjeados</span><small>últimos 30 días</small></div>
          <div className={`ad-kpi ${stats.readyForReward ? 'ad-kpi--warn' : ''}`}><strong>{stats.readyForReward}</strong><span>Con premio disponible</span></div>
        </section>
      )}

      {enabled && bundle.loyalty.active && <StampConsole goal={bundle.loyalty.stampsForReward} onChange={loadStats} />}

      <div className="ad-design">
        <fieldset className="ad-form" disabled={!canEdit || !enabled}>
          <section className="ad-card">
            <h2>Configuración</h2>
            <Toggle checked={program.active} onChange={(v) => set('active', v)} label="Mostrar la tarjeta en la carta"
              hint="Al activarla aparece una sección destacada para que el cliente obtenga su tarjeta." />
            <Field label="Nombre del programa" error={errors.name}><input value={program.name} maxLength={40} onChange={(e) => set('name', e.target.value)} placeholder="Club Moka" /></Field>
            <Field label="Sellos para el premio" hint="Entre 3 y 20. Lo habitual es entre 6 y 10." error={errors.stampsForReward}>
              <input type="number" min={3} max={20} value={program.stampsForReward} onChange={(e) => set('stampsForReward', Number(e.target.value))} />
            </Field>
            <Field label="Premio" error={errors.reward}><input value={program.reward} maxLength={80} onChange={(e) => set('reward', e.target.value)} placeholder="Un café de regalo" /></Field>
            <Field label="Condiciones" hint="Opcional. Se muestran en la tarjeta del cliente." error={errors.terms}>
              <textarea rows={3} value={program.terms} maxLength={400} onChange={(e) => set('terms', e.target.value)} />
            </Field>
            <p className="ad-muted ad-small">Cambiar la cantidad de sellos afecta a las tarjetas existentes: conviene definirla antes de lanzar el programa.</p>
          </section>
        </fieldset>
        <div className="ad-design__preview">
          <p className="ad-muted ad-small">Así se ve en la carta</p>
          <div className="nq-menu ad-loyalty-preview" style={themeStyle(bundle.theme)}>
            <LoyaltySection program={program} state={PREVIEW_STATE} onOpen={() => {}} />
          </div>
        </div>
      </div>
    </>
  );
}
