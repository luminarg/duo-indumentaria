import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Protege todo lo que está bajo /panel: si no hay sesión, redirige a /panel/login.
// El resto del sitio (home, catálogo, /pedido/[token]) queda público.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPanelRoute = request.nextUrl.pathname.startsWith("/panel");
  const isLoginRoute = request.nextUrl.pathname === "/panel/login";

  if (isPanelRoute && !isLoginRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/panel/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/panel/:path*"],
};
