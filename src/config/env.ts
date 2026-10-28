// Configuración pública del frontend. Solo variables VITE_* (visibles en el
// navegador): NUNCA poner aquí claves privadas ni la service role de Supabase.
const env = import.meta.env;

declare const __LAN_ADDRESS__: string;

export const config = {
  supabaseUrl: (env.VITE_SUPABASE_URL as string | undefined)?.trim() || '',
  supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '',
  /** Origen público para los QR (p. ej. https://carta.novantiq.com). */
  publicBaseUrl: (env.VITE_PUBLIC_BASE_URL as string | undefined)?.trim().replace(/\/$/, '') || '',
  /** Bucket de Supabase Storage para multimedia de cartas. */
  mediaBucket: (env.VITE_MEDIA_BUCKET as string | undefined)?.trim() || 'menu-media',
};

/** Carpeta donde se publica la app ('/' o, en GitHub Pages, '/repo/'). */
export const BASE_PATH = import.meta.env.BASE_URL;
export const BASE_ROOT = BASE_PATH.replace(/\/$/, '');

/** Antepone la carpeta de publicación a una ruta absoluta del sitio ('/demo/x' → '/repo/demo/x'). */
export const withBase = (path: string) => (path.startsWith('/') ? BASE_ROOT + path : path);

/** Slug de la cafetería de demostración que se muestra en la landing. */
export const DEMO_SLUG = 'moka-studio';

export const useSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);

const isLocalHost = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';

/**
 * Origen que se codifica en los QR. Prioridad: VITE_PUBLIC_BASE_URL; si se
 * está en localhost durante el desarrollo, la IP de la red local (para que un
 * celular en el mismo Wi-Fi pueda abrirlo); si no, el origen actual.
 */
export function publicOrigin(): { origin: string; reachableFromPhone: boolean } {
  if (config.publicBaseUrl) return { origin: config.publicBaseUrl, reachableFromPhone: true };
  const { hostname, port, protocol } = window.location;
  const origin = window.location.origin + BASE_ROOT;
  if (isLocalHost(hostname)) {
    const lan = typeof __LAN_ADDRESS__ === 'string' ? __LAN_ADDRESS__ : '';
    if (lan) return { origin: `${protocol}//${lan}${port ? `:${port}` : ''}${BASE_ROOT}`, reachableFromPhone: true };
    return { origin, reachableFromPhone: false };
  }
  return { origin, reachableFromPhone: true };
}
