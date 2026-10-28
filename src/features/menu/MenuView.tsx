import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HomeSection, MenuLanguage, Product, PublicMenu } from '../../domain/types';
import { homeSections, isDietActive, matchesDiet, NO_DIET, productsByCategory, resolveProductMedia, type DietFilter } from '../../domain/menu';
import { searchProducts } from '../../domain/search';
import { themeStyle, ensureFonts } from '../../theme/applyTheme';
import { Icon } from '../../ui/Icon';
import { MediaImage } from '../../ui/MediaImage';
import { useMenuModel } from './model';
import { CategorySection, Cover, Featured, LanguageMenu, MenuFooter, Promotions } from './sections';
import { ProductSheet } from './ProductSheet';
import { PriceTag } from './ProductCard';
import { DietSheet } from './DietSheet';
import { LoyaltySection, LoyaltySheet, useLoyalty } from './Loyalty';
import { TableService } from './TableService';
import { I18nProvider, useI18n } from './i18n';
import { useScrollLock } from './Sheet';
import type { MenuActions, TableInfo } from './actions';
import type { PublicEventInput } from '../../data/repository';

export interface MenuViewProps {
  /** Carta ya traducida al idioma `lang`. */
  menu: PublicMenu;
  /** slug del producto abierto (controlado por la URL en la carta real). */
  openSlug: string | null;
  onOpenSlug: (slug: string | null) => void;
  onTrack?: (event: Omit<PublicEventInput, 'sessionId'>, once?: boolean) => void;
  /** Vista previa del panel: la carta vive dentro de un contenedor con scroll propio. */
  embedded?: boolean;
  lang?: MenuLanguage;
  onLanguage?: (lang: MenuLanguage) => void;
  /** Sin acciones (vista previa) la tarjeta y el servicio de mesa quedan inactivos. */
  actions?: MenuActions;
  table?: TableInfo | null;
}

const noop = () => {};

export function MenuView(props: MenuViewProps) {
  return (
    <I18nProvider lang={props.lang ?? 'es'}>
      <MenuContent {...props} />
    </I18nProvider>
  );
}

function MenuContent({ menu, openSlug, onOpenSlug, onTrack = noop, embedded = false, onLanguage = noop, actions, table }: MenuViewProps) {
  const { t, lang } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const model = useMenuModel(menu);
  const sections = useMemo(() => productsByCategory(menu), [menu]);
  const [activeCat, setActiveCat] = useState<string | null>(sections[0]?.category.id ?? null);
  const [overlay, setOverlay] = useState<'search' | 'diet' | 'card' | 'table' | null>(null);
  const [diet, setDiet] = useState<DietFilter>(NO_DIET);
  const navRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const loyalty = useLoyalty(menu.organization.slug, actions);
  const program = menu.loyalty;
  const languages: MenuLanguage[] = ['es', ...menu.settings.languages];
  const showCover = menu.settings.showCover;
  const closeOverlay = useCallback(() => setOverlay(null), []);

  useEffect(() => { ensureFonts([menu.theme.fontDisplay, menu.theme.fontBody]); }, [menu.theme.fontDisplay, menu.theme.fontBody]);
  // Los nombres de etiquetas y alérgenos cambian con el idioma.
  useEffect(() => { setDiet(NO_DIET); }, [lang]);

  const scrollRoot = embedded ? rootRef.current?.parentElement ?? null : null;
  const scroller = () => scrollRoot ?? document.scrollingElement ?? document.documentElement;

  const filtered = useMemo(() => (isDietActive(diet)
    ? sections.map((s) => ({ ...s, products: s.products.filter((p) => matchesDiet(p, diet)) })).filter((s) => s.products.length)
    : sections), [sections, diet]);
  const matching = filtered.reduce((n, s) => n + s.products.length, 0);

  // Indicador de categoría activa según la sección visible.
  useEffect(() => {
    const els = [...(rootRef.current?.querySelectorAll<HTMLElement>('.nq-category') ?? [])];
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) {
        const id = (visible[0].target as HTMLElement).dataset.category!;
        setActiveCat(id);
        onTrack({ type: 'category_view', categoryId: id }, true);
      }
    }, { root: scrollRoot ?? null, rootMargin: '-35% 0px -60% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [filtered, scrollRoot, onTrack]);

  // Mantiene visible la píldora activa dentro de la barra horizontal.
  useEffect(() => {
    const pill = navRef.current?.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`);
    const bar = navRef.current;
    if (pill && bar) bar.scrollTo({ left: pill.offsetLeft - bar.clientWidth / 2 + pill.clientWidth / 2, behavior: 'smooth' });
  }, [activeCat]);

  const scrollToEl = (el: HTMLElement | null) => {
    if (!el) return;
    const root = scroller();
    const offset = (navRef.current?.closest('.nq-nav')?.clientHeight ?? 0) + 8;
    const top = el.getBoundingClientRect().top - (scrollRoot ? scrollRoot.getBoundingClientRect().top : 0) + root.scrollTop - offset;
    root.scrollTo({ top, behavior: 'smooth' });
  };
  const jumpTo = (slug: string) => requestAnimationFrame(() => scrollToEl(rootRef.current?.querySelector<HTMLElement>(`#cat-${slug}`) ?? null));

  const openProduct = useCallback((p: Product) => onOpenSlug(p.slug), [onOpenSlug]);
  const openProductSlug = useCallback((slug: string) => onOpenSlug(slug), [onOpenSlug]);
  const current = openSlug ? menu.products.find((p) => p.slug === openSlug) ?? null : null;

  useEffect(() => {
    if (current) onTrack({ type: 'product_view', productId: current.id });
  }, [current, onTrack]);

  useScrollLock(!!current || overlay !== null, embedded);

  const openCard = async () => {
    if (loyalty.card) setOverlay('card');
    else if (await loyalty.join()) setOverlay('card');
  };

  const blocks: Record<HomeSection, React.ReactNode> = {
    promotions: !isDietActive(diet) && (
      <Promotions key="promos" model={model} onOpenProduct={openProduct} onPromoClick={(p) => onTrack({ type: 'promo_click', promotionId: p.id })} />
    ),
    loyalty: program && !isDietActive(diet) && (
      <LoyaltySection key="loyalty" program={program} state={loyalty} onOpen={() => setOverlay('card')} />
    ),
    featured: !isDietActive(diet) && <Featured key="featured" model={model} onOpen={openProduct} />,
    categories: (
      <div key="cats" className="nq-categories">
        {filtered.map((s) => (
          <CategorySection key={s.category.id} category={s.category} products={s.products} model={model}
            index={sections.findIndex((x) => x.category.id === s.category.id)} onOpen={openProduct} />
        ))}
      </div>
    ),
  };
  const dietCount = diet.include.length + diet.avoid.length;

  return (
    <div ref={rootRef} lang={lang} className={`nq-menu nq-nav--${menu.theme.categoryNavStyle} ${embedded ? 'is-embedded' : ''}`} style={themeStyle(menu.theme)}>
      {showCover && (
        <Cover model={model} languages={languages} onLanguage={onLanguage}
          onCard={program && actions ? openCard : undefined}
          onEnter={() => startRef.current && scroller().scrollTo({ top: startRef.current.offsetTop - 4, behavior: 'smooth' })} />
      )}

      <div ref={startRef} />
      <nav className="nq-nav" aria-label={t('nav.categories')}>
        <div className="nq-nav__row">
          <button type="button" className="nq-nav__brand" onClick={() => scroller().scrollTo({ top: 0, behavior: 'smooth' })} aria-label={t('nav.home')}>
            {menu.organization.name}
          </button>
          {menu.organization.isDemo && <span className="nq-demo-tag" title={t('demo.title')}>{t('demo.tag')}</span>}
          <div className="nq-nav__tools">
            <LanguageMenu languages={languages} onChange={onLanguage} />
            {program && loyalty.card && (
              <button type="button" className="nq-icon-btn" onClick={() => setOverlay('card')} aria-label={t('nav.card')}>
                <Icon name="card" />
              </button>
            )}
            <button type="button" className={`nq-icon-btn ${dietCount ? 'is-on' : ''}`} onClick={() => setOverlay('diet')} aria-label={t('nav.filters')}>
              <Icon name="sliders" />
              {dietCount > 0 && <span className="nq-count">{dietCount}</span>}
            </button>
            <button type="button" className="nq-icon-btn" onClick={() => setOverlay('search')} aria-label={t('nav.search')}>
              <Icon name="search" />
            </button>
          </div>
        </div>
        <div className="nq-nav__cats" ref={navRef}>
          {filtered.map((s) => (
            <button key={s.category.id} type="button" data-cat={s.category.id}
              className={`nq-pill ${activeCat === s.category.id ? 'is-active' : ''}`}
              aria-current={activeCat === s.category.id ? 'true' : undefined}
              onClick={() => jumpTo(s.category.slug)}>
              {s.category.name}
            </button>
          ))}
        </div>
      </nav>

      <main className="nq-main">
        {isDietActive(diet) && (
          <div className="nq-diet-bar" role="status">
            <p><Icon name="leaf" size={16} /> {matching ? t('diet.active', { n: matching }) : t('diet.empty')}</p>
            <ul>
              {diet.include.map((x) => <li key={`i${x}`}>{x}</li>)}
              {diet.avoid.map((x) => <li key={`a${x}`}>{t('diet.without', { name: x.toLowerCase() })}</li>)}
            </ul>
            <button type="button" className="nq-link" onClick={() => setDiet(NO_DIET)}>{t('diet.clear')}</button>
          </div>
        )}
        {homeSections(menu.settings.sectionOrder).map((k) => blocks[k])}
      </main>

      <MenuFooter model={model} />

      {table && actions && (
        <TableService table={table} actions={actions} open={overlay === 'table'} onOpen={() => setOverlay('table')} onClose={closeOverlay} />
      )}
      {overlay === 'search' && (
        <SearchOverlay
          model={model}
          onClose={closeOverlay}
          onPick={(p) => { setOverlay(null); openProduct(p); }}
          onSearch={(q) => onTrack({ type: 'search', query: q })}
        />
      )}
      {overlay === 'diet' && <DietSheet products={menu.products} value={diet} onApply={setDiet} onClose={closeOverlay} />}
      {overlay === 'card' && program && <LoyaltySheet program={program} state={loyalty} onClose={closeOverlay} />}
      {current && (
        <ProductSheet
          product={current} model={model} onClose={() => onOpenSlug(null)} onOpenProduct={openProductSlug}
          onEvent={(type, productId) => onTrack({ type, productId })}
        />
      )}
    </div>
  );
}

function SearchOverlay({ model, onClose, onPick, onSearch }: {
  model: ReturnType<typeof useMenuModel>; onClose: () => void; onPick: (p: Product) => void; onSearch: (q: string) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const results = useMemo(() => searchProducts(model.menu.products, model.menu.categories, q), [q, model.menu]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (q.trim().length < 3) return;
    const timer = setTimeout(() => onSearch(q), 1200);
    return () => clearTimeout(timer);
  }, [q, onSearch]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const suggestions = model.featured.length ? model.featured : model.menu.products.slice(0, 6);
  const list = q.trim() ? results.map((r) => r.product) : [];

  return (
    <div className="nq-search" role="dialog" aria-modal="true" aria-label={t('nav.search')}>
      <div className="nq-search__bar">
        <Icon name="search" />
        <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.placeholder')} aria-label={t('search.label')} enterKeyHint="search" />
        <button type="button" className="nq-icon-btn" onClick={onClose} aria-label={t('search.close')}><Icon name="close" /></button>
      </div>
      <div className="nq-search__results" aria-live="polite">
        {q.trim() && list.length === 0 && (
          <div className="nq-empty">
            <p>{t('search.none', { q })}</p>
            <p className="nq-muted">{t('search.try')}</p>
          </div>
        )}
        {(list.length ? list : suggestions).map((p) => (
          <button key={p.id} type="button" className="nq-result" onClick={() => onPick(p)}>
            <MediaImage asset={resolveProductMedia(p, model.assets).primary} sizes="64px" fallbackLabel={p.name} />
            <span className="nq-result__text">
              <strong>{p.name}</strong>
              <small>{model.menu.categories.find((c) => c.id === p.categoryId)?.name}</small>
            </span>
            <PriceTag product={p} model={model} />
          </button>
        ))}
        {!q.trim() && <p className="nq-search__label">{t('search.suggested')}</p>}
      </div>
    </div>
  );
}
