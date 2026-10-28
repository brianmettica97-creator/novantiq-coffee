import { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '../../domain/types';
import { availableModes, comboSeparateValue, resolveProductMedia } from '../../domain/menu';
import {
  computePrice, defaultSelection, groupLimits, resolveGroups, toggleOption, validateSelection, type Selection,
} from '../../domain/pricing';
import { formatDelta } from '../../domain/format';
import { describeSchedule } from '../../domain/promotions';
import { Icon } from '../../ui/Icon';
import { MediaImage } from '../../ui/MediaImage';
import { MediaStage } from './media/MediaStage';
import { BadgeList } from './ProductCard';
import type { MenuModel } from './model';
import { useI18n } from './i18n';

interface Props {
  product: Product;
  model: MenuModel;
  onClose: () => void;
  onOpenProduct: (slug: string) => void;
  onEvent: (type: 'media_play', productId: string) => void;
}

/** Ficha de producto: pantalla completa en móvil, panel lateral en escritorio. */
export function ProductSheet({ product, model, onClose, onOpenProduct, onEvent }: Props) {
  const { t, lang } = useI18n();
  const { assets, groups, price, products, menu } = model;
  const media = useMemo(() => resolveProductMedia(product, assets), [product, assets]);
  const modes = useMemo(() => availableModes(product, media), [product, media]);
  const resolved = useMemo(() => resolveGroups(groups, product.optionGroups), [groups, product.optionGroups]);
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(resolved));
  const [touched, setTouched] = useState(false);
  const promo = model.discountFor(product.id);
  const result = computePrice({ basePrice: product.price, groups: resolved, selection, percentOff: promo?.percentOff });
  const issues = validateSelection(resolved, selection);
  const dialog = useRef<HTMLDivElement>(null);
  const separate = comboSeparateValue(product, menu.products);

  useEffect(() => {
    setSelection(defaultSelection(resolved));
    setTouched(false);
    dialog.current?.scrollTo({ top: 0 });
    dialog.current?.focus();
  }, [product.id, resolved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pairings = product.pairingIds.map((id) => products.get(id)).filter((p): p is Product => !!p);
  const related = product.relatedIds.map((id) => products.get(id)).filter((p): p is Product => !!p);
  const meta = [
    product.size && { label: t('sheet.size'), value: product.size },
    product.portion && { label: t('sheet.portion'), value: product.portion },
    product.prepMinutes && { label: t('sheet.prep'), value: t('sheet.prepValue', { n: product.prepMinutes }) },
  ].filter(Boolean) as { label: string; value: string }[];
  const schedule = promo ? describeSchedule(promo, lang) : '';

  return (
    <div className="nq-sheet-backdrop" onClick={onClose}>
      <div
        className="nq-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nq-sheet-title"
        ref={dialog}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="nq-icon-btn nq-sheet__close" onClick={onClose} aria-label={t('sheet.close')}>
          <Icon name="close" />
        </button>

        <MediaStage
          key={product.id}
          name={product.name}
          media={media}
          modes={modes}
          onEvent={(type) => onEvent(type, product.id)}
        />

        <div className="nq-sheet__body">
          <BadgeList product={product} model={model} />
          <h2 id="nq-sheet-title" className="nq-sheet__title">{product.name}</h2>
          <div className="nq-sheet__price">
            <strong>{price(result.unitTotal)}</strong>
            {promo && <s>{price(result.unitBase + result.unitOptions)}</s>}
            {!product.available && <span className="nq-soldout">{t('sheet.soldout')}</span>}
          </div>
          {promo && (
            <p className="nq-sheet__promo"><Icon name="sparkle" size={14} /> {promo.title} · −{promo.percentOff}% {schedule && `· ${schedule}`}</p>
          )}
          {product.description && <p className="nq-sheet__lead">{product.description}</p>}
          {product.story && <p className="nq-sheet__story">{product.story}</p>}

          {meta.length > 0 && (
            <dl className="nq-meta">
              {meta.map((m) => (<div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>))}
            </dl>
          )}

          {product.kind === 'combo' && product.comboItems.length > 0 && (
            <section className="nq-sheet__section">
              <h3>{t('sheet.includes')}</h3>
              <ul className="nq-combo">
                {product.comboItems.map((item) => {
                  const p = products.get(item.productId);
                  if (!p) return null;
                  const subs = item.substituteIds.map((id) => products.get(id)?.name).filter(Boolean);
                  return (
                    <li key={item.productId}>
                      <span className="nq-combo__qty">{item.quantity}×</span>
                      <span>{p.name}{subs.length > 0 && <small> · {t('sheet.or')} {subs.join(', ')}</small>}</span>
                    </li>
                  );
                })}
              </ul>
              {separate !== null && separate > product.price && (
                <p className="nq-combo__save">{t('sheet.separate', { a: price(separate), b: price(separate - product.price) })}</p>
              )}
            </section>
          )}

          {resolved.map((g) => {
            const { min, max } = groupLimits(g);
            const chosen = selection[g.id] ?? [];
            const issue = touched ? issues.find((i) => i.groupId === g.id) : undefined;
            const issueText = !issue ? '' : chosen.length > max
              ? t('sheet.chooseMax', { n: max, name: g.name })
              : min === 1 ? t('sheet.chooseOne', { name: g.name }) : t('sheet.chooseMin', { n: min, name: g.name });
            return (
              <fieldset key={g.id} className={`nq-options ${issue ? 'has-error' : ''}`}>
                <legend>
                  <span>{g.name}</span>
                  <small>{min > 0 ? t('sheet.required') : t('sheet.optional')}{max > 1 ? ` · ${t('sheet.upTo', { n: max })}` : ''}</small>
                </legend>
                {g.options.map((o) => {
                  const checked = chosen.includes(o.id);
                  const atMax = !checked && max > 1 && chosen.length >= max;
                  return (
                    <label key={o.id} className={`nq-option ${checked ? 'is-checked' : ''} ${!o.available ? 'is-disabled' : ''}`}>
                      <input
                        type={max === 1 ? 'radio' : 'checkbox'}
                        name={`g-${g.id}`}
                        checked={checked}
                        disabled={!o.available || atMax}
                        onChange={() => { setTouched(true); setSelection((s) => toggleOption(s, g, o.id)); }}
                      />
                      <span className="nq-option__mark" aria-hidden="true" />
                      <span className="nq-option__name">{o.name}{!o.available && ` · ${t('sheet.unavailable')}`}</span>
                      <span className="nq-option__delta">{formatDelta(o.priceDelta, menu.settings.currency, menu.settings.locale)}</span>
                    </label>
                  );
                })}
                {issue && <p className="nq-options__error" role="alert">{issueText}</p>}
              </fieldset>
            );
          })}

          {(product.ingredients.length > 0 || product.allergens.length > 0 || product.tags.length > 0 || product.foodInfo) && (
            <section className="nq-sheet__section">
              <h3>{t('sheet.info')}</h3>
              {product.tags.length > 0 && (
                <ul className="nq-tags">{product.tags.map((x) => <li key={x}><Icon name="leaf" size={12} /> {x}</li>)}</ul>
              )}
              {product.ingredients.length > 0 && <p><strong>{t('sheet.ingredients')}</strong> {product.ingredients.join(', ')}.</p>}
              {product.allergens.length > 0 && (
                <p className="nq-allergens"><strong>{t('sheet.contains')}</strong> {product.allergens.join(', ')}.</p>
              )}
              {product.foodInfo && <p>{product.foodInfo}</p>}
              <p className="nq-disclaimer">{t('sheet.disclaimer')}</p>
            </section>
          )}

          {[{ title: t('sheet.pairings'), list: pairings }, { title: t('sheet.related'), list: related }].map(({ title, list }) =>
            list.length > 0 && (
              <section className="nq-sheet__section" key={title}>
                <h3>{title}</h3>
                <div className="nq-mini-rail">
                  {list.map((p) => {
                    const primary = resolveProductMedia(p, assets).primary;
                    return (
                      <button key={p.id} type="button" className="nq-mini" onClick={() => onOpenProduct(p.slug)}>
                        <MediaImage asset={primary} sizes="120px" fallbackLabel={p.name} />
                        <span>{p.name}</span>
                        <small>{price(p.price)}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>

        <div className="nq-sheet__bar">
          <div className="nq-sheet__total">
            <small>{resolved.length ? t('sheet.priceSelection') : t('sheet.price')}</small>
            <strong>{price(result.unitTotal)}</strong>
          </div>
          {/* Fase 6: aquí irá "Agregar al pedido" (validado en backend). Hasta
              entonces no se muestra un botón que no haga nada. */}
          <p className="nq-sheet__hint">
            {!product.available ? t('sheet.notToday') : touched && issues.length ? t('sheet.check') : t('sheet.askStaff')}
          </p>
        </div>
      </div>
    </div>
  );
}
