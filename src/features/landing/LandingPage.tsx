import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_SLUG, publicOrigin, withBase } from '../../config/env';
import { QrImage } from '../../ui/QrCanvas';
import { ensureFonts } from '../../theme/applyTheme';
import './landing.css';

const FEATURES = [
  { t: 'Carta editorial', d: 'Portada con video, fotografía grande, composiciones variadas y tipografía cuidada.' },
  { t: 'Tarjeta de fidelidad', d: 'Sellos digitales sin app ni registro: el cliente vuelve por su premio.' },
  { t: 'Opciones de bebida', d: 'Tamaños, leches y extras reutilizables, con precio actualizado en vivo.' },
  { t: 'Panel sin código', d: 'Productos, precios, fotos, videos, promociones, diseño y QR desde un panel propio.' },
  { t: 'Promociones con horario', d: 'Vigencia por fecha, día y hora. Lo vencido deja de mostrarse solo.' },
  { t: 'Listo para crecer', d: 'Arquitectura preparada para pedidos, comandas por estación y club de beneficios.' },
];

export default function LandingPage() {
  const { origin, reachableFromPhone } = publicOrigin();
  const demoUrl = `${origin}/m/${DEMO_SLUG}`;
  useEffect(() => {
    document.title = 'NOVANTIQ COFFEE · Cartas digitales premium';
    ensureFonts(['Fraunces', 'Manrope']);
  }, []);

  return (
    <div className="lp">
      <header className="lp-top">
        <span className="lp-brand">NOVANTIQ <em>COFFEE</em></span>
        <Link to="/admin" className="lp-top__link">Panel</Link>
      </header>

      <section className="lp-hero">
        <div className="lp-hero__text">
          <p className="lp-eyebrow">Cartas digitales para cafeterías, pastelerías y brunch</p>
          <h1>Que la carta se pruebe con los ojos.</h1>
          <p className="lp-lead">
            NOVANTIQ COFFEE convierte el menú de una cafetería en una experiencia visual: fotos que abren el apetito,
            videos de barra, tarjeta de fidelidad, carta en tres idiomas y un panel para mantener todo al día sin depender de nadie.
          </p>
          <div className="lp-actions">
            <Link to={`/m/${DEMO_SLUG}`} className="lp-btn">Abrir la demo · Moka Studio</Link>
            <Link to="/admin" className="lp-btn lp-btn--ghost">Ver el panel</Link>
          </div>
          <div className="lp-qr">
            <QrImage text={`${demoUrl}?qr=landing`} size={132} label="Código QR de la carta de demostración" />
            <div>
              <strong>Escaneala con tu celular</strong>
              <p>{reachableFromPhone ? 'Abre la carta directo, sin descargar nada.' : 'Estás en localhost: configurá VITE_PUBLIC_BASE_URL o abrí la app con la IP de tu red para escanear desde el celular.'}</p>
              <code>{demoUrl}</code>
            </div>
          </div>
        </div>
        <div className="lp-phone" aria-label="Vista previa de la carta en un celular">
          <div className="lp-phone__frame">
            <iframe src={withBase(`/m/${DEMO_SLUG}`)} title="Carta de demostración Moka Studio" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="lp-features">
        {FEATURES.map((f, i) => (
          <article key={f.t}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <h2>{f.t}</h2>
            <p>{f.d}</p>
          </article>
        ))}
      </section>

      <footer className="lp-foot">
        <p>NOVANTIQ COFFEE · una plataforma de la agencia NOVANTIQ. “Moka Studio” es una cafetería ficticia de demostración.</p>
      </footer>
    </div>
  );
}
