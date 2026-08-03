/**
 * Variables de entorno exclusivas del servidor.
 *
 * `server-only` hace que la compilación falle si alguien importa este módulo
 * desde un componente de cliente, lo que convierte una filtración de secretos
 * en un error de compilación en lugar de en un incidente.
 *
 * Los valores se leen mediante getters para que la ausencia de una variable
 * falle en el momento de usarla y no al importar el módulo: así `next build`
 * puede compilar rutas que no necesitan esa variable concreta.
 */

import 'server-only';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${name}. Consulta .env.example.`
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

export const serverEnv = {
  /** Clave que SALTA Row Level Security. Solo la usa el webhook de Vapi. */
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },

  get vapiApiKey(): string {
    return required('VAPI_API_KEY');
  },
  get vapiWebhookSecret(): string {
    return required('VAPI_WEBHOOK_SECRET');
  },
  /** Cabecera de firma HMAC. Su nombre lo eliges tú en la Custom Credential de Vapi. */
  get vapiWebhookHmacHeader(): string | undefined {
    return optional('VAPI_WEBHOOK_HMAC_HEADER');
  },
  get vapiWebhookHmacSecret(): string | undefined {
    return optional('VAPI_WEBHOOK_HMAC_SECRET');
  },
  get vapiServerCredentialId(): string | undefined {
    return optional('VAPI_SERVER_CREDENTIAL_ID');
  },

  get googleClientId(): string {
    return required('GOOGLE_CLIENT_ID');
  },
  get googleClientSecret(): string {
    return required('GOOGLE_CLIENT_SECRET');
  },
  get googleRedirectUri(): string {
    return required('GOOGLE_REDIRECT_URI');
  },

  /** URL pública sin barra final. En desarrollo, la URL de ngrok. */
  get appUrl(): string {
    return required('APP_URL').replace(/\/+$/, '');
  },
  get encryptionKey(): string {
    return required('ENCRYPTION_KEY');
  },
} as const;

/** Valores por defecto del agente, sobreescribibles por clínica desde el panel. */
export const vapiDefaults = {
  get modelProvider(): string {
    return process.env.VAPI_DEFAULT_MODEL_PROVIDER || 'openai';
  },
  get model(): string {
    return process.env.VAPI_DEFAULT_MODEL || 'gpt-4.1';
  },
  get voiceProvider(): string {
    return process.env.VAPI_DEFAULT_VOICE_PROVIDER || 'azure';
  },
  get voiceId(): string {
    return process.env.VAPI_DEFAULT_VOICE_ID || 'es-MX-DaliaNeural';
  },
  get transcriberProvider(): string {
    return process.env.VAPI_DEFAULT_TRANSCRIBER || 'deepgram';
  },
  get transcriberModel(): string {
    return process.env.VAPI_DEFAULT_TRANSCRIBER_MODEL || 'nova-2';
  },
  get language(): string {
    return process.env.VAPI_DEFAULT_LANGUAGE || 'es';
  },
} as const;
