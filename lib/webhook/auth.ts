import 'server-only';

import { createHmac } from 'node:crypto';
import { timingSafeEquals } from '@/lib/crypto';
import { serverEnv } from '@/lib/env.server';

export type WebhookAuthResult =
  | { ok: true; method: 'hmac' | 'shared-secret' }
  | { ok: false; reason: string };

/**
 * Autentica una petición entrante de Vapi.
 *
 * SOBRE EL MECANISMO
 *
 * La documentación de Vapi describe tres formas de autenticar el Server URL
 * (Bearer, OAuth 2.0 y HMAC) a través de *Custom Credentials*, y advierte de que
 * en el modo HMAC el nombre de la cabecera de firma LO ELIGES TÚ al crear la
 * credencial. No existe, por tanto, una cabecera `x-vapi-signature` fija que se
 * pueda dar por supuesta.
 *
 * Lo que sí funciona sin configurar nada en el dashboard es el secreto
 * compartido: al publicar el asistente se envía `server.secret`, y Vapi lo
 * devuelve en cada petición en la cabecera `x-vapi-secret`.
 *
 * Aquí se admiten los dos, en este orden:
 *
 *   1. HMAC-SHA256 sobre el cuerpo crudo, si hay cabecera y secreto
 *      configurados (VAPI_WEBHOOK_HMAC_HEADER / VAPI_WEBHOOK_HMAC_SECRET).
 *   2. Secreto compartido en `x-vapi-secret`, comparado en tiempo constante.
 *
 * Si ninguno valida, la petición se rechaza.
 */
export function verifyVapiWebhook(
  headers: Headers,
  rawBody: string
): WebhookAuthResult {
  const hmacHeaderName = serverEnv.vapiWebhookHmacHeader;
  const hmacSecret = serverEnv.vapiWebhookHmacSecret;

  if (hmacHeaderName && hmacSecret) {
    const provided = headers.get(hmacHeaderName);

    if (!provided) {
      return {
        ok: false,
        reason: `falta la cabecera de firma "${hmacHeaderName}"`,
      };
    }

    // La firma se calcula sobre el cuerpo EXACTO recibido. Serializar de nuevo
    // el JSON ya parseado cambiaría espacios y orden de claves, y la firma no
    // cuadraría.
    const expected = createHmac('sha256', hmacSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    // Algunas implementaciones prefijan el algoritmo ("sha256=abc123...").
    const signature = provided.includes('=')
      ? (provided.split('=').pop() ?? '')
      : provided;

    return timingSafeEquals(signature.trim().toLowerCase(), expected)
      ? { ok: true, method: 'hmac' }
      : { ok: false, reason: 'firma HMAC inválida' };
  }

  const provided = headers.get('x-vapi-secret');
  if (!provided) {
    return { ok: false, reason: 'falta la cabecera x-vapi-secret' };
  }

  return timingSafeEquals(provided, serverEnv.vapiWebhookSecret)
    ? { ok: true, method: 'shared-secret' }
    : { ok: false, reason: 'secreto incorrecto' };
}
