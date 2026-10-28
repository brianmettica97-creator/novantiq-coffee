import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MenuRepository, Membership, Session } from '../../data/repository';
import { RepositoryError } from '../../data/repository';
import type { OrganizationBundle } from '../../domain/types';
import { getRepository } from '../../data';

interface Toast { id: number; text: string; tone: 'ok' | 'error' }

interface AdminState {
  repo: MenuRepository;
  session: Session;
  membership: Membership;
  memberships: Membership[];
  bundle: OrganizationBundle;
  orgId: string;
  canEdit: boolean;
  reload: () => Promise<void>;
  selectOrg: (id: string) => void;
  /** Ejecuta una operación, recarga los datos y muestra el resultado. */
  run: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | undefined>;
  notify: (text: string, tone?: Toast['tone']) => void;
}

const Ctx = createContext<AdminState | null>(null);

export function useAdmin() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin fuera de AdminProvider');
  return v;
}

export function errorText(e: unknown) {
  if (e instanceof RepositoryError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Ocurrió un error inesperado.';
}

type Boot =
  | { status: 'loading' }
  | { status: 'anonymous'; repo: MenuRepository }
  | { status: 'no-org'; repo: MenuRepository; session: Session }
  | { status: 'ready'; repo: MenuRepository; session: Session; memberships: Membership[]; orgId: string; bundle: OrganizationBundle };

export function AdminProvider({ children, login }: { children: ReactNode; login: (repo: MenuRepository) => ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const load = useCallback(async (preferredOrg?: string) => {
    const repo = await getRepository();
    const session = await repo.getSession();
    if (!session) { setBoot({ status: 'anonymous', repo }); return; }
    const memberships = await repo.listMemberships();
    if (!memberships.length) { setBoot({ status: 'no-org', repo, session }); return; }
    let stored: string | null = null;
    try { stored = localStorage.getItem('nq-admin-org'); } catch { /* sin storage */ }
    const orgId = [preferredOrg, stored].find((id) => id && memberships.some((m) => m.organization.id === id))
      ?? memberships[0].organization.id;
    const bundle = await repo.getBundle(orgId);
    setBoot({ status: 'ready', repo, session, memberships, orgId, bundle });
  }, []);

  useEffect(() => {
    load().catch(() => setBoot({ status: 'loading' }));
    let unsub = () => {};
    getRepository().then((r) => { unsub = r.onAuthChange(() => { load(); }); });
    return () => unsub();
  }, [load]);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);

  if (boot.status === 'loading') return <div className="ad-boot"><span className="nq-spinner" /> Cargando panel…</div>;
  if (boot.status === 'anonymous') return <>{login(boot.repo)}</>;
  if (boot.status === 'no-org') {
    return (
      <div className="ad-boot">
        <h1>Sin cafeterías asignadas</h1>
        <p>Tu usuario ({boot.session.email}) no pertenece a ninguna cafetería. Pedile acceso al propietario o a NOVANTIQ.</p>
        <button className="ad-btn" onClick={() => boot.repo.signOut()}>Cerrar sesión</button>
      </div>
    );
  }

  const membership = boot.memberships.find((m) => m.organization.id === boot.orgId)!;
  const value: AdminState = {
    repo: boot.repo,
    session: boot.session,
    memberships: boot.memberships,
    membership,
    bundle: boot.bundle,
    orgId: boot.orgId,
    canEdit: membership.role === 'owner' || membership.role === 'admin',
    reload: () => load(boot.orgId),
    selectOrg: (id) => {
      try { localStorage.setItem('nq-admin-org', id); } catch { /* sin storage */ }
      load(id);
    },
    notify,
    run: async (fn, okText) => {
      try {
        const r = await fn();
        await load(boot.orgId);
        if (okText) notify(okText);
        return r;
      } catch (e) {
        notify(errorText(e), 'error');
        return undefined;
      }
    },
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="ad-toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`ad-toast ad-toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>{t.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}
