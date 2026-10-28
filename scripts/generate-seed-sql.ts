// Genera supabase/seed.sql a partir de la MISMA definición de la demo que usa
// el modo local (src/demo/mokaStudio.ts). Así ambos modos muestran lo mismo.
// Uso: npm run seed:generate
import { writeFileSync } from 'node:fs';
import { buildMokaStudioBundle } from '../src/demo/mokaStudio';

const bundle = buildMokaStudioBundle();
const org = bundle.organization;
const json = JSON.stringify(bundle);
if (json.includes('$seed$')) throw new Error('El bundle contiene el delimitador $seed$');

const sql = `-- GENERADO por scripts/generate-seed-sql.ts — no editar a mano.
-- Cafetería de DEMOSTRACIÓN "${org.name}" (is_demo = true). Precios y datos ilustrativos.
-- Los archivos multimedia de la demo se sirven desde el frontend (/demo/...).

insert into public.organizations (id, slug, name, is_demo, status)
values ('${org.id}', '${org.slug}', '${org.name.replace(/'/g, "''")}', true, 'active')
on conflict (id) do update set name = excluded.name, is_demo = true;

insert into app.demo_snapshots (organization_id, bundle)
values ('${org.id}', $seed$${json}$seed$::jsonb)
on conflict (organization_id) do update set bundle = excluded.bundle, created_at = now();

select app.import_bundle('${org.id}', (select bundle from app.demo_snapshots where organization_id = '${org.id}'));

-- Para administrar la demo: crear un usuario en Auth y luego ejecutar
--   insert into public.organization_members (organization_id, user_id, role)
--   select '${org.id}', id, 'owner' from auth.users where email = 'tu-correo@ejemplo.com';
`;

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), sql);
console.log(`supabase/seed.sql generado (${(sql.length / 1024).toFixed(0)} KB, ${bundle.products.length} productos)`);
