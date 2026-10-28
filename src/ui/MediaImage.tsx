import { useEffect, useState } from 'react';
import type { MediaAsset } from '../domain/types';
import { resolveMediaUrl } from '../data';

interface Props {
  asset: MediaAsset | null | undefined;
  /** Atributo sizes del srcset, p. ej. "(min-width: 900px) 33vw, 50vw". */
  sizes?: string;
  className?: string;
  eager?: boolean;
  alt?: string;
  /** Texto para la reserva cuando no hay imagen o falla la carga. */
  fallbackLabel?: string;
}

/** Resuelve una URL que puede estar en IndexedDB ("idb:"). */
export function useResolvedUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(url && !url.startsWith('idb:') ? url : null);
  useEffect(() => {
    let alive = true;
    if (!url) { setResolved(null); return; }
    if (!url.startsWith('idb:')) { setResolved(url); return; }
    resolveMediaUrl(url).then((u) => alive && setResolved(u));
    return () => { alive = false; };
  }, [url]);
  return resolved;
}

function useSrcSet(asset: MediaAsset | null | undefined) {
  const [srcSet, setSrcSet] = useState<string | undefined>();
  const variants = asset?.variants ?? [];
  const key = variants.map((v) => v.url).join('|');
  useEffect(() => {
    let alive = true;
    if (!variants.length) { setSrcSet(undefined); return; }
    Promise.all(variants.map(async (v) => `${await resolveMediaUrl(v.url)} ${v.width}w`))
      .then((parts) => alive && setSrcSet(parts.join(', ')));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return srcSet;
}

/**
 * Imagen adaptable: srcset por ancho, placeholder difuso mientras carga,
 * carga diferida, punto focal para recortes y reserva si falla.
 */
export function MediaImage({ asset, sizes = '100vw', className = '', eager, alt, fallbackLabel }: Props) {
  const src = useResolvedUrl(asset?.url);
  const srcSet = useSrcSet(asset);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setLoaded(false); setFailed(false); }, [asset?.url]);

  if (!asset || failed) {
    return (
      <div className={`nq-img nq-img--fallback ${className}`} role={fallbackLabel ? 'img' : undefined} aria-label={fallbackLabel}>
        <span aria-hidden="true">{fallbackLabel?.charAt(0) ?? '☕'}</span>
      </div>
    );
  }
  return (
    <div
      className={`nq-img ${loaded ? 'is-loaded' : ''} ${className}`}
      style={asset.placeholder ? { backgroundImage: `url(${asset.placeholder})` } : undefined}
    >
      {src && (
        <img
          src={src}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          alt={alt ?? asset.alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'auto'}
          style={{ objectPosition: `${asset.focalX}% ${asset.focalY}%` }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          draggable={false}
        />
      )}
    </div>
  );
}
