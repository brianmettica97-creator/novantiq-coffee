import type { ID, OrganizationBundle } from './types';

/** Dónde se usa un archivo, en palabras para el administrador. */
export function mediaUsage(b: OrganizationBundle, assetId: ID): string[] {
  const out: string[] = [];
  for (const p of b.products) if (p.media.some((m) => m.assetId === assetId)) out.push(p.name);
  for (const c of b.categories) if (c.imageAssetId === assetId) out.push(`categoría ${c.name}`);
  for (const p of b.promotions) if (p.imageAssetId === assetId || p.videoAssetId === assetId) out.push(`promoción ${p.title}`);
  const s = b.settings;
  if (s.logoAssetId === assetId) out.push('logotipo');
  if (s.coverImageAssetId === assetId) out.push('portada');
  if (s.coverVideoAssetId === assetId) out.push('video de portada');
  return out;
}
