import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireSupabasePublicEnv } from '@/lib/env';
import type { Database } from '@/lib/types/database';

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Usa la clave anónima con la sesión del usuario, de modo que TODAS las
 * consultas pasan por Row Level Security. Es el cliente que debe usarse en
 * cualquier código que actúe en nombre de un usuario.
 *
 * En Next.js 16 `cookies()` es asíncrona, de ahí que la función lo sea.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Los Server Components no pueden escribir cookies. No es un problema:
          // proxy.ts refresca la sesión en cada petición antes de llegar aquí.
        }
      },
    },
  });
}
