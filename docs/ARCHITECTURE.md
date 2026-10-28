# Arquitectura de NOVANTIQ COFFEE

## 1. Diagnóstico inicial

El proyecto arrancó en una carpeta vacía (sin código, git ni configuración). El entorno disponible:

- Node 26 y npm 11, Git y la CLI de Supabase (vía npx).
- **Sin Docker.** No es posible levantar Supabase en local (`supabase start` lo necesita).
- Sin credenciales de un proyecto Supabase en la nube.
- Con acceso a internet: dependencias, fotos y videos con licencia libre, y Chromium para pruebas.

Consecuencias de diseño:

1. La app debía poder **funcionar y demostrarse sin backend**. Por eso existe el *modo local*.
2. La seguridad de la base de datos (RLS) tenía que **probarse de verdad** sin Docker. Se resolvió con PGlite: Postgres compilado a WASM que ejecuta las mismas migraciones.
3. Todo lo que depende de un proyecto Supabase real quedó escrito y documentado, sin presentarlo como probado. Ver [TESTING.md](TESTING.md).

## 2. Arquitectura

```
                 ┌──────────────── navegador ────────────────┐
  QR ─► /m/slug ─►  Carta pública (React)                     │
                 │    └─ dominio puro: precios, promos,       │
                 │       búsqueda, publicación                │
                 │  Panel /admin (bundle aparte, lazy)        │
                 │    └─ procesa imágenes y videos antes      │
                 │       de subir (WebP, póster, validación)  │
                 │                │                           │
                 │       MenuRepository (contrato único)      │
                 │        ├─ LocalRepository   (IndexedDB)    │
                 │        └─ SupabaseRepository (RPC + Storage)
                 └────────────────┬───────────────────────────┘
                                  │ HTTPS (anon key + JWT)
                 ┌────────────────▼───────────── Supabase ────┐
                 │ PostgREST → funciones SQL (RPC)            │
                 │   public_menu / track_menu_event  (anon)   │
                 │   admin_bundle, save_*, delete_*  (RLS)    │
                 │ PostgreSQL + RLS + FK compuestas por org   │
                 │ Storage: menu-media/{org}/{asset}/…        │
                 │ Edge Function place-order (fase 6)         │
                 └────────────────────────────────────────────┘
```

### Principios

- **Un solo contrato de datos** (`src/data/repository.ts`). La interfaz no sabe qué backend usa.
- **La lógica de negocio es pura** (`src/domain`): no depende de React ni del almacenamiento, y se prueba de forma aislada.
- **La autorización vive en la base de datos.** Las funciones del panel son `SECURITY INVOKER`: aunque una función tuviera un error, RLS sigue filtrando. El visitante anónimo no tiene acceso a ninguna tabla, solo a `public_menu()` y `track_menu_event()`.
- **Aislamiento por diseño, no solo por políticas.** Todas las relaciones usan claves foráneas compuestas `(id, organization_id)`, así que la base de datos rechaza vincular un archivo, una categoría o un producto de otra cafetería.
- **Mismo cálculo de precios en la carta y en el servidor.** `src/domain/pricing.ts` no importa nada y se copia a `supabase/functions/_shared/`. Una prueba falla si las dos copias divergen.
- **La misma regla de publicación en los dos backends.** `buildPublicMenu` (TypeScript) y `public_menu` (SQL) implementan la regla, y una prueba compara sus resultados sobre la demo.

## 3. Estructura de archivos

Ver la sección *Estructura* del [README](../README.md). Criterio de separación:

| Capa | Carpeta | No puede importar |
|---|---|---|
| Dominio | `src/domain` | React, datos, UI |
| Datos | `src/data` | React, UI |
| Demo | `src/demo` | se importa solo desde `data/index.ts` (lazy) y desde las pruebas |
| Interfaz | `src/features`, `src/ui` | — |

## 4. Modelo de datos

Detalle completo en [DATABASE.md](DATABASE.md). Decisiones frente a la lista inicial del pedido:

| Pedido | Decisión | Motivo |
|---|---|---|
| `product_images`, `product_videos` | Una tabla `media_assets` y una tabla `product_media` con un rol (`primary`, `gallery`, `video`, `spin`) | Permite reutilizar un archivo en varios productos, saber dónde se usa cada archivo y bloquear el borrado si está en uso. Un solo flujo de subida. |
| `product_variants` | Grupos de opciones obligatorios de selección única | Una variante (tamaño, leche) es eso. Evita duplicar lógica y permite reutilizar el mismo grupo en muchos productos, con ajustes de precio por producto. |
| `bill_requests` | `service_requests` con `kind = 'bill'` | Mismo flujo que pedir asistencia. Pedir la cuenta **no** es un pago. |
| `users` | `auth.users` de Supabase y `organization_members` | No se duplican usuarios. |
| Combos | Producto con `kind = 'combo'` y la tabla `combo_items` | El combo aparece en la carta como cualquier producto. Su precio es **fijo**: si cambia el precio de un componente, el combo no cambia en silencio. El panel muestra el valor por separado y avisa si el combo no ofrece ahorro. |

## 5. Decisiones de diseño

**Dirección de arte (demo Moka Studio).** Crema cálido (`#F3ECE2`), marrón café casi negro (`#1E1611`) y caramelo (`#8E5426`) como acento. Todos los pares cumplen contraste AA, y hay una prueba que lo verifica. Tipografías: *Fraunces* (serif con eje óptico, cálida y editorial) para títulos y *Manrope* (sans muy legible en tamaños chicos) para textos y precios. Se cargan solo las familias del tema activo, con `display=swap`.

**Composición.** Cada categoría elige entre cuatro presentaciones: *portada* (un producto grande y una grilla), *grilla* (con un producto ancho cada seis), *lista editorial* (líneas de puntos; sirve para productos sin foto) y *carrusel*. Así se evita la sucesión de tarjetas idénticas. La portada ocupa cerca del 88 % de la pantalla, para que el celular deje ver que hay contenido debajo.

**Ficha de producto.** Ocupa la pantalla completa en el celular y es un panel lateral en el escritorio. Se abre con `?producto=slug`, así que el botón "atrás" del teléfono la cierra y se vuelve al mismo lugar de la carta. El total con las opciones elegidas queda siempre visible en una barra inferior.

**Multimedia.** La foto es la alternativa universal. Video y 360° se cargan bajo demanda, y cada modo se identifica con su nombre ("Vista 360° · secuencia de imágenes"). El video de portada no se carga con ahorro de datos, conexión 2G o movimiento reducido.

**360° de la demo.** No había secuencias de cafetería con licencia clara, así que se **renderizaron a partir de modelos procedurales** en three.js (`tools/asset-studio`) y así se documentan. El visor 3D interactivo (GLB) se retiró del producto. En producción conviene usar fotografías reales tomadas alrededor del producto.

**Pedidos (fase 6).** No se construyó un carrito superficial. Están listas la estructura, las reglas, los permisos y la Edge Function; falta la interfaz. El botón "Agregar al pedido" no aparece hasta que exista el flujo completo.

**Analítica.** Anónima: un id aleatorio por pestaña, sin cookies ni datos personales. Distingue visitas, consultas, reproducciones y clics. No hay ningún evento de "venta", porque solo existirá cuando haya pedidos reales. Los rankings se ocultan hasta tener al menos 20 visitas.

## 6. Riesgos técnicos

| Riesgo | Mitigación / estado |
|---|---|
| El adaptador Supabase (JS) no se ejecutó contra un proyecto real | Es una capa delgada sobre RPC. Las funciones SQL que llama **sí** están probadas en PGlite. Primer paso del despliegue: smoke test documentado en DEPLOYMENT.md. |
| La Edge Function `place-order` no se ejecutó en Deno | Pendiente, junto con la fase 6. Su lógica de precios es la misma que está probada. |
| PGlite no es idéntico a Supabase (roles, `storage` simulado) | Las simulaciones son mínimas y están documentadas en `tests/db/harness.ts`. Hay que repetir las pruebas en un proyecto de staging. |
| Modo local: los cambios no llegan a otros dispositivos | Lo advierten el panel, el README y la guía comercial. |
| Peso de las secuencias 360° (cerca de 1,5 MB) | Carga bajo demanda y progresiva. |
| Videos H.264 de Mixkit: licencia válida para la demo | Reemplazarlos por videos propios en cada cliente. |
| Precios en ARS sin decimales | Los importes se guardan en centavos (bigint); la moneda y el idioma son configurables por local. |

## 7. Plan de implementación

| Fase | Estado |
|---|---|
| 1. Diseño y arquitectura | ✅ Completa |
| 2. Carta digital visual | ✅ Completa (demo con 39 productos) |
| 3. Multimedia: galerías, videos, 360° y alternativas | ✅ Completa |
| 4. Panel: productos, categorías, opciones, promociones, multimedia, diseño, QR | ✅ Completa |
| 5. Persistencia y seguridad (migraciones, RLS, multiempresa, pruebas) | ✅ SQL completo y probado en PGlite · ⏳ falta la validación en un proyecto Supabase real |
| 6. Pedidos y comandas | 🟡 Base de datos, reglas, permisos y Edge Function listos · interfaz pendiente |
| 7. Fidelización | 🟡 Base de datos, libro inmutable y permisos listos · interfaz pendiente |
| 8. Lanzamiento | ⏳ Requiere dominio, proyecto Supabase y hosting |

Orden siguiente recomendado: (a) crear el proyecto Supabase y validar el modo producción; (b) tomar fotos reales del primer cliente; (c) fase 6 (carrito → panel del mozo → pantalla de preparación con Realtime); (d) fase 7.
