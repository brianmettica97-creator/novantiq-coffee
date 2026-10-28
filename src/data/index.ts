import { useSupabase } from '../config/env';
import type { MenuRepository } from './repository';

let pending: Promise<MenuRepository> | null = null;

/**
 * Devuelve el repositorio activo. Con VITE_SUPABASE_URL y
 * VITE_SUPABASE_ANON_KEY configuradas se usa Supabase; si no, el modo local.
 * Ambos se cargan bajo demanda: la carta no descarga el que no usa.
 */
export function getRepository(): Promise<MenuRepository> {
  pending ??= (async (): Promise<MenuRepository> => {
    if (useSupabase) {
      const { SupabaseRepository } = await import('./supabase/supabaseRepository');
      return new SupabaseRepository();
    }
    const [{ LocalRepository }, { localDemoSeed }] = await Promise.all([
      import('./local/localRepository'),
      import('../demo/localSeed'),
    ]);
    return new LocalRepository(localDemoSeed());
  })();
  return pending;
}

/** Resuelve URLs de archivos guardados localmente ("idb:…"). */
export async function resolveMediaUrl(url: string): Promise<string | null> {
  if (!url.startsWith('idb:')) return url;
  const r = await getRepository();
  return 'resolveBlobUrl' in r ? (r as MenuRepository & { resolveBlobUrl(u: string): Promise<string | null> }).resolveBlobUrl(url) : null;
}
