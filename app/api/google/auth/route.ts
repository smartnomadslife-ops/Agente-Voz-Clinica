import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { GOOGLE_SCOPES, createOAuthClient } from '@/lib/google/credentials';

export const OAUTH_STATE_COOKIE = 'google_oauth_state';

/** El consentimiento de Google caduca pronto; diez minutos sobran. */
const STATE_TTL_SECONDS = 600;

/**
 * Inicia el consentimiento de OAuth para la clínica del usuario autenticado.
 *
 * El parámetro `state` lleva un nonce aleatorio y el identificador de la
 * clínica. El nonce se guarda además en una cookie httpOnly y el callback
 * compara ambos: sin esa comprobación, un tercero podría inducir al dueño a
 * completar un flujo iniciado por él y acabar conectando SU cuenta de Google a
 * la clínica de la víctima.
 */
export async function GET() {
  // Revalidación propia: proxy.ts no es la frontera de seguridad.
  const session = await requireSession();

  const nonce = randomBytes(32).toString('base64url');

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    // `lax` permite que la cookie viaje en la navegación de vuelta desde Google,
    // que es un GET de nivel superior. Con `strict` no llegaría.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  });

  const client = createOAuthClient();

  const consentUrl = client.generateAuthUrl({
    // `offline` es lo que hace que Google entregue un refresh token...
    access_type: 'offline',
    // ...y `consent` fuerza que lo entregue también al reautorizar. Sin esto,
    // reconectar una clínica devolvería solo un access token de una hora.
    prompt: 'consent',
    scope: [...GOOGLE_SCOPES],
    include_granted_scopes: true,
    state: `${nonce}.${session.clinicId}`,
  });

  return NextResponse.redirect(consentUrl);
}
