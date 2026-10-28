import type { Product } from '../../domain/types';
import { fromPrice, resolveProductMedia } from '../../domain/menu';
import { computePrice } from '../../domain/pricing';
import { MediaImage } from '../../ui/MediaImage';
import { Icon } from '../../ui/Icon';
import type { MenuModel } from './model';
import { useI18n } from './i18n';

export function BadgeList({ product, model, max = 2 }: { product: Product; model: MenuModel; max?: number }) {
  const { t } = useI18n();
  const promo = model.discountFor(product.id);
  const items = product.badges.map((k) => model.badges.get(k)).filter(Boolean).slice(0, max);
  if (!items.length && !promo && product.available) return null;
  return (
    <ul className="nq-badges" aria-label={t('badges.label')}>
      {!product.available && <li className="nq-badge nq-badge--muted">{t('badge.soldout')}</li>}
      {promo && <li className="nq-badge nq-badge--accent">{t('badge.now', { n: promo.percentOff ?? 0 })}</li>}
      {items.map((b) => <li key={b!.key} className={`nq-badge nq-badge--${b!.tone}`}>{b!.label}</li>)}
    </ul>
  );
}

/** Indica que el producto tiene video. */
function MediaHints({ product }: { product: Product }) {
  const { t } = useI18n();
  if (!product.media.some((m) => m.role === 'video')) return null;
  return (
    <span className="nq-hints">
      <span className="nq-hint"><Icon name="play" size={12} />{t('hint.video')}</span>
    </span>
  );
}

export function PriceTag({ product, model }: { product: Product; model: MenuModel }) {
  const { t } = useI18n();
  const { amount, varies } = fromPrice(product, model.groups);
  const promo = model.discountFor(product.id);
  const final = promo ? computePrice({ basePrice: amount, groups: [], selection: {}, percentOff: promo.percentOff }).unitTotal : amount;
  return (
    <span className="nq-price">
      {varies && <small>{t('price.from')} </small>}
      {model.price(final)}
      {promo && <s>{model.price(amount)}</s>}
    </span>
  );
}

type Variant = 'hero' | 'tile' | 'row' | 'slide';

export function ProductCard({ product, model, variant, onOpen }: {
  product: Product; model: MenuModel; variant: Variant; onOpen: (p: Product) => void;
}) {
  const { t } = useI18n();
  const media = resolveProductMedia(product, model.assets);
  const sizes = {
    hero: '(min-width: 900px) 640px, 100vw',
    tile: '(min-width: 900px) 300px, 50vw',
    row: '96px',
    slide: '(min-width: 900px) 280px, 62vw',
  }[variant];

  return (
    <article className={`nq-card nq-card--${variant} ${!product.available ? 'is-soldout' : ''}`}>
      <button type="button" className="nq-card__hit" onClick={() => onOpen(product)} aria-label={t('card.see', { name: product.name })} />
      {(variant !== 'row' || media.primary) && (
        <div className="nq-card__media">
          <MediaImage asset={media.primary} sizes={sizes} fallbackLabel={product.name} />
          <MediaHints product={product} />
        </div>
      )}
      <div className="nq-card__body">
        {variant !== 'row' && <BadgeList product={product} model={model} max={variant === 'hero' ? 2 : 1} />}
        <div className="nq-card__head">
          <h3 className="nq-card__name">{product.name}</h3>
          {variant === 'row' && <span className="nq-card__leader" aria-hidden="true" />}
          <PriceTag product={product} model={model} />
        </div>
        {product.description && variant !== 'slide' && <p className="nq-card__desc">{product.description}</p>}
        {variant === 'row' && <BadgeList product={product} model={model} max={1} />}
      </div>
    </article>
  );
}
