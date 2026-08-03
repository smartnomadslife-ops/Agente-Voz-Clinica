import 'server-only';

import { VapiClient } from '@vapi-ai/server-sdk';
import { serverEnv } from '@/lib/env.server';
import { ClinicStore } from '@/lib/tenant/scoped-admin';
import { buildAssistantPayload } from '@/lib/vapi/assistant-payload';

/** La clave de Vapi vive solo en el servidor; nunca se expone al navegador. */
export function createVapiClient(): VapiClient {
  return new VapiClient({ token: serverEnv.vapiApiKey });
}

/**
 * Extrae el mensaje útil de un error de la API de Vapi.
 *
 * Los errores de validación de Vapi son la fuente de verdad sobre qué acepta la
 * API (nombres de voz, modelos, formas de proveedor), así que se muestran tal
 * cual en el panel en lugar de sustituirlos por un genérico "algo salió mal".
 */
export function describeVapiError(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'Error desconocido al comunicar con Vapi.';
  }

  const candidate = error as {
    body?: unknown;
    message?: unknown;
    statusCode?: unknown;
  };

  const status =
    typeof candidate.statusCode === 'number' ? ` (HTTP ${candidate.statusCode})` : '';

  const body = candidate.body;
  if (typeof body === 'string' && body.trim()) {
    return `${body.trim()}${status}`;
  }

  if (typeof body === 'object' && body !== null) {
    const detail = body as { message?: unknown; error?: unknown };

    // Vapi devuelve `message` como cadena o como array de errores de validación.
    if (Array.isArray(detail.message)) {
      return `${detail.message.join('; ')}${status}`;
    }
    if (typeof detail.message === 'string' && detail.message.trim()) {
      return `${detail.message.trim()}${status}`;
    }
    if (typeof detail.error === 'string' && detail.error.trim()) {
      return `${detail.error.trim()}${status}`;
    }
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return `${candidate.message.trim()}${status}`;
  }

  return `No se pudo completar la operación en Vapi${status}.`;
}

export type PublishResult =
  | {
      ok: true;
      assistantId: string;
      phoneNumberAssigned: boolean;
      warning: string | null;
    }
  | { ok: false; error: string };

/**
 * Publica la configuración de la clínica en Vapi.
 *
 * Crea el asistente la primera vez y lo actualiza después, guarda su
 * identificador, y asigna el número de teléfono al asistente para que las
 * llamadas ENTRANTES lleguen al agente. Sin ese último paso el número se queda
 * sin `assistantId` y Vapi contesta con su mensaje por defecto.
 *
 * Quien llama debe haber verificado ya que el usuario es dueño de `clinicId`.
 */
export async function publishAssistant(clinicId: string): Promise<PublishResult> {
  const store = ClinicStore.forClinic(clinicId);

  const [clinic, config] = await Promise.all([store.getClinic(), store.getAgentConfig()]);

  if (!clinic || !config) {
    return { ok: false, error: 'No se encontró la configuración de la clínica.' };
  }

  const payload = buildAssistantPayload(clinic, config);
  const vapi = createVapiClient();

  let assistantId: string;

  try {
    if (config.vapi_assistant_id) {
      // El SDK tipa `voice`, `model` y `transcriber` como uniones discriminadas
      // por proveedor. Aquí el proveedor sale de una columna jsonb y solo se
      // conoce en ejecución, así que TypeScript no puede estrechar la unión.
      // La validación real la hace la API de Vapi, cuyo error se propaga al panel.
      const updated = await vapi.assistants.update({
        id: config.vapi_assistant_id,
        ...payload,
      } as unknown as Parameters<typeof vapi.assistants.update>[0]);

      assistantId = updated.id;
    } else {
      const created = await vapi.assistants.create(
        payload as unknown as Parameters<typeof vapi.assistants.create>[0]
      );
      assistantId = created.id;
    }
  } catch (error) {
    return { ok: false, error: describeVapiError(error) };
  }

  // Se guarda antes de tocar el número: si la asignación falla, el asistente ya
  // existe y una nueva publicación lo actualizará en lugar de duplicarlo.
  try {
    await store.saveVapiIdentifiers({ assistantId });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la referencia del asistente.',
    };
  }

  if (!config.vapi_phone_number_id) {
    return {
      ok: true,
      assistantId,
      phoneNumberAssigned: false,
      warning:
        'El asistente está publicado, pero la clínica no tiene número de Vapi asignado. Hasta que lo configures no podrá recibir llamadas entrantes.',
    };
  }

  try {
    await vapi.phoneNumbers.update({
      id: config.vapi_phone_number_id,
      assistantId,
    } as unknown as Parameters<typeof vapi.phoneNumbers.update>[0]);
  } catch (error) {
    return {
      ok: true,
      assistantId,
      phoneNumberAssigned: false,
      warning: `El asistente se publicó, pero no se pudo asignar al número: ${describeVapiError(error)}`,
    };
  }

  return { ok: true, assistantId, phoneNumberAssigned: true, warning: null };
}
