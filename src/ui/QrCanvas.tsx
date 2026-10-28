import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface QrStyle {
  dark: string;
  light: string;
}

/** Genera el QR como SVG (nítido al imprimir) con corrección de errores alta. */
export async function qrSvg(text: string, style: QrStyle = { dark: '#1E1611', light: '#FFFFFF' }) {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'H', margin: 2, color: style });
}

export async function qrPngDataUrl(text: string, size: number, style: QrStyle = { dark: '#1E1611', light: '#FFFFFF' }) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'H', margin: 2, width: size, color: style });
}

export function QrImage({ text, size = 220, style, label }: { text: string; size?: number; style?: QrStyle; label: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    qrSvg(text, style).then((s) => alive && setSvg(s));
    return () => { alive = false; };
  }, [text, style]);
  return (
    <div
      className="nq-qr" role="img" aria-label={label} style={{ width: size, height: size }}
      // SVG generado localmente por la librería qrcode a partir de una URL propia.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
