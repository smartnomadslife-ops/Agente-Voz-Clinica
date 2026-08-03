import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireSupabasePublicEnv } from '@/lib/env';
import { serverEnv } from '@/lib/env.server';
import type { Database } from '@/lib/types/database';

/**
 * Cliente con la clave `service_role`.
 *
 * ATENCIÓN: este cliente SALTA Row Level Security por completo. Ve los datos de
 * todas las clínicas. Existe únicamente porque el webhook de Vapi llega sin
 * sesión de usuario y no hay ningún `auth.uid()` sobre el que filtrar.
 *
 * No lo uses directamente para leer o escribir datos de una clínica. Usa
 * `createScopedAdmin(clinicId)` de lib/tenant/scoped-admin.ts, que fuerza el
 * filtro por `clinic_id` en cada operación. Los usos legítimos del cliente
 * crudo son solo los que no pertenecen a ninguna clínica todavía: resolver a qué
 * clínica corresponde una llamada entrante, y escribir columnas que el rol
 * `authenticated` tiene revocadas tras verificar la propiedad.
 */
export function createAdminClient() {
  const { url } = requireSupabasePublicEnv();

  return createClient<Database>(url, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
