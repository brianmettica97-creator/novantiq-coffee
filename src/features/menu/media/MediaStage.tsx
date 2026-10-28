import { useRef, useState } from 'react';
import type { DisplayMode, MediaAsset } from '../../../domain/types';
import type { MediaModeOption, ResolvedMedia } from '../../../domain/menu';
import { MediaImage } from '../../../ui/MediaImage';
import { Icon } from '../../../ui/Icon';
import { VideoPlayer } from './VideoPlayer';
import { useI18n, type StringKey } from '../i18n';

const MODE_LABEL: Record<DisplayMode, StringKey> = { photo: 'media.photo', gallery: 'media.photos', video: 'media.video' };

function Gallery({ images, name }: { images: MediaAsset[]; name: string }) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  return (
    <div className="nq-gallery" aria-roledescription="carrusel" aria-label={t('media.gallery', { name })}>
      <div
        className="nq-gallery__track"
        ref={track}
        onScroll={(e) => setCurrent(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {images.map((img, i) => (
          <div className="nq-gallery__slide" key={img.id} aria-roledescription="diapositiva" aria-label={t('media.slide', { i: i + 1, n: images.length })}>
            <MediaImage asset={img} sizes="(min-width: 900px) 560px, 100vw" eager={i === 0} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button type="button" className="nq-icon-btn nq-gallery__prev" onClick={() => go(current - 1)} disabled={current === 0} aria-label={t('media.prev')}>
            <Icon name="back" />
          </button>
          <button type="button" className="nq-icon-btn nq-gallery__next" onClick={() => go(current + 1)} disabled={current === images.length - 1} aria-label={t('media.next')}>
            <Icon name="next" />
          </button>
          <div className="nq-gallery__dots" aria-hidden="true">
            {images.map((img, i) => <span key={img.id} className={i === current ? 'is-active' : ''} />)}
          </div>
        </>
      )}
    </div>
  );
}

interface Props {
  name: string;
  media: ResolvedMedia;
  modes: MediaModeOption[];
  onEvent: (type: 'media_play') => void;
}

export function MediaStage({ name, media, modes, onEvent }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DisplayMode | null>(modes[0]?.mode ?? null);
  const images = [media.primary, ...media.gallery.filter((g) => g.id !== media.primary?.id)].filter((x): x is MediaAsset => !!x);

  if (!modes.length) {
    return <div className="nq-stage"><MediaImage asset={null} fallbackLabel={name} /></div>;
  }

  return (
    <div className="nq-stage">
      <div className="nq-stage__view">
        {(mode === 'photo' || mode === 'gallery') && <Gallery images={images} name={name} />}
        {mode === 'video' && media.video && <VideoPlayer asset={media.video} onPlay={() => onEvent('media_play')} />}
      </div>
      {modes.length > 1 && (
        <div className="nq-stage__modes" role="tablist" aria-label={t('media.modes')}>
          {modes.map((m) => (
            <button
              key={m.mode} type="button" role="tab" aria-selected={mode === m.mode}
              className={mode === m.mode ? 'is-active' : ''} onClick={() => setMode(m.mode)}
            >
              {m.mode === 'video' && <Icon name="play" size={14} />}
              {t(MODE_LABEL[m.mode])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
