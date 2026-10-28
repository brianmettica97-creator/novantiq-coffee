import { withBase } from '../../config/env';
// Metadatos de la página de cada carta: título, descripción, vista previa al
// compartir (Open Graph) y manifiesto para instalarla como app.
// Nota: WhatsApp e Instagram leen el HTML sin ejecutar JavaScript, así que
// para la vista previa por local hace falta además la función del servidor
// descripta en docs/DEPLOYMENT.md. Estos valores sirven a Google y al navegador.
import type { MenuLanguage, PublicMenu } from '../../domain/types';

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

const absolute = (url: string) => new URL(withBase(url), window.location.origin).href;

export function applyMenuHead(menu: PublicMenu, lang: MenuLanguage) {
  const { organization: org, settings, theme } = menu;
  const title = `${org.name} · ${lang === 'en' ? 'Menu' : lang === 'pt' ? 'Cardápio' : 'Carta'}`;
  const description = settings.tagline || settings.intro || title;
  const cover = menu.media.find((m) => m.id === settings.coverImageAssetId);
  const image = cover && !cover.url.startsWith('idb:')
    ? absolute(cover.variants.find((v) => v.width >= 960)?.url ?? cover.url)
    : absolute('/og-image.jpg');

  document.title = title;
  document.documentElement.lang = lang;
  setMeta('name', 'description', description);
  setMeta('name', 'theme-color', theme.colors.background);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:image', image);
  setMeta('property', 'og:url', absolute(`/m/${org.slug}`));
  setMeta('name', 'twitter:card', 'summary_large_image');

  // Manifiesto propio de la carta: al instalarla abre directo este local.
  const manifest = {
    name: org.name,
    short_name: org.name.slice(0, 12),
    description,
    lang,
    start_url: absolute(`/m/${org.slug}?utm_source=app`),
    scope: absolute(`/m/${org.slug}`),
    display: 'standalone',
    background_color: theme.colors.background,
    theme_color: theme.colors.background,
    icons: [
      { src: absolute('/icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: absolute('/icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
      { src: absolute('/icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  setLink('manifest', `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`);
}
