import { useState } from 'react';
import { useAdmin } from '../AdminContext';
import { ConfirmButton, Field, PageHeader } from '../ui';
import { QrImage, qrPngDataUrl, qrSvg } from '../../../ui/QrCanvas';
import { publicOrigin } from '../../../config/env';
import type { QrCode } from '../../../domain/types';

function download(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

export function QrPage() {
  const { bundle, repo, orgId, run, canEdit } = useAdmin();
  const { origin, reachableFromPhone } = publicOrigin();
  const [label, setLabel] = useState('');
  const [table, setTable] = useState('');
  const base = `${origin}/m/${bundle.organization.slug}`;
  const urlFor = (qr: QrCode) => `${base}?qr=${qr.token}`;
  const style = { dark: bundle.theme.colors.ink, light: '#FFFFFF' };
  const active = bundle.qrCodes.filter((q) => !q.revokedAt);
  const revoked = bundle.qrCodes.filter((q) => q.revokedAt);

  const printCard = async (qr: QrCode) => {
    const svg = await qrSvg(urlFor(qr), style);
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    const name = bundle.organization.name.replace(/[<>&]/g, '');
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR ${name}</title>
      <style>body{margin:0;font-family:Georgia,serif;display:grid;place-items:center;min-height:100vh;background:#fff;color:${style.dark}}
      .card{width:9cm;padding:1cm;border:1px solid #ddd;border-radius:12px;text-align:center}
      h1{font-size:22pt;font-weight:400;margin:0 0 .2cm} p{font-family:system-ui,sans-serif;font-size:10pt;margin:.2cm 0}
      svg{width:6.5cm;height:6.5cm} @page{margin:1cm}</style></head><body><div class="card">
      <h1>${name}</h1><p>Escaneá para ver la carta</p>${svg}<p>${qr.tableLabel ? `Mesa ${qr.tableLabel.replace(/[<>&]/g, '')}` : ''}</p>
      <p style="font-size:8pt;opacity:.6">Sin descargar nada · ${base.replace(/^https?:\/\//, '')}</p></div>
      <script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <PageHeader title="Código QR" description="El QR abre la carta web en vivo (no un PDF): precios, fotos y disponibilidad se actualizan solos." />
      {!reachableFromPhone && (
        <p className="ad-warn">Estás usando la app en localhost: un celular no podrá abrir este QR. Definí VITE_PUBLIC_BASE_URL con tu dominio o la IP de tu red.</p>
      )}
      <section className="ad-card">
        <h2>Dirección pública de la carta</h2>
        <p className="ad-url"><code>{base}</code> <a className="ad-btn ad-btn--sm" href={base} target="_blank" rel="noreferrer">Abrir ↗</a></p>
        <p className="ad-muted ad-small">La URL usa el nombre corto de la cafetería, nunca identificadores internos. Cada QR agrega un código aleatorio para medir escaneos.</p>
      </section>

      <div className="ad-qr-grid">
        {active.map((qr) => (
          <section key={qr.id} className="ad-card ad-qr">
            <QrImage text={urlFor(qr)} size={200} style={style} label={`QR ${qr.label}`} />
            <div>
              <h2>{qr.label}</h2>
              {qr.tableLabel && <p>Mesa {qr.tableLabel} <small className="ad-muted">(se usará cuando se activen los pedidos)</small></p>}
              <p className="ad-small ad-muted ad-break">{urlFor(qr)}</p>
              <div className="ad-row ad-row--wrap">
                <button className="ad-btn ad-btn--sm" onClick={async () => download(`qr-${bundle.organization.slug}-${qr.token}.png`, await qrPngDataUrl(urlFor(qr), 1200, style))}>PNG</button>
                <button className="ad-btn ad-btn--sm" onClick={async () => download(`qr-${bundle.organization.slug}-${qr.token}.svg`, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await qrSvg(urlFor(qr), style))}`)}>SVG</button>
                <button className="ad-btn ad-btn--sm" onClick={() => printCard(qr)}>Imprimir tarjeta</button>
                {canEdit && (
                  <ConfirmButton className="ad-btn ad-btn--sm" question="¿Regenerar? El QR impreso seguirá abriendo la carta, pero sin asociarse a esta mesa ni contarse en estadísticas."
                    onConfirm={() => run(async () => { await repo.revokeQrCode(orgId, qr.id); await repo.createQrCode(orgId, { label: qr.label, tableLabel: qr.tableLabel }); }, 'QR regenerado')}>
                    Regenerar
                  </ConfirmButton>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      {canEdit && (
        <section className="ad-card">
          <h2>Nuevo QR</h2>
          <div className="ad-grid2">
            <Field label="Nombre" hint="Ej.: Mostrador, Vidriera, Mesa 4"><input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
            <Field label="Mesa (opcional)" hint="Queda asociada para el futuro módulo de pedidos."><input value={table} onChange={(e) => setTable(e.target.value)} /></Field>
          </div>
          <button className="ad-btn ad-btn--primary" disabled={!label.trim()} onClick={() => run(() => repo.createQrCode(orgId, { label, tableLabel: table || null }), 'QR creado').then(() => { setLabel(''); setTable(''); })}>Generar QR</button>
        </section>
      )}
      {revoked.length > 0 && (
        <details className="ad-card"><summary>{revoked.length} QR revocados</summary>
          <ul>{revoked.map((q) => <li key={q.id}>{q.label} · {q.token} · revocado el {new Date(q.revokedAt!).toLocaleDateString('es-AR')}</li>)}</ul>
        </details>
      )}
    </>
  );
}
