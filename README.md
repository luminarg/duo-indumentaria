# Duo Indumentaria

Sitio web + gestión de pedidos para Duo Indumentaria (indumentaria deportiva
personalizada). Ver `docs/schema.md` para el modelo de datos.

## Empezar

1. Copiar `.env.local.example` a `.env.local` y completar con las claves de
   tu proyecto de Supabase (Project Settings > API).
2. Correr `supabase/schema.sql` completo en el SQL Editor de Supabase.
3. `npm install`
4. `npm run dev` y abrir http://localhost:3000

## Estructura

- `app/` — sitio público (home, catálogo) + `/pedido/[token]` (link sin
  login para que el cliente cargue su pedido) + `/panel` (backend, requiere
  login del equipo).
- `lib/supabase/` — clientes de Supabase (browser, server, admin).
- `supabase/schema.sql` — schema completo de la base de datos.
- `proxy.ts` — protege todo `/panel/*` excepto `/panel/login`.

## Deploy (Vercel)

1. Importar el repo de GitHub en Vercel (New Project → seleccionar el repo).
2. Cargar estas variables de entorno en Project Settings → Environment Variables
   (los mismos valores de tu `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (poner el dominio de Vercel una vez que lo tengas)
   - `RESEND_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
     `VAPID_SUBJECT` (opcionales, todavía no están en uso)
3. Deploy. La base de datos ya está armada en Supabase — no hace falta correr
   nada más ahí, solo apuntar a las mismas credenciales.
4. Una vez que Vercel te dé el dominio, actualizar `NEXT_PUBLIC_SITE_URL` con
   ese valor y volver a desplegar (los links de pedido que se generan usan
   esta variable).

## Próximos pasos

Ver la sección "Próximos pasos" en la documentación del proyecto: alta de
clientes, presupuestos con numeración automática, generación de PDFs (cliente
+ ficha técnica), subida de recursos gráficos a Supabase Storage, push
notifications para agenda, panel de configuración del sitio.
