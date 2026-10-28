# Guía del panel administrativo

Entrá a `/admin`. En modo local, el usuario de la demo es `demo@novantiq.coffee` / `moka2026`.

## Crear un producto
1. **Productos → Nuevo producto.**
2. Completá el nombre, la categoría y el precio (por ejemplo `4.600` o `4600,50`). El resto de los campos es opcional.
3. **Opciones y variantes:** elegí grupos ya creados (tamaño, leche, extras). Si un producto necesita otro precio para una opción, usá "Ajustar": el cambio afecta solo a ese producto.
4. **Vista previa:** muestra la ficha tal como la verá el cliente, sin guardar.
5. **Guardar** deja el producto como borrador. **Guardar y publicar** lo muestra en la carta.

En la lista de productos podés **agotar o reponer**, publicar o despublicar, **duplicar**, **archivar** y reordenar con ↑ y ↓.

## Categorías
**Categorías → Nueva categoría.** Elegí cómo se presenta: *portada*, *grilla*, *lista editorial* (ideal para productos sin foto) o *carrusel*. Podés ocultarla temporalmente y ordenarla con ↑ y ↓. Solo se puede eliminar si no tiene productos activos.

## Opciones y variantes
Definí un grupo una sola vez (por ejemplo "Tamaño": Chico, Mediano +$900, Grande +$1.600) y usalo en todas las bebidas. *Obligatorio* significa que el cliente tiene que elegir; *mínimo* y *máximo* limitan cuántas opciones puede marcar.

## Imágenes
**Multimedia → Imágenes → Subir imagen** (JPG, PNG, WebP o AVIF hasta 15 MB). El panel genera versiones WebP de 480, 960 y 1600 px y un placeholder difuso. Completá el **texto alternativo** y ajustá el **punto focal** si el recorte corta el producto. **Reemplazar archivo** actualiza la foto en todos los productos que la usan. Los archivos en uso no se pueden eliminar: el panel indica dónde están usados.

## Videos
MP4 (H.264) o WebM, hasta 40 MB y 60 segundos. Conviene que sean cortos (8 a 15 s), horizontales o cuadrados y sin depender del sonido. El póster se genera solo. En la carta, el video se descarga recién cuando el cliente toca reproducir.

## Productos interactivos (360°)
- **Secuencia 360°:** sacá de 24 a 36 fotos girando el producto sobre una base, con la cámara fija y la misma luz, y nombradas en orden (`01.jpg`, `02.jpg`…). Subilas juntas en *Multimedia → Secuencias 360°*.
- En el producto, elegí la **presentación inicial**. Si falta el recurso o falla, la carta muestra la foto.

## Promociones
Tipos: *anuncio*, *descuento porcentual* (cambia el precio mientras está activa) y *combo con precio especial*. Configurá fechas, días y horario, que se toman en la hora del local. Las promociones vencidas o fuera de horario no se muestran.

## Diseño
**Diseño:** elegí un estilo base (Moka, Noir, Pistacho o Rosé), ajustá colores (el panel avisa si falta contraste), tipografías, portada, logo, video de portada y orden de las secciones. Mirá la vista previa y tocá **Publicar diseño**.

## Publicar la carta y generar el QR
- **Datos del local → Carta publicada** activa o desactiva la carta completa.
- **Código QR:** descargalo en PNG o SVG o imprimí la tarjeta de mesa. El QR abre la carta en vivo, así que los cambios de precio no obligan a reimprimirlo. Podés crear QR por mesa y regenerarlos.
