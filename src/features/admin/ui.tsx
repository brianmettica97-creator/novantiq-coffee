import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MediaAsset, MediaKind } from '../../domain/types';
import { formatPrice, parsePriceInput } from '../../domain/format';
import { MediaImage, useResolvedUrl } from '../../ui/MediaImage';
import { useAdmin, errorText } from './AdminContext';
import { prepareImage, prepareVideo } from './media/processUpload';
import { UPLOAD_RULES } from '../../domain/validation';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  useEffect(() => { document.title = `${title} · Panel NOVANTIQ COFFEE`; }, [title]);
  return (
    <div className="ad-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ad-head__actions">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className = '' }: {
  label: string; hint?: string; error?: string; children: ReactNode; className?: string;
}) {
  return (
    <label className={`ad-field ${error ? 'has-error' : ''} ${className}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="ad-error" role="alert">{error}</small>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean;
}) {
  return (
    <label className="ad-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="ad-toggle__track" aria-hidden="true" />
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
    </label>
  );
}

/** Entrada de precio en formato local ("4.600" o "4600,50"); guarda centavos. */
export function PriceInput({ value, onChange, id, allowNegative }: { value: number; onChange: (cents: number) => void; id?: string; allowNegative?: boolean }) {
  const [text, setText] = useState(() => (value / 100).toLocaleString('es-AR'));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText((value / 100).toLocaleString('es-AR')); }, [value]);
  return (
    <div className={`ad-price ${invalid ? 'has-error' : ''}`}>
      <span aria-hidden="true">$</span>
      <input
        id={id} inputMode="decimal" value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const neg = allowNegative && text.trim().startsWith('-');
          const cents = parsePriceInput(text.replace('-', ''));
          if (cents === null) { setInvalid(true); return; }
          setInvalid(false);
          onChange(neg ? -cents : cents);
        }}
        aria-invalid={invalid}
      />
    </div>
  );
}

export function TagInput({ value, onChange, placeholder, suggestions = [] }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const add = (t: string) => {
    const clean = t.trim();
    if (clean && !value.includes(clean)) onChange([...value, clean]);
    setDraft('');
  };
  const rest = suggestions.filter((s) => !value.includes(s));
  return (
    <div className="ad-tags">
      <div className="ad-tags__list">
        {value.map((t) => (
          <span key={t} className="ad-tag">{t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Quitar ${t}`}>×</button></span>
        ))}
        <input
          value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } }}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {rest.length > 0 && (
        <div className="ad-tags__suggest">
          {rest.map((s) => <button type="button" key={s} onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  );
}

export function ConfirmButton({ onConfirm, children, question, className = 'ad-btn ad-btn--danger', disabled }: {
  onConfirm: () => void; children: ReactNode; question: string; className?: string; disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <span className="ad-confirm" role="group" aria-label={question}>
        <span>{question}</span>
        <button type="button" className="ad-btn ad-btn--danger" onClick={() => { setAsking(false); onConfirm(); }}>Sí</button>
        <button type="button" className="ad-btn" onClick={() => setAsking(false)}>No</button>
      </span>
    );
  }
  return <button type="button" className={className} onClick={() => setAsking(true)} disabled={disabled}>{children}</button>;
}

/* ------------------------------------------------------ Multimedia */

export function MediaThumb({ asset, size = 72 }: { asset: MediaAsset | null | undefined; size?: number }) {
  const poster = useResolvedUrl(asset?.posterUrl ?? null);
  if (!asset) return <div className="ad-thumb ad-thumb--empty" style={{ width: size, height: size }} />;
  if (asset.kind === 'image') return <div className="ad-thumb" style={{ width: size, height: size }}><MediaImage asset={asset} sizes={`${size}px`} /></div>;
  return (
    <div className="ad-thumb" style={{ width: size, height: size, backgroundImage: poster ? `url(${poster})` : undefined }}>
      <span className="ad-thumb__kind">{{ video: 'Video', image: '' }[asset.kind]}</span>
    </div>
  );
}

const KIND_LABEL: Record<MediaKind, string> = { image: 'imagen', video: 'video' };

/** Sube un archivo del tipo indicado procesándolo en el navegador. */
export function UploadButton({ kind, onUploaded, label, replaceId }: {
  kind: MediaKind; onUploaded?: (a: MediaAsset) => void; label?: string; replaceId?: string;
}) {
  const { repo, orgId, notify, reload } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const accept = {
    image: UPLOAD_RULES.image.types.join(','), video: UPLOAD_RULES.video.types.join(','),
  }[kind];

  const handle = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const prepared = kind === 'image' ? await prepareImage(files[0]) : await prepareVideo(files[0]);
      const asset = replaceId ? await repo.replaceMedia(orgId, replaceId, prepared) : await repo.uploadMedia(orgId, prepared);
      await reload();
      notify(replaceId ? 'Archivo reemplazado' : `Se subió la ${KIND_LABEL[kind]}`);
      onUploaded?.(asset);
    } catch (e) {
      notify(errorText(e), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <button type="button" className="ad-btn" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Procesando…' : label ?? `Subir ${KIND_LABEL[kind]}`}
      </button>
      <input
        ref={input} type="file" hidden accept={accept}
        onChange={(e) => handle([...(e.target.files ?? [])])}
      />
    </>
  );
}

/** Selector de un archivo de la biblioteca filtrado por tipo, con subida directa. */
export function MediaPicker({ kind, value, onChange, label }: {
  kind: MediaKind; value: string | null; onChange: (id: string | null) => void; label: string;
}) {
  const { bundle } = useAdmin();
  const [open, setOpen] = useState(false);
  const options = bundle.media.filter((m) => m.kind === kind);
  const current = options.find((m) => m.id === value) ?? null;
  return (
    <div className="ad-picker">
      <MediaThumb asset={current} />
      <div className="ad-picker__body">
        <strong>{label}</strong>
        <small>{current ? current.title : 'Sin asignar'}</small>
        <div className="ad-row">
          <button type="button" className="ad-btn ad-btn--sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Cerrar biblioteca' : 'Elegir de la biblioteca'}
          </button>
          <UploadButton kind={kind} label="Subir nuevo" onUploaded={(a) => { onChange(a.id); setOpen(false); }} />
          {current && <button type="button" className="ad-link" onClick={() => onChange(null)}>Quitar</button>}
        </div>
        {open && (
          <div className="ad-picker__grid">
            {options.length === 0 && <p className="ad-muted">No hay archivos de este tipo todavía.</p>}
            {options.map((m) => (
              <button type="button" key={m.id} className={m.id === value ? 'is-selected' : ''} onClick={() => { onChange(m.id); setOpen(false); }} title={m.title}>
                <MediaThumb asset={m} size={84} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function money(cents: number) {
  return formatPrice(cents);
}
