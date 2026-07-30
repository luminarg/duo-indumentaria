# Schema de base de datos — Duo Indumentaria

Referencia rápida de las tablas en `supabase/schema.sql`. Correr ese archivo entero en Supabase SQL Editor crea todo de una vez.

## Configuración del negocio
- **business_settings** — fila única con nombre, logo, contacto, colores, tipografía, `show_prices`, % de seña por defecto, textos de presupuesto y del mail automático.
- **site_sliders** — banners/imágenes de la home, con orden y on/off.
- **payment_methods** — métodos de pago habilitados.
- **suppliers** — proveedores.

## Catálogo
- **products** — productos del catálogo (remeras, buzos, etc.), con precio base.
- **product_images** — imágenes por producto.
- **sizes** — talles disponibles (S, M, L, 2, 4, 6...).
- **product_sizes** — qué talles aplican a cada producto (tabla de talles por producto).
- **print_types** — tipos de estampado y su costo adicional.

## Clientes
- **clients** — clubes, colegios, gimnasios, particulares.

## Pedidos (el flujo central)
- **orders** — el pedido en sí. Tiene `public_token` (va en la URL del link que se comparte) y `order_number` (PED-2026-001, automático). Estado va de `borrador` a `entregado`.
- **order_items** — cantidad, talle, color, nombre/número individual por prenda.
- **order_resources** — archivos que sube el cliente (mockup, logo, paleta de colores).
- **order_technical_details** — tela, moldería, notas técnicas (la ficha para el hermano).

## Presupuestos
- **quotes** — se generan desde un pedido. Numeración automática (P-2026-001), % de seña, monto, validez, PDF.

## Compras y gastos
- **purchases** / **expenses** — por pedido o generales, costo presupuestado vs. real.

## Tareas y agenda
- **tasks** / **task_attachments** — kanban con prioridad y vencimiento.
- **agenda_events** — llamadas, reuniones, entregas, con recordatorio push.

## Usuarios
- **profiles** — extiende `auth.users` con rol (`dueno`, `hermano`, `empleado`).

## Cómo funciona el link sin login
El cliente nunca se loguea. El "link único" es simplemente:
`https://tusitio.com/pedido/<public_token>`

El `public_token` se genera solo al crear el pedido. La página en Next.js que lo recibe usa un **Server Action** o **Route Handler** con la *service role key* de Supabase para buscar el pedido por token — no se expone la tabla `orders` completa vía RLS pública, porque cualquiera que adivine un token vería datos de otro cliente. Esto es más seguro y es el patrón que va a usar el scaffolding.

## Numeración automática
Los triggers `trg_set_order_number` y `trg_set_quote_number` arman el número solos al insertar (cuentan cuántos hay ese año + 1). No hace falta generarlos a mano.

## Qué falta decidir más adelante (no bloquea el arranque)
- Reglas finas de permisos por rol (ej. solo `dueno` puede borrar clientes) — hoy cualquier usuario del equipo tiene acceso completo.
- Buckets de Supabase Storage para mockups/logos/PDFs (se crean desde el dashboard, no por SQL).
- Si "mayoristas" o niveles de precio son parte de Duo Indumentaria o no (no estaba en el brief original).
