import { useMemo, useState } from 'react';
import type { Product } from '../../domain/types';
import { dietOptions, matchesDiet, NO_DIET, type DietFilter } from '../../domain/menu';
import { Icon } from '../../ui/Icon';
import { useI18n } from './i18n';
import { Sheet } from './Sheet';

/** Filtros por dieta (etiquetas) y por alérgenos a evitar. */
export function DietSheet({ products, value, onApply, onClose }: {
  products: Product[]; value: DietFilter; onApply: (f: DietFilter) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<DietFilter>(value);
  const { tags, allergens } = useMemo(() => dietOptions(products), [products]);
  const count = products.filter((p) => matchesDiet(p, draft)).length;
  const toggle = (k: keyof DietFilter, v: string) =>
    setDraft((d) => ({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] }));

  return (
    <Sheet
      title={t('diet.title')} onClose={onClose}
      footer={(
        <>
          <button type="button" className="nq-link" onClick={() => setDraft(NO_DIET)}>{t('diet.clear')}</button>
          <button type="button" className="nq-cta" disabled={count === 0} onClick={() => { onApply(draft); onClose(); }}>
            {count === 0 ? t('diet.none') : count === 1 ? t('diet.showOne') : t('diet.show', { n: count })}
          </button>
        </>
      )}
    >
      <p className="nq-muted">{t('diet.lead')}</p>
      {tags.length > 0 && (
        <fieldset className="nq-diet">
          <legend>{t('diet.include')}</legend>
          <div className="nq-diet__chips">
            {tags.map((x) => (
              <button key={x} type="button" className={`nq-chip ${draft.include.includes(x) ? 'is-active' : ''}`}
                aria-pressed={draft.include.includes(x)} onClick={() => toggle('include', x)}>
                <Icon name="leaf" size={14} /> {x}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {allergens.length > 0 && (
        <fieldset className="nq-diet">
          <legend>{t('diet.avoid')}</legend>
          <div className="nq-diet__chips">
            {allergens.map((x) => (
              <button key={x} type="button" className={`nq-chip nq-chip--avoid ${draft.avoid.includes(x) ? 'is-active' : ''}`}
                aria-pressed={draft.avoid.includes(x)} onClick={() => toggle('avoid', x)}>
                {draft.avoid.includes(x) && <Icon name="check" size={14} />} {t('diet.without', { name: x.toLowerCase() })}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <p className="nq-disclaimer">{t('diet.disclaimer')}</p>
    </Sheet>
  );
}
