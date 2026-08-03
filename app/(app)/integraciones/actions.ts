'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { ClinicStore } from '@/lib/tenant/scoped-admin';

export interface ActionState {
  error: string | null;
  notice: string | null;
}

/**
 * Desconecta Google Calendar borrando las credenciales.
 *
 * La política RLS `google_credentials_delete_own` limita el borrado a la propia
 * clínica, así que se usa el cliente de usuario y no el admin.
 */
export async function disconnectGoogle(): Promise<void> {
  const session = await requireSession();

  await session.supabase
    .from('google_credentials')
    .delete()
    .eq('clinic_id', session.clinicId);

  revalidatePath('/integraciones');
  revalidatePath('/calendario');
  revalidatePath('/dashboard');
}

export async function savePhoneNumber(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Revalidación propia en cada Server Action: proxy.ts no cubre estas
  // invocaciones de forma garantizada.
  const session = await requireSession();

  const raw = String(formData.get('phoneNumberId') ?? '').trim();

  // Vapi identifica el número por su UUID, no por el +52…; avisar aquí ahorra
  // un error 400 confuso al publicar.
  if (raw && /^\+?\d[\d\s-]+$/.test(raw)) {
    return {
      error:
        'Ese es el número de teléfono. Necesito el identificador del número en Vapi, que es un UUID como 1a2b3c4d-…',
      notice: null,
    };
  }

  const store = ClinicStore.forClinic(session.clinicId);

  try {
    await store.setVapiPhoneNumberId(raw || null);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo guardar el número.',
      notice: null,
    };
  }

  revalidatePath('/integraciones');
  revalidatePath('/dashboard');

  return {
    error: null,
    notice: raw
      ? 'Número guardado. Publica la configuración para asignárselo al asistente.'
      : 'Número desvinculado.',
  };
}
