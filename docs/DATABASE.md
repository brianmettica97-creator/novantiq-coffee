# Base de datos

PostgreSQL en Supabase. Migraciones versionadas en `supabase/migrations/`:

| Migración | Contenido |
|---|---|
| `…0100_core_schema.sql` | Organizaciones, miembros, multimedia, configuración, tema, catálogo, promociones, mesas, QR, analítica y auditoría |
| `…0200_security_rls.sql` | Helpers de rol, privilegios y políticas RLS del catálogo |
| `…0300_api_functions.sql` | API RPC: carta pública, panel, importación, demo y plantillas |
| `…0400_operations_loyalty.sql` | Pedidos, comandas, solicitudes de servicio, clientes y fidelización (fases 6 y 7) |
| `…0500_storage.sql` | Bucket `menu-media` y sus políticas |

## Tablas

### Organización y acceso
- **organizations**: `slug` único (forma la URL pública), `is_demo`, `status` (`active` o `suspended`).
- **organization_members**: `(organization_id, user_id, role)`, donde `role` es `owner`, `admin` o `staff`.
- **platform_admins**: usuarios de NOVANTIQ con acceso a todo.
- **organization_settings**: textos, contacto, horarios (jsonb), moneda, zona horaria, `menu_published`, `section_order` y `features` (módulos contratados; **solo los modifica un platform admin**, lo impone un trigger).
- **menu_themes**: paleta (validada como `#RRGGBB`), tipografías de una lista aprobada y estilos.
- **menu_badges**: etiquetas destacables configurables. `requires_evidence` marca las que necesitan datos reales, como "Más vendido".

### Catálogo
- **menu_categories**: nombre, `slug`, `layout` (`feature`, `grid`, `list` o `carousel`), `visible` y `position`.
- **menu_products**: precio en centavos, `status` (`draft`, `published` o `archived`), `available` (agotado), `kind` (`item` o `combo`), alérgenos, etiquetas, ingredientes, `display_mode`, `station` (para las comandas) y recomendaciones.
- **media_assets**: `kind` (`image`, `video` o `spin`), variantes WebP, placeholder, póster, fotogramas, `storage_prefix` (siempre dentro de la carpeta de la organización) y punto focal.
- **product_media**: producto ↔ archivo con un rol (`primary`, `gallery`, `video` o `spin`).
- **option_groups** y **option_choices**: grupos reutilizables con mínimo y máximo, y opciones con diferencia de precio.
- **product_option_links**: producto ↔ grupo, con `overrides` jsonb (precio o disponibilidad por producto).
- **combo_items**: componentes del combo y sustitutos permitidos.
- **promotions**: `kind` (`announcement`, `percent_off` o `combo_price`), vigencia por fecha, días y horario (en la zona horaria del local), y las restricciones de coherencia correspondientes.

### Mesas, QR y analítica
- **restaurant_tables** y **qr_codes**: `token` aleatorio de 12 caracteres que no revela nada. Al revocarlo, el QR impreso sigue abriendo la carta pero deja de asociarse a una mesa.
- **menu_analytics**: eventos anónimos (`menu_view`, `product_view`, `media_play`…). No existe ningún evento de venta.
- **audit_logs**: los triggers registran quién cambió qué (antes y después) en catálogo, configuración, multimedia, QR y miembros.

### Operaciones (fase 6)
- **orders**: `idempotency_key` única por organización (evita pedidos duplicados) y una restricción `total = subtotal - descuento`.
- **order_items**: guarda el **nombre, el precio y las opciones del momento del pedido**, para que los cambios del catálogo no alteren el historial.
- **order_status_history**, **kitchen_tickets** (una comanda por estación) y **service_requests** (`assistance` o `bill`).
- Funciones: `set_order_status` (solo transiciones válidas; no permite marcar "listo" si quedan ítems pendientes) y `set_ticket_status` (cuando todas las estaciones terminan, el pedido pasa solo a "listo").

### Fidelización (fase 7)
- **customers**: datos mínimos y consentimiento de comunicaciones fechado.
- **loyalty_programs** (reglas en jsonb), **loyalty_memberships** (código de miembro aleatorio) y **loyalty_transactions**, un libro **inmutable** (un trigger impide modificar o borrar). El saldo se calcula con la vista `loyalty_balances`.
- `record_loyalty_transaction`: solo la usa el personal, registra al autor e impide canjes sin saldo.

## Relaciones y aislamiento

Todas las referencias internas usan **claves foráneas compuestas** `(id, organization_id)`. Ejemplo:

```sql
foreign key (asset_id, organization_id) references media_assets (id, organization_id)
```

Un producto de la cafetería A no puede apuntar a una foto de la cafetería B, aunque alguien manipule la solicitud.

## Políticas RLS

| Rol | Puede |
|---|---|
| anon | Nada directo. Solo `public_menu(slug)` (contenido publicado) y `track_menu_event(...)` (valida tipo, ids y longitudes, con un límite de 120 eventos por minuto y sesión) |
| staff | Leer el panel, la analítica, los pedidos y las comandas de su local. Cambiar estados de pedidos y comandas y registrar puntos |
| admin | Lo anterior, más editar carta, multimedia, diseño, QR y promociones |
| owner | Lo anterior, más gestionar miembros y reiniciar la demo |
| platform admin | Todo, incluidos los módulos del plan y la creación de cafeterías |
| cliente registrado | Ver sus propios datos y movimientos de fidelización |

Storage: lectura pública del bucket `menu-media`. Para escribir, el primer segmento de la ruta tiene que ser una organización donde el usuario sea owner o admin.

## API (RPC)

| Función | Acceso | Descripción |
|---|---|---|
| `public_menu(slug)` | anon | Carta publicada o `null` |
| `track_menu_event(...)` | anon | Analítica validada |
| `my_memberships()` | auth | Cafeterías del usuario |
| `admin_bundle(org)` | miembro | Todo lo que necesita el panel |
| `save_category`, `delete_category`, `reorder_categories` | admin | Gestión de categorías |
| `save_product`, `duplicate_product`, `reorder_products` | admin | Gestión de productos |
| `save_option_group`, `delete_option_group` | admin | Mantiene los ids de las opciones al editar |
| `save_promotion`, `delete_promotion` | admin | |
| `register_media`, `replace_media_files`, `update_media`, `delete_media` | admin | Exigen URLs dentro de la carpeta de la organización y bloquean el borrado de archivos en uso |
| `save_settings`, `save_theme` | admin | `features` se ignora |
| `create_qr_code`, `revoke_qr_code` | admin | |
| `analytics_summary(org, days)` | miembro | |
| `reset_demo_organization(org)` | owner de una org demo | Restaura desde `app.demo_snapshots` |
| `app.create_organization(slug, name, email, template)` | platform admin o SQL | Alta de un cliente, opcionalmente copiando una plantilla |

Los errores de negocio llevan un prefijo (`forbidden:`, `conflict:`, `invalid:` o `not_found:`) y el panel los muestra tal cual.

## Datos de demostración

`supabase/seed.sql` se **genera** desde `src/demo/mokaStudio.ts` (`npm run seed:generate`). Crea la organización `moka-studio` con `is_demo = true`, guarda una copia en `app.demo_snapshots` y la importa. Los archivos de la demo se sirven desde el frontend (`/demo/moka-studio/…`), así que no ocupan Storage.

Para crear un cliente real a partir de la demo:

```sql
select app.create_organization('cafe-aurora', 'Café Aurora', 'duenio@cafeaurora.com', '<id de moka-studio>');
```

La copia tiene ids nuevos, queda **sin publicar** y no se mezcla con la demo.
