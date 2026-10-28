# Pruebas

Última ejecución: **81 pruebas Vitest ✅ · 34 pruebas Playwright ✅** (17 escenarios × celular Pixel 7 y escritorio).

| Archivo | Cubre |
|---|---|
| `src/domain/pricing.test.ts` | Variantes, adicionales, descuentos, cantidad, combinaciones inválidas, overrides |
| `src/domain/domain.test.ts` | Publicación, productos por categoría, ocultos, promociones y vigencia, búsqueda sin acentos, horarios, validación de archivos, URLs de video, contraste de temas |
| `src/data/local/localRepository.test.ts` | CRUD, permisos por rol, aislamiento, archivos en uso, reinicio de la demo, analítica |
| `src/features/menu/MenuView.test.tsx` | Render de la carta, precio en vivo, modos de visualización, 360° identificado, agotado, búsqueda |
| `tests/db/rls.test.ts` | **Postgres real (PGlite):** carta pública idéntica a la del frontend, anon sin acceso a tablas, aislamiento entre cafeterías (lectura, escritura, secuestro de ids, FK compuestas, Storage), permisos de staff y admin, módulos del plan, reinicio de la demo, CRUD, pedidos (idempotencia, comandas por estación, nada "listo" con pendientes, histórico inmutable), fidelización (sin autocarga, sin canje sin saldo, libro inmutable) |
| `tests/shared-code.test.ts` | Motor de precios idéntico en la Edge Function; ninguna clave privada en el frontend |
| `tests/e2e/menu.spec.ts` | Sin scroll horizontal, fotos con `object-fit: cover`, controles táctiles, precio por variante, volver al mismo lugar, video bajo demanda, imagen caída, giro 360°, búsqueda, carta inexistente |
| `tests/e2e/admin.spec.ts` | Panel sin sesión, cambio de precio que se ve en la carta, crear, previsualizar y publicar, ordenar categorías, subir y reemplazar imágenes, rechazo de formatos, QR |

Las pruebas encontraron y permitieron corregir tres defectos reales: el video que no arrancaba en celulares, la barra de precio de la ficha que se desplazaba sobre las opciones y un `play()` sin promesa en navegadores antiguos.

## Pendientes (no ejecutadas)
- **Proyecto Supabase real:** el adaptador JS (`supabaseRepository.ts`), Auth y la subida a Storage. Las funciones SQL sí están probadas en PGlite.
- **Edge Function `place-order`** en el runtime Deno.
- **Safari / iPhone real** (WebKit no instalado) y **dispositivos físicos Android**. Se probó con emulación de Chromium.
- **Reproducción de video** en Playwright (Chromium no incluye H.264). Se verifica la descarga bajo demanda, no la decodificación.
- Medición de rendimiento con Lighthouse en una red móvil real.
