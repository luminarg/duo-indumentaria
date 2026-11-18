# Módulo de producción

Diseño sobre moldería, escalado de talles y rollo listo para imprimir y
cortar con láser. Está en el panel en **Producción**, en `/panel/produccion`.

## Flujo

1. **Moldería** (`/panel/produccion/moldes`): se crea un modelo, por ejemplo
   "Remera cuello redondo", y se importa cada talle desde un SVG exportado de
   Corel a escala 1:1. Las piezas se detectan solas y se revisa el tipo de
   cada una: frente, espalda, manga izquierda, manga derecha.
2. **Pedido en "Diseño en moldería"** (`/panel/produccion/[id]`):
   - Se elige el artículo del pedido, la variante (jugadores o arquero) y el
     molde.
   - Se sube el fondo como PDF de Corel, dibujado sobre el talle base, y el
     arte de escudo y sponsors.
   - La vista previa muestra todos los talles del pedido, con la grilla de 10
     unidades y la zona segura.
3. **Armar rollo**: acomoda todas las piezas en el ancho de 1550 mm y calcula
   los metros lineales.
4. **Descargar PDF**, o **Guardar y pasar a sublimación**: sube el PDF,
   registra la tizada y pasa el pedido a `sublimacion_estampado`.

## Reglas (del relevamiento)

| Regla | Valor |
| --- | --- |
| Unidad de posición | Ancho máximo de la pieza / 10 |
| Escudo | Centro a 2,5 u del costado izquierdo de quien usa la prenda y 3,5 u bajando desde el punto más alto del hombro |
| Zona segura | Nada importante a menos de 10 mm del contorno (avisa) |
| Número | 200 mm adulto, 170 mm niño (se achica si no entra, y avisa) |
| Nombre | 40 mm; si no entra a lo ancho, se achica en proporción |
| Etiqueta de talle | Abajo a la derecha del dibujo: 3 cm del costado y 7 cm de la base, medido al borde de la etiqueta |
| Contorno láser | Negro RGB 0,0,0, 3 mm por fuera de la línea |
| Separación | 6 mm entre contornos, o sea 12 mm entre líneas de vector |
| Rotación | Solo 0° o 180° (hilo de la tela) |
| Rollo | 1550 mm; tramos de hasta 5 m, una página del PDF por tramo |
| Fuera de las piezas | No se imprime nada (ni rótulos) |

Los valores marcados como `SUPUESTO` en `lib/produccion/defaults.ts` no
salieron del cuestionario y hay que confirmarlos. Son los tamaños del escudo,
la posición del número y el nombre y el alto de la etiqueta. Se pueden
cambiar por diseño desde el panel.

## Rayas que coinciden (armado)

Funciona como el PowerClip de Corel: hay un solo lienzo de fondo por prenda y
cada pieza se recorta de él.

- El frente va centrado sobre la línea de base.
- La espalda va al lado del frente, tocando su costado derecho, en la misma
  línea de base.
- Las mangas se alinean por el punto del hombro.

En cada talle el lienzo se escala en proporción desde el mismo origen, así que
las rayas coinciden en todos los talles. El ajuste fino por modelo se hace
con `model_assembly.offset_x/offset_y`.

## Código

- `lib/produccion/`: el motor, sin dependencias de React ni de Supabase.
  - `rules.ts`: grilla, lados, zona segura.
  - `assembly.ts`: armado sobre el lienzo.
  - `build.ts`: piezas a imprimir, con nombres, números y etiqueta.
  - `nesting.ts`: tizada.
  - `exportPdf.ts`: PDF vectorial con pdf-lib.
  - `svgImport.ts`: importación de moldes, corre en el navegador.
  - `sampleMolds.ts`: moldes de prueba.
- `lib/produccion/produccion.test.ts`: tests del motor. Se corren con
  `npm test`.
- `app/panel/produccion/`: pantallas y server actions.
- `supabase/migrations/027_modulo_produccion.sql`: tablas nuevas, la columna
  `order_items.variant` y el bucket privado `production-files`.

Los PDFs se arman en el navegador, no en Vercel, por el tamaño de los archivos
de rollo. Por la misma razón se suben directo a Storage con URL firmada, sin
pasar por una Server Action.

## Pendiente

- Importar moldes directo desde PDF de Corel. Hoy se usa SVG; falta ver un
  archivo real.
- Validar el armado de mangas y los offsets con un archivo real de rayas.
- Mejorar el acomodo del rollo (nesting real) comparando con la macro actual.
- Borde (contorno) en nombres y números, y tipografías propias por diseño.
- Marcar el arquero desde el formulario del pedido: la columna
  `order_items.variant` ya existe.
