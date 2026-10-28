import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('código compartido con el backend', () => {
  it('el motor de precios de la Edge Function es idéntico al de la carta', () => {
    const front = readFileSync(new URL('../src/domain/pricing.ts', import.meta.url), 'utf8');
    const edge = readFileSync(new URL('../supabase/functions/_shared/pricing.ts', import.meta.url), 'utf8');
    expect(edge, 'Ejecutá npm run sync:shared').toBe(front);
  });

  it('el motor de precios no importa nada (requisito para Deno)', () => {
    const front = readFileSync(new URL('../src/domain/pricing.ts', import.meta.url), 'utf8');
    expect(front).not.toMatch(/^\s*import\s/m);
  });

  it('ningún archivo del frontend menciona la service role key', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const root = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    for (const file of walk(decodeURIComponent(root))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/SERVICE_ROLE|service_role_key|sb_secret_/i);
    }
  });
});
