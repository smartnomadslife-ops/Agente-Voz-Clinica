import 'server-only';

import { serverEnv, vapiDefaults } from '@/lib/env.server';
import {
  EMPTY_BUSINESS_HOURS,
  EMPTY_CLINIC_INFO,
  businessHoursSchema,
  clinicInfoSchema,
  modelSchema,
  parseJsonColumn,
  servicesSchema,
  transcriberSchema,
  voiceSchema,
} from '@/lib/types/domain';
import type { Tables } from '@/lib/types/database';
import { composeSystemPrompt, defaultFirstMessage } from '@/lib/vapi/prompt';
import { buildToolDefinitions, type VapiFunctionTool } from '@/lib/vapi/tools';

/** La API de Vapi rechaza nombres de asistente de más de 40 caracteres. */
const MAX_ASSISTANT_NAME_LENGTH = 40;

/** Corta la llamada si el paciente cuelga sin colgar de verdad. */
const SILENCE_TIMEOUT_SECONDS = 30;

/** Tope de duración de una llamada, como red de seguridad de coste. */
const MAX_CALL_DURATION_SECONDS = 900;

interface TransferCallTool {
  type: 'transferCall';
  destinations: {
    type: 'number';
    number: string;
    message: string;
    description: string;
  }[];
}

export interface AssistantPayload {
  name: string;
  firstMessage: string;
  model: {
    provider: string;
    model: string;
    messages: { role: 'system'; content: string }[];
    tools: (VapiFunctionTool | TransferCallTool)[];
  };
  voice: { provider: string; voiceId: string; version?: number };
  transcriber: { provider: string; model: string; language: string };
  server: { url: string; secret?: string; credentialId?: string };
  serverMessages: string[];
  silenceTimeoutSeconds: number;
  maxDurationSeconds: number;
  compliancePlan?: { hipaaEnabled: boolean };
}

/**
 * Compone el payload completo del asistente a partir de la configuración.
 *
 * El asistente es una función pura de `agent_configs`: publicar es siempre la
 * misma operación idempotente, sin estado intermedio que mantener sincronizado.
 */
export function buildAssistantPayload(
  clinic: Tables<'clinics'>,
  config: Tables<'agent_configs'>
): AssistantPayload {
  const services = parseJsonColumn(servicesSchema, config.services, []);
  const businessHours = parseJsonColumn(
    businessHoursSchema,
    config.business_hours,
    EMPTY_BUSINESS_HOURS
  );
  const clinicInfo = parseJsonColumn(clinicInfoSchema, config.clinic_info, EMPTY_CLINIC_INFO);

  const voice = parseJsonColumn(voiceSchema, config.voice, {
    provider: vapiDefaults.voiceProvider,
    voiceId: vapiDefaults.voiceId,
  });

  const transcriber = parseJsonColumn(transcriberSchema, config.transcriber, {
    provider: vapiDefaults.transcriberProvider,
    model: vapiDefaults.transcriberModel,
    language: vapiDefaults.language,
  });

  const model = parseJsonColumn(modelSchema, config.model, {
    provider: vapiDefaults.modelProvider,
    model: vapiDefaults.model,
  });

  const tools: (VapiFunctionTool | TransferCallTool)[] = [...buildToolDefinitions()];

  // El traspaso real solo puede ofrecerse si hay un número al que transferir.
  // `requestHumanHandoff` sigue existiendo para dejar constancia cuando no lo hay.
  if (config.handoff_phone) {
    tools.push({
      type: 'transferCall',
      destinations: [
        {
          type: 'number',
          number: config.handoff_phone,
          message:
            config.handoff_message || 'Le paso con recepción, un momento por favor.',
          description:
            'Recepción de la clínica. Transfiere aquí en urgencias o cuando el paciente pida hablar con una persona.',
        },
      ],
    });
  }

  const server: AssistantPayload['server'] = { url: `${serverEnv.appUrl}/api/vapi/webhook` };

  // Si hay una Custom Credential configurada se usa esa; si no, el secreto
  // inline, que es lo que funciona sin tocar el dashboard de Vapi.
  const credentialId = serverEnv.vapiServerCredentialId;
  if (credentialId) {
    server.credentialId = credentialId;
  } else {
    server.secret = serverEnv.vapiWebhookSecret;
  }

  const payload: AssistantPayload = {
    name: clinic.name.slice(0, MAX_ASSISTANT_NAME_LENGTH),
    firstMessage: config.first_message || defaultFirstMessage(clinic.name),
    model: {
      provider: model.provider,
      model: model.model,
      messages: [
        {
          role: 'system',
          content: composeSystemPrompt({
            clinicName: clinic.name,
            timezone: clinic.timezone,
            tone: config.tone,
            systemPrompt: config.system_prompt,
            services,
            businessHours,
            clinicInfo,
            handoffPhone: config.handoff_phone,
          }),
        },
      ],
      tools,
    },
    voice,
    transcriber,
    server,
    // `tool-calls` es imprescindible para agendar y `end-of-call-report` para
    // guardar la transcripción. `status-update` alimenta el estado en el panel.
    serverMessages: ['tool-calls', 'end-of-call-report', 'status-update'],
    silenceTimeoutSeconds: SILENCE_TIMEOUT_SECONDS,
    maxDurationSeconds: MAX_CALL_DURATION_SECONDS,
  };

  // Solo se envía si está activado: `hipaaEnabled` desactiva el almacenamiento
  // de grabaciones y transcripciones en Vapi, y es una opción de pago.
  if (config.hipaa_enabled) {
    payload.compliancePlan = { hipaaEnabled: true };
  }

  return payload;
}
