import { useEffect, useRef, useState } from 'react';
import type { MediaAsset } from '../../../domain/types';
import { useResolvedUrl } from '../../../ui/MediaImage';
import { Icon } from '../../../ui/Icon';
import { useI18n } from '../i18n';

/**
 * Video bajo demanda: no descarga nada hasta que el cliente pulsa reproducir.
 * Arranca sin sonido; los controles nativos permiten activarlo explícitamente.
 */
export function VideoPlayer({ asset, onPlay }: { asset: MediaAsset; onPlay?: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const src = useResolvedUrl(state === 'idle' ? null : asset.url);
  const poster = useResolvedUrl(asset.posterUrl);

  const start = () => {
    setState('loading');
    onPlay?.();
  };

  // Reproduce recién cuando la URL está asignada: con preload="none", llamar a
  // play() antes de tener src no inicia la descarga.
  useEffect(() => {
    const el = ref.current;
    if (state !== 'loading' || !src || !el) return;
    // play() no devuelve promesa en algunos navegadores antiguos.
    Promise.resolve(el.play()).catch(() => setState('playing'));
  }, [state, src]);

  return (
    <div className="nq-video">
      {state !== 'idle' && state !== 'error' && (
        <video
          ref={ref}
          src={src ?? undefined}
          poster={poster ?? undefined}
          muted
          playsInline
          loop
          controls={state === 'playing'}
          preload="none"
          onPlaying={() => setState('playing')}
          onError={() => setState('error')}
          aria-label={asset.title}
        />
      )}
      {(state === 'idle' || state === 'loading' || state === 'error') && (
        <div className="nq-video__poster" style={poster ? { backgroundImage: `url(${poster})` } : undefined}>
          {state === 'error' ? (
            <p className="nq-media-note" role="status">{t('media.videoError')}</p>
          ) : (
            <button type="button" className="nq-play" onClick={start} aria-label={t('media.play', { name: asset.title })} disabled={state === 'loading'}>
              {state === 'loading' ? <span className="nq-spinner" aria-hidden="true" /> : <Icon name="play" size={28} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
