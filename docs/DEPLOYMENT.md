# Guía de despliegue

## 1. Supabase
1. Creá un proyecto en supabase.com (región São Paulo, para clientes en Argentina).
2. Vinculalo e instalá el esquema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push            # aplica supabase/migrations
   psql "<connection string>" -f supabase/seed.sql   # demo (opcional)
   ```
3. **Auth:** dejá el registro público **desactivado**. Creá los usuarios del panel en *Authentication → Users* y asignalos:
   ```sql
   insert into organization_members (organization_id, user_id, role)
   select o.id, u.id, 'owner' from organizations o, auth.users u
   where o.slug = 'moka-studio' and u.email = 'dueno@ejemplo.com';
   insert into platform_admins (user_id) select id from auth.users where email = 'equipo@novantiq.com';
   ```
4. **Storage:** la migración crea el bucket `menu-media` (público, 40 MB, solo tipos de imagen y video).
5. **Edge Function (fase 6):** `npm run sync:shared && npx supabase functions deploy place-order`.

## 2. Variables de entorno (hosting)
| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anon |
| `VITE_PUBLIC_BASE_URL` | `https://carta.tudominio.com` |
| `VITE_MEDIA_BUCKET` | `menu-media` |

La service role key **solo** vive en Supabase (Edge Functions). Nunca va al frontend ni al repositorio.

## 3. Hosting y dominio
Cualquier hosting estático sirve (Vercel, Netlify o Cloudflare Pages). Configuración:
- Comando de build: `npm run build`. Carpeta de salida: `dist`.
- **Reescritura SPA:** todas las rutas a `/index.html` (en Vercel, `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`).
- Dominio, por ejemplo `carta.novantiq.com`, con las cartas en `/m/{slug}`. Los subdominios por cliente (`moka.novantiq.com`) se pueden agregar con un wildcard DNS y una regla que lea el subdominio; no están implementados.
- Agregá el dominio en *Supabase → Auth → URL configuration*.

## 4. Seguridad: lista de control
- [ ] Registro público desactivado en Auth.
- [ ] RLS activo en todas las tablas (lo hacen las migraciones). Verificar en *Database → Advisors*.
- [ ] Ninguna clave secreta en `.env*` versionado (`.gitignore` las excluye).
- [ ] HTTPS en el dominio.

## 5. Pruebas finales (smoke test en el proyecto real)
1. `npm test` (incluye RLS en PGlite) y `npm run test:e2e`.
2. Con la app apuntando a Supabase: abrir `/m/moka-studio` en modo incógnito → la carta carga.
3. Iniciar sesión en `/admin`, cambiar un precio y comprobar que se ve en otro celular.
4. Subir una imagen → aparece en Storage, en `menu-media/<org>/…`.
5. Con un usuario de otra cafetería, comprobar que no ve Moka Studio.
6. Escanear el QR impreso desde un celular con datos móviles.
