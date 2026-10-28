import { withBase } from '../../config/env';
import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { AdminProvider, errorText, useAdmin } from './AdminContext';
import type { MenuRepository } from '../../data/repository';
import { LOCAL_DEMO_LOGIN } from '../../demo/localSeed';
import { Icon } from '../../ui/Icon';
import { Dashboard } from './pages/Dashboard';
import { ProductsPage } from './pages/ProductsPage';
import { ProductEditor } from './pages/ProductEditor';
import { CategoriesPage } from './pages/CategoriesPage';
import { OptionGroupsPage } from './pages/OptionGroupsPage';
import { PromotionsPage } from './pages/PromotionsPage';
import { MediaPage } from './pages/MediaPage';
import { DesignPage } from './pages/DesignPage';
import { QrPage } from './pages/QrPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoyaltyPage } from './pages/LoyaltyPage';
import { ServicePage } from './pages/ServicePage';
import { TranslationsPage } from './pages/TranslationsPage';
import './admin.css';

const NAV = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/mesas', label: 'Avisos de mesas' },
  { to: '/admin/fidelidad', label: 'Tarjeta de fidelidad' },
  { to: '/admin/productos', label: 'Productos' },
  { to: '/admin/categorias', label: 'Categorías' },
  { to: '/admin/opciones', label: 'Opciones y variantes' },
  { to: '/admin/promociones', label: 'Promociones' },
  { to: '/admin/multimedia', label: 'Multimedia' },
  { to: '/admin/diseno', label: 'Diseño' },
  { to: '/admin/idiomas', label: 'Idiomas' },
  { to: '/admin/qr', label: 'Código QR' },
  { to: '/admin/local', label: 'Datos del local' },
];

function Login({ repo }: { repo: MenuRepository }) {
  const [email, setEmail] = useState(repo.mode === 'local' ? LOCAL_DEMO_LOGIN.email : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Ingresar · Panel NOVANTIQ COFFEE'; }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await repo.signIn(email, password);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-login">
      <form className="ad-login__card" onSubmit={submit}>
        <p className="ad-brand">NOVANTIQ <em>COFFEE</em></p>
        <h1>Panel de la cafetería</h1>
        <label className="ad-field">
          <span>Correo</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="ad-field">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="ad-error" role="alert">{error}</p>}
        <button className="ad-btn ad-btn--primary ad-btn--block" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
        {repo.mode === 'local' && (
          <div className="ad-note">
            <strong>Modo local de demostración.</strong> Usá <code>{LOCAL_DEMO_LOGIN.email}</code> / <code>{LOCAL_DEMO_LOGIN.password}</code>.
            En este modo el acceso es solo una barrera de demo: la autenticación real se activa al conectar Supabase.
          </div>
        )}
        <Link to="/" className="ad-muted-link">← Volver al inicio</Link>
      </form>
    </div>
  );
}

function Shell() {
  const { bundle, session, repo, memberships, orgId, selectOrg, membership } = useAdmin();
  const [open, setOpen] = useState(false);
  return (
    <div className="ad">
      <aside className={`ad-side ${open ? 'is-open' : ''}`}>
        <div className="ad-side__head">
          <p className="ad-brand">NOVANTIQ <em>COFFEE</em></p>
          {memberships.length > 1 ? (
            <select className="ad-org" value={orgId} onChange={(e) => selectOrg(e.target.value)} aria-label="Cafetería">
              {memberships.map((m) => <option key={m.organization.id} value={m.organization.id}>{m.organization.name}</option>)}
            </select>
          ) : <p className="ad-org">{bundle.organization.name}</p>}
          <p className="ad-role">{{ owner: 'Propietario', admin: 'Administrador', staff: 'Personal' }[membership.role]}</p>
        </div>
        <nav aria-label="Secciones del panel" onClick={() => setOpen(false)}>
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className="ad-nav">{n.label}</NavLink>)}
        </nav>
        <div className="ad-side__foot">
          <a href={withBase(`/m/${bundle.organization.slug}`)} target="_blank" rel="noreferrer" className="ad-btn ad-btn--block">Ver carta publicada ↗</a>
          <p className="ad-user">{session.email}</p>
          <button className="ad-link" onClick={() => repo.signOut()}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-topbar">
          <button className="ad-icon" onClick={() => setOpen(!open)} aria-label="Abrir menú" aria-expanded={open}><Icon name="menu" /></button>
          <span>{bundle.organization.name}</span>
        </header>
        {repo.mode === 'local' && (
          <div className="ad-banner">
            <strong>Modo local:</strong> los cambios se guardan en este navegador y se ven en la carta de este dispositivo.
            Para publicarlos en todos los celulares, conectá Supabase (ver <code>docs/DEPLOYMENT.md</code>).
          </div>
        )}
        <main className="ad-content">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="productos" element={<ProductsPage />} />
            <Route path="productos/nuevo" element={<ProductEditor />} />
            <Route path="productos/:id" element={<ProductEditor />} />
            <Route path="categorias" element={<CategoriesPage />} />
            <Route path="opciones" element={<OptionGroupsPage />} />
            <Route path="promociones" element={<PromotionsPage />} />
            <Route path="multimedia" element={<MediaPage />} />
            <Route path="diseno" element={<DesignPage />} />
            <Route path="qr" element={<QrPage />} />
            <Route path="local" element={<SettingsPage />} />
            <Route path="fidelidad" element={<LoyaltyPage />} />
            <Route path="mesas" element={<ServicePage />} />
            <Route path="idiomas" element={<TranslationsPage />} />
            <Route path="*" element={<p>Sección inexistente.</p>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function AdminApp() {
  return (
    <AdminProvider login={(repo) => <Login repo={repo} />}>
      <Shell />
    </AdminProvider>
  );
}
