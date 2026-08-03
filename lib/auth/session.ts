import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/types/database';

export interface Session {
  userId: string;
  email: string | null;
  clinicId: string;
  role: 'owner' | 'staff';
  fullName: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * Devuelve la sesión y la clínica del usuario, o `null` si no hay sesión válida.
 *
 * Se apoya en `getUser()`, que valida el JWT contra el servidor de auth de
 * Supabase. `getSession()` solo decodifica la cookie y no comprueba su firma
 * contra el servidor, así que no debe usarse para tomar decisiones de acceso.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // La política RLS de `profiles` ya limita esta consulta al propio usuario.
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role, full_name')
    .eq('id', user.id)
    .maybeSingle<
      Pick<
        Database['public']['Tables']['profiles']['Row'],
        'clinic_id' | 'role' | 'full_name'
      >
    >();

  // Sin perfil no hay clínica y ninguna política RLS puede resolverse. Solo
  // ocurre si falló el trigger de alta.
  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    clinicId: profile.clinic_id,
    role: profile.role,
    fullName: profile.full_name,
    supabase,
  };
}

/**
 * Igual que `getSession()`, pero redirige a /login si no hay sesión.
 *
 * Debe invocarse al principio de CADA Server Action y Route Handler que actúe
 * sobre datos de una clínica. `proxy.ts` no basta: las Server Functions viajan
 * como POST sobre la ruta donde se declaran y un cambio de `matcher` podría
 * dejarlas fuera de su cobertura sin que nada lo advierta.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}
