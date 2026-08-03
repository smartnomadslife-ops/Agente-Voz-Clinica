import { NextResponse, type NextRequest } from 'next/server';
import { ClinicStore, resolveClinicFromCall, type ResolvedClinic } from '@/lib/tenant/scoped-admin';
import {
  EMPTY_BUSINESS_HOURS,
  EMPTY_CLINIC_INFO,
  businessHoursSchema,
  clinicInfoSchema,
  parseJsonColumn,
  servicesSchema,
  type Service,
} from '@/lib/types/domain';
import { verifyVapiWebhook } from '@/lib/webhook/auth';
import { runTool, type ToolContext } from '@/lib/webhook/handlers';
import {
  extractTranscriptTurns,
  tenantIdentifiers,
  toolCallParameters,
  vapiEnvelopeSchema,
  type VapiMessage,
} from '@/lib/webhook/payload';

/**
 * Server URL de Vapi.
 *
 * Esta ruta está EXCLUIDA del matcher de proxy.ts: Vapi llega sin sesión de
 * usuario y el proxy la redirigiría a /login. Se autentica por su cuenta con el
 * secreto compartido (o HMAC) en lib/webhook/auth.ts.
 *
 * Sobre los códigos de respuesta: casi todo devuelve 200. Vapi reintenta ante un
 * error, y un reintento de una llamada ya terminada no arregla nada; lo único
 * que se rechaza con 401 es una petición no autenticada.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Consultar Google y escribir en Supabase puede tardar; el límite por defecto es corto. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // El cuerpo se lee CRUDO: la firma HMAC se calcula sobre estos bytes exactos.
  // Volver a serializar el JSON parseado cambiaría espacios y orden de claves.
  const rawBody = await request.text();

  const auth = verifyVapiWebhook(request.headers, rawBody);
  if (!auth.ok) {
    console.warn('[vapi] petición rechazada:', auth.reason);
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const envelope = vapiEnvelopeSchema.safeParse(parsedBody);
  if (!envelope.success) {
    return NextResponse.json({});
  }

  const message = envelope.data.message;

  const clinic = await resolveClinicFromCall(tenantIdentifiers(message));
  if (!clinic) {
    // No se puede atribuir a ninguna clínica. Se responde 200 para que Vapi no
    // reintente en bucle, pero no se toca ningún dato: sin clínica resuelta no
    // hay forma segura de escribir nada.
    console.warn('[vapi] evento sin clínica atribuible:', message.type);
    return NextResponse.json({});
  }

  switch (message.type) {
    case 'tool-calls':
      return handleToolCalls(clinic, message);
    case 'end-of-call-report':
      return handleEndOfCallReport(clinic, message);
    default:
      // status-update, transcript, speech-update, hang: se acusa recibo.
      return NextResponse.json({});
  }
}

/** Carga la configuración de la clínica y prepara el contexto de las tools. */
async function buildToolContext(
  store: ClinicStore,
  clinic: ResolvedClinic,
  callRowId: string | null
): Promise<ToolContext | null> {
  const config = await store.getAgentConfig();
  if (!config) return null;

  const services: Service[] = parseJsonColumn(servicesSchema, config.services, []);

  return {
    store,
    clinic,
    services,
    businessHours: parseJsonColumn(
      businessHoursSchema,
      config.business_hours,
      EMPTY_BUSINESS_HOURS
    ),
    clinicInfo: parseJsonColumn(clinicInfoSchema, config.clinic_info, EMPTY_CLINIC_INFO),
    handoffMessage:
      config.handoff_message || 'Le paso con recepción, un momento por favor.',
    callRowId,
  };
}

async function handleToolCalls(clinic: ResolvedClinic, message: VapiMessage) {
  const store = ClinicStore.forClinic(clinic.clinicId);
  const toolCalls = message.toolCallList ?? [];

  if (toolCalls.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Se crea ya la fila de la llamada para que las citas agendadas durante la
  // conversación queden enlazadas con ella. El informe final la completará;
  // `vapi_call_id` es único, así que la operación es idempotente.
  let callRowId: string | null = null;
  const vapiCallId = message.call?.id;

  if (vapiCallId) {
    try {
      const row = await store.upsertCall({
        vapi_call_id: vapiCallId,
        status: 'in-progress',
        phone_number: message.call?.customer?.number ?? null,
      });
      callRowId = row?.id ?? null;
    } catch (error) {
      // Que no se pueda registrar la llamada no debe impedir atender al paciente.
      console.error('[vapi] no se pudo registrar la llamada en curso:', error);
    }
  }

  const context = await buildToolContext(store, clinic, callRowId);

  if (!context) {
    return NextResponse.json({
      results: toolCalls.map((toolCall) => ({
        toolCallId: toolCall.id,
        result:
          'La configuración de la clínica no está disponible. Discúlpate y pide al paciente que llame más tarde.',
      })),
    });
  }

  // Las herramientas se ejecutan en serie: comparten calendario y una reserva
  // depende de la disponibilidad que acaba de comprobarse.
  const results: { toolCallId: string; result: string }[] = [];

  for (const toolCall of toolCalls) {
    let value: unknown;

    try {
      value = await runTool(context, toolCall.name, toolCallParameters(toolCall));
    } catch (error) {
      // Nunca se devuelve un 500 en una llamada a herramienta: el agente está
      // hablando con un paciente y necesita algo que decir.
      console.error(`[vapi] fallo en la herramienta ${toolCall.name}:`, error);
      value = {
        error:
          'Ha ocurrido un problema técnico. Discúlpate y dile al paciente que la clínica le llamará para confirmar.',
      };
    }

    results.push({
      toolCallId: toolCall.id,
      result: typeof value === 'string' ? value : JSON.stringify(value),
    });
  }

  return NextResponse.json({ results });
}

async function handleEndOfCallReport(clinic: ResolvedClinic, message: VapiMessage) {
  const vapiCallId = message.call?.id;
  if (!vapiCallId) return NextResponse.json({});

  const store = ClinicStore.forClinic(clinic.clinicId);

  try {
    const call = await store.upsertCall({
      vapi_call_id: vapiCallId,
      started_at: message.startedAt ?? null,
      ended_at: message.endedAt ?? null,
      phone_number: message.call?.customer?.number ?? null,
      status: 'ended',
      ended_reason: message.endedReason ?? null,
      summary: message.analysis?.summary ?? null,
      full_transcript: message.artifact?.transcript ?? null,
      cost: message.cost ?? null,
      recording_url:
        message.artifact?.recordingUrl ?? message.artifact?.recording?.url ?? null,
    });

    if (call) {
      // Con HIPAA activado Vapi no envía artefactos, así que esto queda vacío
      // a propósito y la vista de transcripciones lo indica.
      await store.replaceTranscripts(call.id, extractTranscriptTurns(message));
    }
  } catch (error) {
    console.error('[vapi] no se pudo guardar el informe de la llamada:', error);
  }

  return NextResponse.json({});
}
