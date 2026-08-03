import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { timingSafeEquals } from '@/lib/crypto';
import { createOAuthClient, saveGoogleTokens } from '@/lib/google/credentials';
import { OAUTH_STATE_COOKIE } from '@/app/api/google/auth/route';

/**
 * Recibe el `code` de Google, lo canjea por tokens y los guarda cifrados.
 *
 * Siempre termina redirigiendo a /integraciones con un parámetro que la vista
 * traduce a un mensaje. Nunca se devuelve el error crudo de Google al navegador.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();

  const backTo = (status: string) =>
    NextResponse.redirect(new URL(`/integraciones?google=${status}`, request.url));

  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const oauthError = params.get('error');

  // El nonce es de un solo uso: se consume tanto si el flujo va bien como si no.
  const cookieStore = await cookies();
  const expectedNonce = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  // El usuario pulsó "Cancelar" en la pantalla de Google.
  if (oauthError) {
    return backTo(oauthError === 'access_denied' ? 'denied' : 'error');
  }

  if (!code || !state || !expectedNonce) {
    return backTo('invalid_state');
  }

  const separatorIndex = state.indexOf('.');
  if (separatorIndex === -1) return backTo('invalid_state');

  const nonce = state.slice(0, separatorIndex);
  const clinicId = state.slice(separatorIndex + 1);

  // Tres comprobaciones: que el nonce coincida con la cookie de este navegador,
  // y que la clínica del `state` sea la de la sesión actual. Así el token no
  // puede acabar asociado a una clínica distinta de la que inició el flujo.
  if (!nonce || !clinicId) return backTo('invalid_state');
  if (!timingSafeEquals(nonce, expectedNonce)) return backTo('invalid_state');
  if (clinicId !== session.clinicId) return backTo('invalid_state');

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    await saveGoogleTokens(session.clinicId, tokens);
  } catch {
    return backTo('error');
  }

  return backTo('connected');
}
