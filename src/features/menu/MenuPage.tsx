import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { MenuLanguage, PublicMenu } from '../../domain/types';
import { localizeMenu, pickLanguage } from '../../domain/i18n';
import { getRepository } from '../../data';
import type { PublicEventInput } from '../../data/repository';
import { MenuView } from './MenuView';
import { track } from './tracker';
import { makeT } from './i18n';
import { applyMenuHead } from './head';
import type { MenuActions, TableInfo } from './actions';

type State = { status: 'loading' } | { status: 'ready'; menu: PublicMenu } | { status: 'missing' } | { status: 'error' };

const LANG_KEY = 'nq-lang';
const readLang = () => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } };

/** Ruta pública /m/:slug. Sin login: el QR abre directo la carta. */
export function MenuPage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [lang, setLang] = useState<MenuLanguage>('es');
  const [table, setTable] = useState<TableInfo | null>(null);
  const qr = params.get('qr');

  useEffect(() => {
    let alive = true;
    getRepository()
      .then((r) => r.getPublicMenu(slug))
      .then((menu) => {
        if (!alive) return;
        setState(menu ? { status: 'ready', menu } : { status: 'missing' });
        if (menu) {
          setLang(pickLanguage(menu.settings.languages, params.get('lang') ?? readLang(), navigator.languages ?? [navigator.language]));
          track(slug, { type: 'menu_view' }, { oncePerSession: true });
          if (qr) track(slug, { type: 'qr_scan', qrToken: qr }, { oncePerSession: true });
        }
      })
      .catch(() => alive && setState({ status: 'error' }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Un QR de mesa habilita "llamar al mozo" y "pedir la cuenta".
  useEffect(() => {
    if (!qr) return;
    let alive = true;
    getRepository().then((r) => r.getTableForQr(slug, qr)).then((label) => alive && setTable(label ? { label } : null)).catch(() => {});
    return () => { alive = false; };
  }, [slug, qr]);

  const menu = state.status === 'ready' ? state.menu : null;
  const localized = useMemo(() => menu && localizeMenu(menu, lang), [menu, lang]);
  useEffect(() => { if (localized) applyMenuHead(localized, lang); }, [localized, lang]);

  const changeLang = useCallback((l: MenuLanguage) => {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* sin almacenamiento */ }
  }, []);

  const actions = useMemo<MenuActions>(() => ({
    joinLoyalty: () => getRepository().then((r) => r.joinLoyalty(slug)),
    getLoyaltyCard: (code) => getRepository().then((r) => r.getLoyaltyCard(slug, code)),
    requestService: (kind) => {
      if (!qr) return Promise.reject(new Error('Sin mesa'));
      return getRepository().then((r) => r.requestService(slug, qr, kind));
    },
  }), [slug, qr]);

  const openSlug = params.get('producto');
  const onOpenSlug = useCallback((s: string | null) => {
    if (s) setParams((p) => { p.set('producto', s); return p; }, { replace: !!openSlug });
    // Cerrar = volver atrás cuando la ficha se abrió desde la carta, para que
    // el botón "atrás" del teléfono también la cierre.
    else if (window.history.state?.idx > 0) window.history.back();
    else setParams((p) => { p.delete('producto'); return p; }, { replace: true });
  }, [setParams, openSlug]);

  const onTrack = useCallback((e: Omit<PublicEventInput, 'sessionId'>, once?: boolean) => track(slug, e, { oncePerSession: once }), [slug]);

  const t = makeT(lang);
  if (state.status === 'loading') return <div className="nq-boot" aria-busy="true"><span className="nq-spinner" /> {t('boot.loading')}</div>;
  if (state.status !== 'ready' || !localized) {
    return (
      <div className="nq-boot">
        <h1>{state.status === 'missing' ? t('boot.missing') : t('boot.error')}</h1>
        <p>{state.status === 'missing' ? t('boot.missingText') : t('boot.errorText')}</p>
        {state.status === 'error' && <button type="button" className="nq-cta" onClick={() => window.location.reload()}>{t('boot.retry')}</button>}
      </div>
    );
  }
  return (
    <MenuView
      menu={localized} openSlug={openSlug} onOpenSlug={onOpenSlug} onTrack={onTrack}
      lang={lang} onLanguage={changeLang} actions={actions} table={table}
    />
  );
}
