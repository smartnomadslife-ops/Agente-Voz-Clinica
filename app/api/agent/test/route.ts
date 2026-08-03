import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { ClinicStore } from '@/lib/tenant/scoped-admin';
import {
  EMPTY_BUSINESS_HOURS,
  EMPTY_CLINIC_INFO,
  businessHoursSchema,
  clinicInfoSchema,
  modelSchema,
  parseJsonColumn,
  servicesSchema,
} from '@/lib/types/domain';
import { vapiDefaults } from '@/lib/env.server';
import { composeSystemPrompt } from '@/lib/vapi/prompt';
import { createVapiClient, describeVapiError } from '@/lib/vapi/sync';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_INPUT_LENGTH = 500;

/**
 * Sandbox del prompt.
 *
 * Ejecuta la configuración actual contra la API de chat de Vapi con un asistente
 * transitorio y SIN herramientas: sirve para comprobar el tono y las respuestas
 * a preguntas frecuentes sin tocar la agenda ni gastar una llamada real. Por eso
 * no puede agendar nada: si el probador pide cita, el agente responderá pero no
 * reservará.
 */
export async function POST(request: NextRequest) {
  // Revalidación propia: esta ruta gasta crédito de Vapi.
  const session = await requireSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición no válida.' }, { status: 400 });
  }

  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: unknown }).message ?? '')
      : '';

  const input = message.trim().slice(0, MAX_INPUT_LENGTH);
  if (!input) {
    return NextResponse.json({ error: 'Escribe un mensaje para probar.' }, { status: 400 });
  }

  const store = ClinicStore.forClinic(session.clinicId);
  const [clinic, config] = await Promise.all([store.getClinic(), store.getAgentConfig()]);

  if (!clinic || !config) {
    return NextResponse.json(
      { error: 'No se encontró la configuración de la clínica.' },
      { status: 404 }
    );
  }

  const model = parseJsonColumn(modelSchema, config.model, {
    provider: vapiDefaults.modelProvider,
    model: vapiDefaults.model,
  });

  const systemPrompt = composeSystemPrompt({
    clinicName: clinic.name,
    timezone: clinic.timezone,
    tone: config.tone,
    systemPrompt: config.system_prompt,
    services: parseJsonColumn(servicesSchema, config.services, []),
    businessHours: parseJsonColumn(
      businessHoursSchema,
      config.business_hours,
      EMPTY_BUSINESS_HOURS
    ),
    clinicInfo: parseJsonColumn(clinicInfoSchema, config.clinic_info, EMPTY_CLINIC_INFO),
    handoffPhone: config.handoff_phone,
  });

  try {
    const vapi = createVapiClient();

    const response = await vapi.chats.create({
      // Asistente efímero: no se guarda en Vapi ni toca el asistente publicado.
      assistant: {
        name: 'Prueba de prompt',
        model: {
          provider: model.provider,
          model: model.model,
          messages: [
            {
              role: 'system',
              content: `${systemPrompt}\n\nESTÁS EN MODO PRUEBA: no tienes herramientas disponibles. Si te piden una cita, explica cómo procederías, pero no afirmes haberla agendado.`,
            },
          ],
        },
      },
      input,
    } as unknown as Parameters<typeof vapi.chats.create>[0]);

    return NextResponse.json({ reply: extractReply(response) });
  } catch (error) {
    return NextResponse.json({ error: describeVapiError(error) }, { status: 502 });
  }
}

/**
 * Saca el texto de la respuesta de chat.
 *
 * La forma exacta de `output` varía entre versiones de la API, así que se
 * recorre buscando texto en lugar de asumir una ruta concreta.
 */
function extractReply(response: unknown): string {
  const collected: string[] = [];

  const walk = (value: unknown, depth: number): void => {
    if (depth > 6 || collected.length > 0) return;

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }

    if (typeof value !== 'object' || value === null) return;

    const record = value as Record<string, unknown>;

    if (record.role === 'assistant' || record.role === 'bot') {
      for (const key of ['content', 'message', 'text']) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          collected.push(candidate.trim());
          return;
        }
      }
    }

    for (const key of ['output', 'messages', 'content', 'data']) {
      if (key in record) walk(record[key], depth + 1);
    }
  };

  walk(response, 0);

  return (
    collected[0] ??
    'El asistente respondió, pero no se pudo leer el texto. Revisa la llamada en el panel de Vapi.'
  );
}
