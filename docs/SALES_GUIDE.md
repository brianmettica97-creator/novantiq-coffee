# Guía comercial: cómo presentar NOVANTIQ COFFEE

## Preparación (5 minutos)
1. `npm run dev` en la notebook, con la notebook y el celular del cliente en el mismo Wi-Fi.
2. Abrí `http://localhost:5173`: es la landing, con el QR y un celular simulado con la carta.
3. Antes de cada demo, restaurá los datos: *Panel → Datos del local → Restaurar datos de demostración*.

Para demos fuera de tu red, conviene publicar la app en un hosting (ver DEPLOYMENT.md).

## Recorrido sugerido (10 minutos)
1. **El QR.** Que el dueño lo escanee: entra directo, sin descargar nada.
2. **Portada.** Video de barra, logo, "Abierto / Cerrado" según el horario.
3. **Navegar.** Categorías arriba, buscador (probá "sin tacc" o "cafe frio"), filtros vegano o sin TACC.
4. **Un café.** Abrí el *Cappuccino*: mirá las fotos y el video; cambiá a Grande con leche de avena y mostrá cómo se actualiza el precio.
5. **360°.** *Iced latte* o *Medialuna*: arrastrar para girar.
6. **Video.** *Espresso* o *Filtrado V60*.
7. **Panel.** En la notebook, cambiá el precio del Latte y recargá el celular. ⚠️ En modo local, el cambio solo se ve en el navegador donde se hizo. Para que se vea en el celular del cliente hace falta el modo Supabase o mostrar ambos en la notebook.
8. **Diseño.** Cambiá a la paleta *Noir* y mostrá la vista previa.
9. **QR imprimible** y tarjeta de mesa.

## Qué está implementado
Carta completa, portada con video, 4 estilos de categoría, ficha con opciones y precio en vivo, combos, promociones con horario, búsqueda, filtros, galería, video, 360°, panel completo, QR por mesa, analítica de interacciones, multiempresa con seguridad probada.

## Qué requiere trabajo o integraciones adicionales
- **Proyecto Supabase y hosting** para producción (costo mensual bajo).
- **Pedidos y comandas (fase 6):** base de datos y reglas listas; falta la interfaz.
- **Club de beneficios (fase 7):** base lista; falta la interfaz. Los envíos de mensajes o correos necesitan un proveedor externo.
- **Fotos, videos y 360° del cliente:** producción fotográfica propia.
- Pagos en línea: no incluidos.

## Qué se personaliza por cafetería
Nombre, logo, colores, tipografías (de una lista aprobada), portada (foto o video), estilo de fichas, categorías y su presentación, productos, precios, opciones, combos, promociones, horarios, contacto, redes y QR. Todo desde el panel, sin tocar código.

> Los productos, precios y la dirección de Moka Studio son ficticios. Fotos: Unsplash. Videos: Mixkit. Ver CREDITS.md.
