import { useState } from 'react';
import type { ServiceKind } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import type { MenuActions, TableInfo } from './actions';
import { useI18n } from './i18n';
import { Sheet } from './Sheet';

type Result = { kind: ServiceKind; outcome: 'sent' | 'already' | 'error' };

/** Botón flotante de la mesa: llamar al mozo o pedir la cuenta. */
export function TableService({ table, actions, open, onOpen, onClose }: {
  table: TableInfo; actions: MenuActions; open: boolean; onOpen: () => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<ServiceKind | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const send = async (kind: ServiceKind) => {
    setBusy(kind);
    try {
      setResult({ kind, outcome: await actions.requestService(kind) });
    } catch {
      setResult({ kind, outcome: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const message = result && (result.outcome === 'error' ? t('table.error')
    : result.outcome === 'already' ? t('table.already')
    : result.kind === 'bill' ? t('table.sent.bill') : t('table.sent.assistance'));

  return (
    <>
      <button type="button" className="nq-table-fab" onClick={() => { setResult(null); onOpen(); }} aria-haspopup="dialog">
        <Icon name="bell" size={18} />
        <span>{table.label}</span>
      </button>
      {open && (
        <Sheet title={t('table.title')} onClose={onClose}>
          <p className="nq-table__where">{t('table.label', { table: table.label })}</p>
          <div className="nq-table__actions">
            {(['assistance', 'bill'] as ServiceKind[]).map((kind) => (
              <button key={kind} type="button" className={`nq-table__btn ${result?.kind === kind && result.outcome !== 'error' ? 'is-done' : ''}`}
                onClick={() => send(kind)} disabled={busy !== null}>
                <span className="nq-table__icon">
                  {busy === kind ? <span className="nq-spinner" aria-hidden="true" />
                    : <Icon name={result?.kind === kind && result.outcome !== 'error' ? 'check' : kind === 'bill' ? 'receipt' : 'bell'} size={26} />}
                </span>
                {kind === 'bill' ? t('table.bill') : t('table.call')}
              </button>
            ))}
          </div>
          {message && <p className={`nq-table__msg ${result?.outcome === 'error' ? 'is-error' : ''}`} role="status">{message}</p>}
          <p className="nq-muted nq-small">{t('table.note')}</p>
        </Sheet>
      )}
    </>
  );
}
