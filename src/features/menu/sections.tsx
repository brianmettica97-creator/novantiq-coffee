import { useEffect, useRef, useState } from 'react';
import type { Category, MenuLanguage, Product, Promotion } from '../../domain/types';
import { describeSchedule } from '../../domain/promotions';
import { dayNames, localClock, openStatus } from '../../domain/time';
import { LANGUAGE_NAMES } from '../../domain/i18n';
import { MediaImage, useResolvedUrl } from '../../ui/MediaImage';
import { Icon, type IconName } from '../../ui/Icon';
import { ProductCard } from './ProductCard';
import type { MenuModel } from './model';
import { useI18n } from './i18n';

/* -------------------------------------------------------------- Idioma */

export function LanguageMenu({ languages, onChange, tone = 'plain' }: {
  languages: MenuLanguage[]; onChange: (l: MenuLanguage) => void; tone?: 'plain' | 'glass';
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (languages.length < 2) return null;
  return (
    <div className={`nq-lang nq-lang--${tone}`} ref={ref}>
      <button type="button" className="nq-lang__btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox"
        aria-label={`${t('nav.language')}: ${LANGUAGE_NAMES[lang]}`}>
        <Icon name="globe" size={17} /> <span>{lang.toUpperCase()}</span>
      </button>
      {open && (
        <ul className="nq-lang__list" role="listbox" aria-label={t('lang.title')}>
          {languages.map((l) => (
            <li key={l}>
              <button type="button" role="option" aria-selected={l === lang} lang={l}
                onClick={() => { onChange(l); setOpen(false); }}>
                {LANGUAGE_NAMES[l]} {l === lang && <Icon name="check" size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Portada */

export function Cover({ model, onEnter, onCard, languages, onLanguage }: {
  model: MenuModel; onEnter: () => void; onCard?: () => void;
  languages: MenuLanguage[]; onLanguage: (l: MenuLanguage) => void;
}) {
  const { t, lang } = useI18n();
  const { settings, organization } = model.menu;
  const cover = settings.coverImageAssetId ? model.assets.get(settings.coverImageAssetId) : null;
  const video = settings.coverVideoAssetId ? model.assets.get(settings.coverVideoAssetId) : null;
  const logo = settings.logoAssetId ? model.assets.get(settings.logoAssetId) : null;
  const status = openStatus(settings.hours, model.now, settings.timeZone, lang);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = useResolvedUrl(video?.url);

  // El video de portada solo se carga si el dispositivo lo permite: sin
  // "ahorro de datos", sin movimiento reducido y con conexión decente.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoUrl) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const slow = conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (slow || reduced) return;
    const timer = setTimeout(() => {
      el.src = videoUrl;
      // play() no devuelve promesa en algunos navegadores antiguos.
      Promise.resolve(el.play()).catch(() => { /* autoplay bloqueado: queda la foto */ });
    }, 600);
    return () => clearTimeout(timer);
  }, [videoUrl]);

  return (
    <header className={`nq-cover nq-cover--${model.menu.theme.coverLayout}`}>
      <div className="nq-cover__media">
        <MediaImage asset={cover} eager sizes="100vw" alt="" />
        {video && (
          <video
            ref={videoRef} className="nq-cover__video" muted playsInline loop preload="none" aria-hidden="true"
            onPlaying={(e) => e.currentTarget.classList.add('is-playing')}
          />
        )}
      </div>
      <div className="nq-cover__content">
        <div className="nq-cover__top">
          {logo ? <span className="nq-cover__logo"><MediaImage asset={logo} eager sizes="64px" /></span> : <span />}
          <div className="nq-cover__chips">
            {status && (
              <span className={`nq-status ${status.open ? 'is-open' : ''}`}><span aria-hidden="true" />{status.label}</span>
            )}
            <LanguageMenu languages={languages} onChange={onLanguage} tone="glass" />
          </div>
        </div>
        <div className="nq-cover__text">
          <p className="nq-eyebrow">{settings.city || t('cover.fallback')}</p>
          <h1 className="nq-cover__title">{organization.name}</h1>
          {settings.tagline && <p className="nq-cover__tagline">{settings.tagline}</p>}
          <div className="nq-cover__actions">
            <button type="button" className="nq-cta" onClick={onEnter}>{t('cover.enter')} <Icon name="arrowRight" size={18} /></button>
            {onCard && (
              <button type="button" className="nq-cta nq-cta--ghost" onClick={onCard}><Icon name="card" size={18} /> {t('cover.card')}</button>
            )}
          </div>
        </div>
        <button type="button" className="nq-cover__cue" onClick={onEnter} aria-hidden="true" tabIndex={-1}>
          <Icon name="chevronDown" size={22} />
        </button>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------- Promociones */

export function Promotions({ model, onOpenProduct, onPromoClick }: {
  model: MenuModel; onOpenProduct: (p: Product) => void; onPromoClick: (p: Promotion) => void;
}) {
  const { t, lang } = useI18n();
  const promos = model.activePromotions;
  if (!promos.length) return null;
  const style = model.menu.theme.promoStyle;
  return (
    <section className={`nq-promos nq-promos--${style}`} aria-label={t('promo.section')}>
      {promos.map((p) => {
        const image = p.imageAssetId ? model.assets.get(p.imageAssetId) : null;
        const video = p.videoAssetId ? model.assets.get(p.videoAssetId) : null;
        const target = p.productIds.map((id) => model.products.get(id)).find(Boolean);
        const posterAsset = image ?? (video ? { ...video, url: video.posterUrl ?? '', variants: [], kind: 'image' as const } : null);
        const schedule = describeSchedule(p, lang);
        return (
          <article key={p.id} className="nq-promo">
            <div className="nq-promo__media"><MediaImage asset={posterAsset} sizes="(min-width: 900px) 360px, 40vw" alt="" /></div>
            <div className="nq-promo__body">
              <p className="nq-eyebrow">{p.kind === 'percent_off' ? `−${p.percentOff}%` : t('promo.label')}</p>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              {schedule && <p className="nq-promo__when"><Icon name="clock" size={14} /> {schedule}</p>}
              {target && (
                <button type="button" className="nq-link" onClick={() => { onPromoClick(p); onOpenProduct(target); }}>
                  {p.productIds.length > 1 ? t('promo.seeMany') : t('promo.see', { name: target.name })} <Icon name="next" size={14} />
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

/* ----------------------------------------------------------- Destacados */

export function Featured({ model, onOpen }: { model: MenuModel; onOpen: (p: Product) => void }) {
  const { t } = useI18n();
  if (model.featured.length < 2) return null;
  return (
    <section className="nq-featured" aria-labelledby="nq-featured-title">
      <div className="nq-section-head">
        <p className="nq-kicker"><Icon name="sparkle" size={14} /></p>
        <h2 id="nq-featured-title" className="nq-section-title">{t('featured.title')}</h2>
      </div>
      <div className="nq-rail">
        {model.featured.map((p) => <ProductCard key={p.id} product={p} model={model} variant="slide" onOpen={onOpen} />)}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- Categorías */

export function CategorySection({ category, products, model, index, onOpen }: {
  category: Category; products: Product[]; model: MenuModel; index: number; onOpen: (p: Product) => void;
}) {
  const image = category.imageAssetId ? model.assets.get(category.imageAssetId) : null;
  const layout = category.layout;
  const [first, ...rest] = products;
  return (
    <section className={`nq-category nq-category--${layout}`} id={`cat-${category.slug}`} data-category={category.id} aria-labelledby={`h-${category.id}`}>
      <div className={`nq-section-head ${image ? 'has-image' : ''}`}>
        {image && <div className="nq-section-head__img"><MediaImage asset={image} sizes="(min-width: 900px) 900px, 100vw" alt="" /></div>}
        <div className="nq-section-head__text">
          <span className="nq-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <h2 id={`h-${category.id}`} className="nq-section-title">{category.name}</h2>
          {category.description && <p className="nq-section-desc">{category.description}</p>}
        </div>
      </div>
      {layout === 'feature' && (
        <>
          <ProductCard product={first} model={model} variant="hero" onOpen={onOpen} />
          {rest.length > 0 && <div className="nq-grid">{rest.map((p) => <ProductCard key={p.id} product={p} model={model} variant="tile" onOpen={onOpen} />)}</div>}
        </>
      )}
      {layout === 'grid' && <div className="nq-grid">{products.map((p) => <ProductCard key={p.id} product={p} model={model} variant="tile" onOpen={onOpen} />)}</div>}
      {layout === 'list' && <div className="nq-list">{products.map((p) => <ProductCard key={p.id} product={p} model={model} variant="row" onOpen={onOpen} />)}</div>}
      {layout === 'carousel' && <div className="nq-rail">{products.map((p) => <ProductCard key={p.id} product={p} model={model} variant="slide" onOpen={onOpen} />)}</div>}
    </section>
  );
}

/* --------------------------------------------------------------- Footer */

/** Enlaces de contacto a partir de los datos del local. */
export function contactLinks(model: MenuModel) {
  const s = model.menu.settings;
  const digits = (v: string) => v.replace(/[^\d]/g, '');
  const place = [model.menu.organization.name, s.address, s.city].filter(Boolean).join(', ');
  const links: { key: string; icon: IconName; href: string; label: 'footer.whatsapp' | 'footer.instagram' | 'footer.directions' | 'footer.call' | 'footer.web' }[] = [];
  if (s.whatsapp && digits(s.whatsapp).length >= 8) links.push({ key: 'wa', icon: 'whatsapp', href: `https://wa.me/${digits(s.whatsapp)}`, label: 'footer.whatsapp' });
  if (s.instagram) links.push({ key: 'ig', icon: 'instagram', href: `https://instagram.com/${s.instagram.replace('@', '')}`, label: 'footer.instagram' });
  if (s.mapsUrl || s.address) {
    links.push({
      key: 'map', icon: 'directions', label: 'footer.directions',
      href: s.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`,
    });
  }
  if (s.phone) links.push({ key: 'tel', icon: 'phone', href: `tel:${s.phone.replace(/[^\d+]/g, '')}`, label: 'footer.call' });
  if (s.website) links.push({ key: 'web', icon: 'globe', href: s.website, label: 'footer.web' });
  return links;
}

export function MenuFooter({ model }: { model: MenuModel }) {
  const { t, lang } = useI18n();
  const s = model.menu.settings;
  const days = [1, 2, 3, 4, 5, 6, 0];
  const names = dayNames(lang);
  const today = localClock(model.now, s.timeZone).day;
  const links = contactLinks(model);
  return (
    <footer className="nq-footer">
      <div className="nq-footer__inner">
        <h2 className="nq-footer__name">{model.menu.organization.name}</h2>
        {s.intro && <p className="nq-footer__intro">{s.intro}</p>}

        {links.length > 0 && (
          <ul className="nq-actions" aria-label={t('footer.contact')}>
            {links.map((l) => (
              <li key={l.key}>
                <a href={l.href} target={l.key === 'tel' ? undefined : '_blank'} rel="noopener noreferrer" className={`nq-action nq-action--${l.key}`}>
                  <span className="nq-action__icon"><Icon name={l.icon} size={20} /></span>
                  {t(l.label)}
                </a>
              </li>
            ))}
          </ul>
        )}

        {s.reviewUrl && (
          <a className="nq-review" href={s.reviewUrl} target="_blank" rel="noopener noreferrer">
            <span className="nq-review__stars" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <Icon key={i} name="star" size={18} />)}</span>
            <span className="nq-review__text">
              <strong>{t('footer.review')}</strong>
              <small>{t('footer.reviewLead')}</small>
            </span>
            <Icon name="arrowRight" size={20} />
          </a>
        )}

        <div className="nq-footer__grid">
          {(s.address || s.city) && (
            <div>
              <h3><Icon name="pin" size={16} /> {t('footer.address')}</h3>
              <p>{[s.address, s.city].filter(Boolean).join(', ')}</p>
            </div>
          )}
          {s.hours.length > 0 && (
            <div>
              <h3><Icon name="clock" size={16} /> {t('footer.hours')}</h3>
              <table className="nq-hours">
                <tbody>
                  {days.map((d) => {
                    const h = s.hours.find((x) => x.day === d);
                    return (
                      <tr key={d} className={d === today ? 'is-today' : ''}>
                        <th scope="row">{names[d]}</th>
                        <td>{h?.opens ? `${h.opens} – ${h.closes}` : t('footer.closed')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {model.menu.organization.isDemo && <p className="nq-demo-note">{t('footer.demo')}</p>}
        <p className="nq-powered">{t('footer.powered')} <strong>NOVANTIQ COFFEE</strong></p>
      </div>
    </footer>
  );
}
