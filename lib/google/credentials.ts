import 'server-only';

import { auth } from '@googleapis/calendar';
import { decrypt, encrypt } from '@/lib/crypto';
import { serverEnv } from '@/lib/env.server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * El cliente OAuth se toma de `@googleapis/calendar` y no del paquete
 * `google-auth-library` instalado por separado a propósito: `OAuth2Client` es
 * una clase con miembros privados, así que TypeScript la compara de forma
 * nominal. Dos versiones distintas de la librería producen tipos incompatibles
 * al pasar el cliente a `calendar({ auth })`. Usando el que exporta el propio
 * paquete de Calendar, la versión siempre coincide.
 */
export type GoogleOAuthClient = InstanceType<typeof auth.OAuth2>;

/**
 * `calendar.events` permite crear y borrar citas; `calendar.readonly` permite
 * leer los eventos creados a mano en Google para mostrarlos en la app.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const;

/**
 * Columnas de `google_credentials` legibles por el rol `authenticated`.
 *
 * Las dos columnas con los tokens cifrados tienen el SELECT revocado, así que
 * un `.select('*')` desde el cliente de usuario falla con «permission denied».
 */
export const GOOGLE_CREDENTIALS_PUBLIC_COLUMNS =
  'clinic_id, token_expires_at, scope, calendar_id, updated_at';

export function createOAuthClient(): GoogleOAuthClient {
  return new auth.OAuth2({
    clientId: serverEnv.googleClientId,
    clientSecret: serverEnv.googleClientSecret,
    redirectUri: serverEnv.googleRedirectUri,
  });
}

interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
}

/**
 * Guarda los tokens cifrados.
 *
 * Google solo devuelve `refresh_token` en la primera autorización (o cuando se
 * fuerza `prompt=consent`). Si no llega uno nuevo, se conserva el almacenado en
 * lugar de sobrescribirlo con null, que dejaría la integración inservible en
 * cuanto caducara el access token.
 *
 * Escribe con el cliente admin porque el rol `authenticated` no tiene INSERT ni
 * UPDATE sobre esta tabla. Quien llama debe haber verificado ya que el usuario
 * es dueño de `clinicId`.
 */
export async function saveGoogleTokens(
  clinicId: string,
  tokens: GoogleTokens
): Promise<void> {
  if (!tokens.access_token) {
    throw new Error('Google no devolvió un access token');
  }

  const key = serverEnv.encryptionKey;
  const admin = createAdminClient();

  const row: Record<string, unknown> = {
    clinic_id: clinicId,
    access_token_encrypted: encrypt(tokens.access_token, key),
    token_expires_at: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
  };

  if (tokens.refresh_token) {
    row.refresh_token_encrypted = encrypt(tokens.refresh_token, key);
  }
  if (tokens.scope) {
    row.scope = tokens.scope;
  }

  const { error } = await admin
    .from('google_credentials')
    .upsert(row as never, { onConflict: 'clinic_id' });

  if (error) {
    throw new Error(`No se pudieron guardar las credenciales de Google: ${error.message}`);
  }
}

export interface AuthorizedGoogle {
  client: GoogleOAuthClient;
  calendarId: string;
}

/**
 * Cliente de Google listo para usar por una clínica, o `null` si hay que volver
 * a conectar.
 *
 * Devuelve `null` (en lugar de lanzar) en todos los casos recuperables por el
 * usuario: sin credenciales, token corrupto, clave de cifrado rotada o refresco
 * rechazado por Google. Quien llama debe traducirlo a «conecta Google Calendar».
 */
export async function getAuthorizedGoogleClient(
  clinicId: string
): Promise<AuthorizedGoogle | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('google_credentials')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error || !data) return null;

  const key = serverEnv.encryptionKey;

  let accessToken: string;
  let refreshToken: string | null = null;
  try {
    accessToken = decrypt(data.access_token_encrypted, key);
    if (data.refresh_token_encrypted) {
      refreshToken = decrypt(data.refresh_token_encrypted, key);
    }
  } catch {
    // Clave de cifrado cambiada o fila manipulada: la credencial es inservible.
    return null;
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: data.token_expires_at ? Date.parse(data.token_expires_at) : null,
    scope: data.scope ?? undefined,
  });

  try {
    // getAccessToken() devuelve el token vigente y lo renueva por su cuenta
    // cuando está a punto de caducar. Si se renueva, hay que persistirlo: de lo
    // contrario cada petición gastaría un refresco nuevo.
    const { token } = await client.getAccessToken();
    if (token && token !== accessToken) {
      await saveGoogleTokens(clinicId, {
        access_token: token,
        refresh_token: client.credentials.refresh_token ?? refreshToken,
        expiry_date: client.credentials.expiry_date ?? null,
        scope: client.credentials.scope ?? data.scope,
      });
    }
  } catch {
    // Sin refresh token, o el usuario revocó el acceso desde su cuenta Google.
    return null;
  }

  return { client, calendarId: data.calendar_id };
}

export interface GoogleConnectionStatus {
  connected: boolean;
  calendarId: string | null;
  scope: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
}

export const DISCONNECTED: GoogleConnectionStatus = {
  connected: false,
  calendarId: null,
  scope: null,
  expiresAt: null,
  updatedAt: null,
};
