import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoyaltyCard, LoyaltyProgram } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { QrImage } from '../../ui/QrCanvas';
import type { MenuActions } from './actions';
import { useI18n } from './i18n';
import { Sheet } from './Sheet';

/* -------------------------------------------------------------- Estado */

const storageKey = (slug: string) => `nq-loyalty:${slug}`;

function readCode(slug: string): string | null {
  try { return localStorage.getItem(storageKey(slug)); } catch { return null; }
}

function writeCode(slug: string, code: string | null) {
  try {
    if (code) localStorage.setItem(storageKey(slug), code);
    else localStorage.removeItem(storageKey(slug));
  } catch { /* sin almacenamiento: la tarjeta dura lo que la pestaña */ }
}

export type LoyaltyState = ReturnType<typeof useLoyalty>;

/** Tarjeta del cliente guardada en este teléfono (solo el código, nada personal). */
export function useLoyalty(slug: string, actions: MenuActions | undefined) {
  const [card, setCard] = useState<LoyaltyCard | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'joining' | 'error' | 'lost'>('idle');
  const code = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!actions || !code.current) return;
    setStatus('loading');
    try {
      const c = await actions.getLoyaltyCard(code.current);
      if (c) { setCard(c); setStatus('idle'); }
      else { writeCode(slug, null); code.current = null; setCard(null); setStatus('lost'); }
    } catch {
      setStatus('error');
    }
  }, [actions, slug]);

  useEffect(() => {
    code.current = readCode(slug);
    if (code.current) refresh();
  }, [slug, refresh]);

  const join = useCallback(async () => {
    if (!actions) return null;
    setStatus('joining');
    try {
      const c = await actions.joinLoyalty();
      writeCode(slug, c.code);
      code.current = c.code;
      setCard(c);
      setStatus('idle');
      return c;
    } catch {
      setStatus('error');
      return null;
    }
  }, [actions, slug]);

  return { card, status, join, refresh, enabled: !!actions };
}

/* ------------------------------------------------------------ Sellos */

export function StampGrid({ goal, filled, demo = false }: { goal: number; filled: number; demo?: boolean }) {
  const { t } = useI18n();
  return (
    <ol className={`nq-stamps ${demo ? 'is-demo' : ''}`} style={{ '--cols': Math.min(goal, goal > 10 ? 6 : 5) } as React.CSSProperties}>
      {Array.from({ length: goal }, (_, i) => {
        const last = i === goal - 1;
        const on = i < filled;
        return (
          <li key={i} className={`nq-stamp ${on ? 'is-on' : ''} ${last ? 'is-reward' : ''}`} style={{ '--i': i } as React.CSSProperties}
            aria-label={`${t('loyalty.stamp', { i: i + 1 })}${on ? ' ✓' : ''}`}>
            <Icon name={last ? 'gift' : 'cup'} size={last ? 22 : 20} />
          </li>
        );
      })}
    </ol>
  );
}

function progressText(t: ReturnType<typeof useI18n>['t'], card: LoyaltyCard) {
  const left = card.goal - card.stamps;
  if (left <= 0) return t('loyalty.ready');
  return left === 1 ? t('loyalty.missingOne') : t('loyalty.missing', { n: left });
}

/* ----------------------------------------------------- Sección en la carta */

export function LoyaltySection({ program, state, onOpen }: {
  program: LoyaltyProgram; state: LoyaltyState; onOpen: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  const { card } = state;

  // Los sellos de muestra se "estampan" al entrar en pantalla.
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (!('IntersectionObserver' in window)) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const filled = card ? Math.min(card.stamps, program.stampsForReward) : seen ? 3 : 0;
  const action = async () => {
    if (card) { onOpen(); return; }
    const c = await state.join();
    if (c) onOpen();
  };

  return (
    <section ref={ref} className={`nq-loyalty ${seen ? 'is-seen' : ''}`} aria-labelledby="nq-loyalty-title">
      <div className="nq-loyalty__card">
        <div className="nq-loyalty__shine" aria-hidden="true" />
        <div className="nq-loyalty__top">
          <p className="nq-loyalty__eyebrow"><Icon name="sparkle" size={14} /> {t('loyalty.eyebrow')}</p>
          <p className="nq-loyalty__brand">{program.name}</p>
        </div>
        <h2 id="nq-loyalty-title" className="nq-loyalty__title">
          {t('loyalty.headline', { n: program.stampsForReward })} <em>{program.reward.toLowerCase()}</em>
        </h2>
        <StampGrid goal={program.stampsForReward} filled={filled} demo={!card} />
        {card && <p className="nq-loyalty__progress">{t('loyalty.progress', { s: Math.min(card.stamps, card.goal), n: card.goal })} · {progressText(t, card)}</p>}
        <div className="nq-loyalty__cta">
          <button type="button" className="nq-cta nq-cta--gold" onClick={action} disabled={!state.enabled || state.status === 'joining'}>
            {state.status === 'joining' ? <><span className="nq-spinner" aria-hidden="true" /> {t('loyalty.joining')}</>
              : <><Icon name={card ? 'qr' : 'card'} size={18} /> {card ? t('loyalty.open') : t('loyalty.join')}</>}
          </button>
          <small>{state.enabled ? t('loyalty.free') : t('loyalty.preview')}</small>
        </div>
        {state.status === 'error' && <p className="nq-loyalty__error" role="alert">{t('loyalty.error')}</p>}
        {state.status === 'lost' && <p className="nq-loyalty__error" role="status">{t('loyalty.lost')}</p>}
      </div>
      <ol className="nq-loyalty__how">
        <li><span>1</span>{t('loyalty.how1')}</li>
        <li><span>2</span>{t('loyalty.how2')}</li>
        <li><span>3</span>{t('loyalty.how3')}</li>
      </ol>
    </section>
  );
}

/* ------------------------------------------------- Tarjeta del cliente */

const groupCode = (c: string) => c.toUpperCase().match(/.{1,4}/g)?.join(' ') ?? c;

export function LoyaltySheet({ program, state, onClose }: { program: LoyaltyProgram; state: LoyaltyState; onClose: () => void }) {
  const { t } = useI18n();
  const { card } = state;
  useEffect(() => {
    // Al volver a la pestaña (después de que el personal sume sellos) se actualiza.
    const onVisible = () => document.visibilityState === 'visible' && state.refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [state]);
  if (!card) return null;
  const ready = card.stamps >= card.goal;
  return (
    <Sheet title={t('loyalty.cardTitle')} onClose={onClose} className="nq-modal__panel--card">
      <div className={`nq-wallet ${ready ? 'is-ready' : ''}`}>
        <div className="nq-loyalty__shine" aria-hidden="true" />
        <div className="nq-wallet__head">
          <span className="nq-loyalty__eyebrow">{t('loyalty.eyebrow')}</span>
          <strong>{program.name}</strong>
        </div>
        <StampGrid goal={card.goal} filled={Math.min(card.stamps, card.goal)} />
        <p className="nq-wallet__progress">
          <strong>{t('loyalty.progress', { s: Math.min(card.stamps, card.goal), n: card.goal })}</strong>
          <span>{progressText(t, card)}</span>
        </p>
        <p className="nq-wallet__reward"><Icon name="gift" size={16} /> {program.reward}</p>
      </div>
      <div className="nq-wallet__qr">
        <QrImage text={card.code} size={176} label={t('loyalty.show')} />
        <div>
          <p className="nq-wallet__show">{t('loyalty.show')}</p>
          <p className="nq-wallet__code"><small>{t('loyalty.code')}</small> <code>{groupCode(card.code)}</code></p>
          <button type="button" className="nq-link" onClick={state.refresh} disabled={state.status === 'loading'}>
            <Icon name="refresh" size={16} /> {t('loyalty.refresh')}
          </button>
        </div>
      </div>
      {card.redeemed > 0 && <p className="nq-muted nq-small">{t('loyalty.redeemed', { n: card.redeemed })}</p>}
      {program.terms && (
        <details className="nq-wallet__terms">
          <summary>{t('loyalty.terms')}</summary>
          <p>{program.terms}</p>
        </details>
      )}
      <p className="nq-muted nq-small">{t('loyalty.saved')}</p>
    </Sheet>
  );
}
