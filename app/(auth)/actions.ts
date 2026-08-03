'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface AuthFormState {
  error: string | null;
  notice?: string | null;
}

/**
 * Solo se aceptan rutas internas.
 *
 * Sin esta comprobación, un enlace `?redirectTo=https://sitio-falso/` llevaría
 * al usuario fuera de la aplicación justo después de iniciar sesión, que es la
 * forma clásica de montar una pantalla de phishing creíble.
 */
function safeRedirect(target: string): string {
  if (!target.startsWith('/') || target.startsWith('//')) return '/dashboard';
  return target;
}

export async function signIn(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const target = safeRedirect(String(formData.get('redirectTo') ?? '/dashboard'));

  if (!email || !password) {
    return { error: 'Escribe tu correo y tu contraseña.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // El mismo mensaje para credenciales incorrectas y para usuario inexistente:
    // distinguirlos permitiría averiguar qué correos están registrados.
    return { error: 'El correo o la contraseña no son correctos.' };
  }

  revalidatePath('/', 'layout');
  redirect(target);
}

export async function signUp(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const clinicName = String(formData.get('clinicName') ?? '').trim();
  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!clinicName) return { error: 'Escribe el nombre de tu clínica.' };
  if (!email) return { error: 'Escribe tu correo.' };
  if (password.length < 8) {
    return { error: 'La contraseña necesita al menos 8 caracteres.' };
  }

  const supabase = await createClient();

  // `data` acaba en raw_user_meta_data, que es de donde el trigger
  // handle_new_user toma el nombre de la clínica para crearla.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { clinic_name: clinicName, full_name: fullName } },
  });

  if (error) {
    return { error: error.message };
  }

  // Con la confirmación por correo activada no hay sesión todavía.
  if (!data.session) {
    return {
      error: null,
      notice:
        'Te hemos enviado un correo para confirmar la cuenta. Ábrelo y vuelve a iniciar sesión.',
    };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
