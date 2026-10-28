import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { BASE_PATH, BASE_ROOT } from './config/env';
import { MenuPage } from './features/menu/MenuPage';

// El panel es un bundle aparte: quien escanea el QR nunca lo descarga.
const AdminApp = lazy(() => import('./features/admin/AdminApp'));
const LandingPage = lazy(() => import('./features/landing/LandingPage'));
const boot = <div className="nq-boot"><span className="nq-spinner" /></div>;

export function App() {
  return (
    <BrowserRouter basename={BASE_ROOT || undefined}>
      <Routes>
        <Route path="/" element={<Suspense fallback={boot}><LandingPage /></Suspense>} />
        <Route path="/m/:slug" element={<MenuPage />} />
        <Route
          path="/admin/*"
          element={<Suspense fallback={<div className="nq-boot"><span className="nq-spinner" /> Cargando panel…</div>}><AdminApp /></Suspense>}
        />
        <Route path="*" element={<div className="nq-boot"><h1>Página no encontrada</h1><a href={BASE_PATH}>Ir al inicio</a></div>} />
      </Routes>
    </BrowserRouter>
  );
}
