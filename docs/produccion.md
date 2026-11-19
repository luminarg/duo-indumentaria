# Módulo de producción

Diseño sobre moldería, escalado de talles y rollo listo para imprimir y
cortar con láser. Está en el panel en **Producción**, en `/panel/produccion`.

## Flujo

1. **Moldería** (`/panel/produccion/moldes`): se crea un modelo, por ejemplo
   "Remera clásica", y se importa la moldería exportada de Corel a escala
   1:1, en PDF o SVG.
   - Puede venir un talle por archivo o todos juntos. Si debajo de cada grupo
     de piezas está escrito el talle, se asigna solo. Si algún rótulo está
     pasado a curvas, se deduce por la serie (2, 4, 6… → 10, 12, 14) y avisa.
   - Las líneas de 3 mm de Corel se leen como el contorno: la pieza es el
     borde interior.
   - Antes de guardar se revisan el talle de cada grupo y el tipo de cada
     pieza: frente, espalda, manga izquierda, manga derecha.
2. **Pedido en "Diseño en moldería"** (`/panel/produccion/[id]`):
   - Se elige el artículo del pedido, la variante (jugadores o arquero) y el
     molde.
   - Se sube el diseño: el PDF de Corel con las piezas ya diseñadas sobre un
     talle, como se trabaja hoy. El sistema reconoce cada pieza, sobre qué
     talle está hecho y el color de fondo.
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
| Talle en la esquina | En todas las piezas: la letra del talle (5 mm) en una esquina de la base, contra el borde y 1 mm adentro de la línea (queda dentro del ruedo, no pisa el contorno) |
| Indicador de talle | Opcional, solo en el frente: arte subido como el escudo (sin la letra), ubicado con la grilla (0,8 u del costado izquierdo de quien usa, 2,4 u desde la base); la letra del talle se agrega encima |
| Contorno láser | Negro RGB 0,0,0, 3 mm por fuera de la línea |
| Separación | 6 mm entre contornos, o sea 12 mm entre líneas de vector |
| Rotación | Solo 0° o 180° (hilo de la tela) |
| Rollo | 1550 mm; tramos de hasta 5 m, una página del PDF por tramo |
| Fuera de las piezas | No se imprime nada (ni rótulos) |

Los valores marcados como `SUPUESTO` en `lib/produccion/defaults.ts` no
salieron del cuestionario y hay que confirmarlos. Son los tamaños del escudo,
la posición del número y el nombre. Se pueden
cambiar por diseño desde el panel.

## Diseño sobre las piezas de un talle (modo por defecto)

Cada pieza de cualquier talle toma el arte de su pieza en el diseño. Ese arte
se escala en proporción al ancho, desde el centro y el punto más alto del
hombro. Con eso, todo lo que está dibujado en el arte (escudo, logos, frases)
cae en las mismas unidades de la grilla de 10 en todos los talles: es la
misma regla que se aplica a mano.

- Las piezas giradas 180° en el archivo se reconocen y se enderezan.
- El arte se recorta 1,5 mm hacia adentro de la línea de la pieza del diseño,
  para que no aparezca esa línea al escalar. Ese borde cae en la costura y lo
  cubre el color de fondo.
- Si en otro talle la pieza es más larga en proporción, lo que no cubre el
  arte queda con el color de fondo.
- Las piezas del diseño que no están en la moldería (por ejemplo, el cuello)
  no se usan.

Importante: el PDF de diseño va **sin** el talle de las esquinas y **sin** el
indicador de talle, porque esos los agrega el sistema con la letra de cada
talle. Si quedan dibujados en el diseño, en los otros talles aparecería la
letra del talle base.

## Fondo continuo (modo "lienzo"): rayas que coinciden

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
  - `vectorImport.ts`: importación de moldes desde SVG, y la agrupación por
    talle de SVG y PDF.
  - `pdfImport.ts`: lectura de PDF de Corel.
  - `designDetect.ts`: reconoce las piezas del PDF de diseño.
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

- Sumar el cuello (tira) a la moldería, si se imprime en el mismo rollo.
- Validar el armado de mangas y los offsets con un archivo real de rayas.
- Mejorar el acomodo del rollo (nesting real) comparando con la macro actual.
- Borde (contorno) en nombres y números, y tipografías propias por diseño.
- Marcar el arquero desde el formulario del pedido: la columna
  `order_items.variant` ya existe.

## Fuentes

- Se suben desde cualquier selector de fuente del diseño ("Subir fuente .ttf / .otf…"). Quedan en la biblioteca común (`production-files/fuentes/`), disponibles para todos los pedidos.
- Se elige una fuente por separado para el **número**, el **nombre**, el **talle de la esquina** y la **letra del indicador**. Por defecto, Helvetica Bold.
- El alto configurado es el de las mayúsculas/cifras: el sistema lo respeta con cualquier fuente, y el ancho del nombre se mide con la fuente real (si no entra, se achica).
- En el PDF del rollo la fuente va embebida (solo los caracteres usados), así que la impresora no necesita tenerla instalada.
- Si se borra una fuente que usa un diseño guardado, el PDF no se genera hasta elegir otra.

## Cuellos

- Opcional, por diseño ("Cuellos sublimados"): cuando el cuello es tela de color, se deja apagado.
- Van al final del rollo, separados de las piezas por la misma separación de 6 mm: tiras de 4 cm a todo el ancho útil, pegadas una abajo de otra, con una línea fina que contrasta entre cada una. No llevan marcas de largo: la costurera corta a demanda.
- Cantidad de tiras = prendas ÷ cuellos por tira (por defecto 3: 30 remeras → 10 tiras), redondeado para arriba, más las "tiras de más" que se pidan.
- Color: el de la tira o, si se deja vacío, el color de fondo del diseño. Se puede subir un PDF (rayas, textura) que se repite a lo largo de la tira, a su alto.
- Si el panel es más largo que un tramo, sigue en el próximo cortando siempre entre tiras.

## Plantillas de diseño (sin Corel)

- En el pedido, "Tipo de diseño" → **Plantilla del sistema**. Se elige una plantilla, sus medidas (en mm del talle base) y hasta 4 colores.
- Las formas se generan sobre la **prenda armada** (frente, espalda y mangas en su lugar, como el PowerClip): cada pieza se recorta de ahí, así las rayas coinciden en las costuras. Con "Se agranda en proporción", cada talle escala el diseño con su ancho.
- Plantillas del sistema: liso; rayas verticales, horizontales y diagonales; banda diagonal; franja en el pecho; chevron (también en la espalda); degradé (2 o 3 colores, sombreado real del PDF); puntos degradé (halftone); triángulos low poly; rombos (argyle); hexágonos; manchas (camuflado).
- "Mangas: color liso" deja las mangas de un color (útil con chevron o bandas).
- **Plantillas propias:** dibujadas en Corel y exportadas a SVG o PDF. Colores marcadores: rojo puro #FF0000 = Color 1, verde #00FF00 = Color 2, azul #0000FF = Color 3, amarillo #FFFF00 = Color 4; los demás colores quedan fijos. Se guardan en `design_templates` (migración 030) y quedan para todos los pedidos.
- El PDF del fondo se genera al exportar el rollo (no se guarda en Storage): el diseño guarda la plantilla, los parámetros y los colores.

## Rollo con varios pedidos

- Producción → **Rollo con varios pedidos**. Lista todas las prendas (pedido × artículo × prenda del combo × variante) de los pedidos en diseño, cerrados o cortando; se eligen las que tienen diseño guardado.
- Cada prenda usa su diseño guardado (fondo, plantilla, escudo, fuentes, cuellos). El rollo se arma junto, se retoca y se exporta igual que el de un pedido.
- Al guardar se registra qué prendas lleva (`production_layout_items`, migración 031). Un pedido pasa a sublimación cuando todas sus prendas tienen rollo, propio o compartido.

## Retoque manual del rollo

- En la vista del rollo: tocar una pieza la selecciona, arrastrarla la mueve, "Girar 180°" la da vuelta; flechas para correr de a 5 mm; "Deshacer".
- Cada cambio se valida: separación entre contornos, ancho útil, paños (ninguna pieza partida) y panel de cuellos. Las piezas que no cumplen quedan en rojo y no se puede exportar hasta corregirlas.

## Mockup

- En el pedido, "Mockup (frente y espalda)": se elige una prenda (talle, nombre, número) y se genera la prenda armada con el mismo arte del rollo. Las mangas se muestran por la mitad, como apoyada en la mesa.
- Se descarga en PNG (para WhatsApp/mail) o PDF vectorial, y se puede guardar en los recursos del pedido como "mockup".
- La imagen se genera en el navegador con pdf.js (`public/pdf.worker.min.mjs`, misma versión que `pdfjs-dist`: si se actualiza el paquete, copiar el worker de `node_modules/pdfjs-dist/build/`).
