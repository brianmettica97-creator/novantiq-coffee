import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../../ui/Icon';
import { useI18n } from './i18n';

/** Panel modal: sube desde abajo en el teléfono y queda centrado en escritorio. */
export function Sheet({ title, onClose, children, footer, className = '' }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="nq-modal" onClick={onClose}>
      <div
        ref={panel} className={`nq-modal__panel ${className}`} role="dialog" aria-modal="true" aria-label={title}
        tabIndex={-1} onClick={(e) => e.stopPropagation()}
      >
        <header className="nq-modal__head">
          <h2>{title}</h2>
          <button type="button" className="nq-icon-btn" onClick={onClose} aria-label={t('sheet.close')}><Icon name="close" /></button>
        </header>
        <div className="nq-modal__body">{children}</div>
        {footer && <footer className="nq-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Bloquea el scroll del fondo mientras haya una capa abierta, sin perder la posición. */
export function useScrollLock(active: boolean, disabled = false) {
  useEffect(() => {
    if (!active || disabled) return;
    const y = window.scrollY;
    const body = document.body.style;
    Object.assign(body, { position: 'fixed', top: `-${y}px`, left: '0', right: '0' });
    return () => {
      Object.assign(body, { position: '', top: '', left: '', right: '' });
      window.scrollTo(0, y);
    };
  }, [active, disabled]);
}
