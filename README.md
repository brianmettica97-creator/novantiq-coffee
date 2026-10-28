# NOVANTIQ COFFEE

Plataforma de **cartas digitales premium** para cafeterías, pastelerías y locales de brunch, creada por la agencia NOVANTIQ.

El cliente escanea un QR y entra directo a una carta editorial, sin instalar nada y sin registrarse. La carta tiene portada con video, fotografía grande, fichas con opciones de bebida y precio en vivo, videos bajo demanda, **tarjeta de fidelidad**, **llamar al mozo desde la mesa** y **carta en español, inglés y portugués**. El local la administra desde un panel propio, sin tocar código.

Incluye la demo **Moka Studio**, una cafetería ficticia con 39 productos, 9 categorías, combos, promociones, 7 videos, tarjeta de fidelidad y traducciones a inglés y portugués.

| | |
|---|---|
| Carta pública | `/m/{slug}`, por ejemplo `/m/moka-studio` |
| Panel | `/admin` |
| Presentación comercial | `/` (landing con QR y vista previa en un celular) |

## Tecnologías

- **Frontend:** React 19, TypeScript, Vite 8 y React Router. CSS propio con variables de tema, sin framework de UI.
- **Backend:** Supabase (PostgreSQL, Auth, Storage, RLS y Edge Functions).
- **Validación:** Zod en el frontend y restricciones y funciones en PostgreSQL.
- **Pruebas:** Vitest, Testing Library, PGlite (Postgres real en WASM, para RLS) y Playwright.

La justificación de cada elección está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Dos modos de datos

| Modo | Cuándo | Qué hace |
|---|---|---|
| **Local** | Sin variables de Supabase | Guarda todo en el navegador (IndexedDB). Sirve para demos y desarrollo. Los cambios del panel **solo se ven en ese navegador**. |
| **Supabase** | Con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` | Producción: multiempresa, Auth real, Storage y RLS. Los cambios se ven en todos los celulares. |

El panel muestra un aviso permanente cuando está en modo local.

## Instalación

Requisitos: Node 20 o superior (probado con Node 26) y npm.

```bash
npm install
npm run dev            # http://localhost:5173  (también disponible en tu red local)
```

**Acceso al panel en modo local:** `demo@novantiq.coffee` / `moka2026`. Es solo una barrera de demostración; la autenticación real llega al conectar Supabase.

**Para escanear el QR desde el celular durante el desarrollo:** conectá el celular al mismo Wi-Fi. El QR usa automáticamente la IP de tu red (por ejemplo `http://192.168.x.x:5173`). Si el firewall de Windows pregunta, permití el acceso de Node a redes privadas.

## Configuración

Copiá `.env.example` como `.env.local`. Cada variable está explicada en ese archivo. **Nunca** pongas la *service role key* en variables `VITE_*`.

## Comandos

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck y build de producción en `dist/` |
| `npm run preview` | Sirve el build |
| `npm test` | Pruebas unitarias, de componentes y de base de datos (Vitest + PGlite) |
| `npm run test:db` | Solo las pruebas de seguridad de la base de datos |
| `npm run test:e2e` | Pruebas end-to-end en navegador real (Playwright, celular y escritorio) |
| `npm run lint` | oxlint |
| `npm run seed:generate` | Regenera `supabase/seed.sql` desde la demo |
| `npm run sync:shared` | Copia el motor de precios a las Edge Functions |
| `npm run media:demo` | Descarga y optimiza fotos y videos de la demo |

La primera vez que corras las pruebas end-to-end: `npx playwright install chromium`.

## Estructura

```
src/
  domain/        Lógica de negocio pura: tipos, precios, promociones, búsqueda, validación
  data/          Contrato del repositorio y sus implementaciones (local y Supabase)
  features/
    menu/        Carta pública (portada, secciones, ficha, multimedia, búsqueda)
    admin/       Panel (páginas, procesamiento de archivos, estilos)
    landing/     Página comercial
  theme/         Paletas y aplicación de temas
  demo/          Contenido de la demo Moka Studio (aislado de la lógica)
  ui/            Componentes compartidos (imagen adaptable, íconos, QR)
supabase/
  migrations/    Esquema, RLS, API SQL, operaciones y fidelización, Storage
  functions/     Edge Function place-order (fase 6) y código compartido
  seed.sql       Demo (generado)
tests/
  db/            RLS y reglas de negocio contra Postgres real
  e2e/           Playwright
scripts/         Pipelines de medios, seed y sincronización
docs/            Arquitectura, base de datos, guías
```

## Documentación

- [Arquitectura, decisiones, riesgos y plan](docs/ARCHITECTURE.md)
- [Base de datos, RLS y migraciones](docs/DATABASE.md)
- [Guía administrativa](docs/ADMIN_GUIDE.md)
- [Guía de despliegue](docs/DEPLOYMENT.md)
- [Guía comercial](docs/SALES_GUIDE.md)
- [Pruebas: qué está cubierto y qué falta](docs/TESTING.md)
- [Créditos y licencias de medios](docs/CREDITS.md)
