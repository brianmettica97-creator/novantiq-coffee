import { useState } from 'react';
import { useAdmin } from '../AdminContext';
import { ConfirmButton, Field, MediaThumb, PageHeader, UploadButton } from '../ui';
import type { MediaAsset, MediaKind } from '../../../domain/types';
import { formatBytes } from '../../../domain/format';
import { mediaUsage } from '../../../domain/usage';
import { UPLOAD_RULES } from '../../../domain/validation';

const KINDS: { kind: MediaKind; label: string }[] = [
  { kind: 'image', label: 'Imágenes' }, { kind: 'video', label: 'Videos' },
];

function AssetEditor({ asset }: { asset: MediaAsset }) {
  const { repo, orgId, run, bundle, canEdit } = useAdmin();
  const [title, setTitle] = useState(asset.title);
  const [alt, setAlt] = useState(asset.alt);
  const [focalY, setFocalY] = useState(asset.focalY);
  const usage = mediaUsage(bundle, asset.id);
  const format = asset.mimeType.split('/')[1]?.toUpperCase() ?? asset.mimeType;
  return (
    <li className="ad-asset">
      <MediaThumb asset={asset} size={112} />
      <div className="ad-asset__body">
        <div className="ad-grid2">
          <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} /></Field>
          <Field label="Texto alternativo" hint="Describe la imagen para lectores de pantalla.">
            <input value={alt} onChange={(e) => setAlt(e.target.value)} disabled={!canEdit} />
          </Field>
        </div>
        {asset.kind === 'image' && (
          <Field label={`Punto focal vertical (${focalY}%)`} hint="Ajusta qué parte de la foto se conserva en recortes.">
            <input type="range" min={0} max={100} value={focalY} onChange={(e) => setFocalY(Number(e.target.value))} disabled={!canEdit} />
          </Field>
        )}
        <p className="ad-small ad-muted">
          {format}{asset.width ? ` · ${asset.width}×${asset.height}` : ''}{asset.bytes ? ` · ${formatBytes(asset.bytes)}` : ''} · {asset.credit}
        </p>
        <p className="ad-small">{usage.length ? <>En uso: {usage.join(', ')}</> : <span className="ad-muted">Sin uso</span>}</p>
        {canEdit && (
          <div className="ad-row ad-row--wrap">
            <button type="button" className="ad-btn ad-btn--sm" disabled={title === asset.title && alt === asset.alt && focalY === asset.focalY}
              onClick={() => run(() => repo.updateMedia(orgId, { id: asset.id, title, alt, focalX: asset.focalX, focalY }), 'Datos actualizados')}>
              Guardar datos
            </button>
            <UploadButton kind={asset.kind} replaceId={asset.id} label="Reemplazar archivo" />
            <ConfirmButton className="ad-btn ad-btn--sm ad-btn--danger" question="¿Eliminar definitivamente?" disabled={usage.length > 0}
              onConfirm={() => run(() => repo.deleteMedia(orgId, asset.id), 'Archivo eliminado')}>
              {usage.length ? 'En uso: no se puede eliminar' : 'Eliminar'}
            </ConfirmButton>
          </div>
        )}
      </div>
    </li>
  );
}

export function MediaPage() {
  const { bundle, canEdit } = useAdmin();
  const [kind, setKind] = useState<MediaKind>('image');
  const list = bundle.media.filter((m) => m.kind === kind);
  const total = bundle.media.reduce((s, m) => s + m.bytes, 0);
  const hint = {
    image: UPLOAD_RULES.image.label + '. Se generan versiones WebP de 480, 960 y 1600 px.',
    video: UPLOAD_RULES.video.label + ', hasta 60 s. Se reproducen solo cuando el cliente los abre.',
  }[kind];
  return (
    <>
      <PageHeader title="Multimedia" description={`${bundle.media.length} archivos · ${formatBytes(total)} registrados. Los archivos en uso no pueden eliminarse.`} />
      <div className="ad-tabs" role="tablist">
        {KINDS.map((k) => (
          <button key={k.kind} role="tab" aria-selected={kind === k.kind} className={kind === k.kind ? 'is-active' : ''} onClick={() => setKind(k.kind)}>
            {k.label} <small>{bundle.media.filter((m) => m.kind === k.kind).length}</small>
          </button>
        ))}
      </div>
      <section className="ad-card">
        <div className="ad-row ad-row--between">
          <p className="ad-muted ad-small">{hint}</p>
          {canEdit && <UploadButton kind={kind} />}
        </div>
        <ul className="ad-assets">
          {list.length === 0 && <li className="ad-empty">No hay archivos de este tipo.</li>}
          {list.map((a) => <AssetEditor key={a.id + a.url} asset={a} />)}
        </ul>
      </section>
    </>
  );
}
