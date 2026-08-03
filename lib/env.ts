/**
 * Variables de entorno públicas.
 *
 * Next.js sustituye `process.env.NEXT_PUBLIC_*` por su valor literal durante la
 * compilación, pero SOLO cuando se accede con notación de punto sobre el nombre
 * completo. Un acceso dinámico (`process.env[nombre]`) no se sustituye y llega
 * al navegador como `undefined`, por eso aquí se escriben una a una.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

/**
 * Devuelve la configuración pública de Supabase o lanza un error explicando qué
 * falta. Se llama en el momento de crear el cliente, no al importar el módulo,
 * para que `next build` no falle en un entorno sin `.env.local`.
 */
export function requireSupabasePublicEnv(): {
  url: string;
  anonKey: string;
} {
  const missing: string[] = [];
  if (!publicEnv.supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!publicEnv.supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno: ${missing.join(', ')}. ` +
        'Copia .env.example a .env.local y rellénalas.'
    );
  }

  return { url: publicEnv.supabaseUrl, anonKey: publicEnv.supabaseAnonKey };
}
