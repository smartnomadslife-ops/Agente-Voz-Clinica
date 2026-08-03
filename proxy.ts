import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * En Next.js 16 el antiguo `middleware` pasó a llamarse `proxy`, y la función
 * exportada debe llamarse `proxy` (o ser la exportación por defecto).
 *
 * El runtime es Node.js por defecto y NO se puede cambiar: exportar `runtime`
 * desde este archivo lanza un error en Next.js 16.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     * - api/vapi/...    Vapi llega sin sesión; redirigirlo a /login rompería el
     *                   webhook, que se autentica con su propio secreto.
     * - _next/static, _next/image, favicon y archivos estáticos.
     */
    '/((?!api/vapi|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
