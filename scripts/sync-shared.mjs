// Copia el motor de precios del frontend a las Edge Functions.
// Uso: npm run sync:shared   (una prueba falla si las copias divergen)
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../supabase/functions/_shared/', import.meta.url), { recursive: true });
copyFileSync(new URL('../src/domain/pricing.ts', import.meta.url), new URL('../supabase/functions/_shared/pricing.ts', import.meta.url));
console.log('pricing.ts sincronizado con supabase/functions/_shared/');
