import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { requireSupabasePublicEnv } from '@/lib/env';
import type { Database } from '@/lib/types/database';

/** Rutas accesibles sin sesión. */
const PUBLIC_PATHS = ['/login', '/signup', '/auth'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * Refresca la sesión de Supabase y redirige según el estado de autenticación.
 *
 * Es una capa de conveniencia, NO la frontera de seguridad. La documentación de
 * Next.js 16 advierte de que las Server Functions no son rutas independientes en
 * la cadena del proxy: se ejecutan como POST sobre la ruta donde se usan, así que
 * un cambio en el `matcher` puede dejarlas sin cobertura en silencio. Por eso
 * cada Server Action y cada Route Handler revalida la sesión por su cuenta con
 * `requireSession()` de lib/auth/session.ts.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = requireSupabasePublicEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valida el JWT contra el servidor de auth. getSession() solo lee la
  // cookie y confía en su contenido, por lo que no sirve para decidir accesos.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);

  if (!user && !publicPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    // Se conserva el destino para volver a él tras iniciar sesión.
    if (pathname !== '/') {
      redirectUrl.searchParams.set('redirectTo', pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (user && publicPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
