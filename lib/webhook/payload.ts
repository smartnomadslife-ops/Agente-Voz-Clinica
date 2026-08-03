/**
 * Forma de los eventos que Vapi envía al Server URL.
 *
 * Se valida con zod en lugar de hacer un cast: el cuerpo viene de fuera y su
 * esquema cambia entre versiones de Vapi. Todos los campos son opcionales a
 * propósito, para que la aparición de campos nuevos o la desaparición de alguno
 * no provoque un 500 en producción; cada manejador comprueba lo que necesita.
 */

import { z } from 'zod';

export const vapiToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Vapi ha usado ambos nombres según la versión.
  parameters: z.unknown().optional(),
  arguments: z.unknown().optional(),
});

export type VapiToolCall = z.infer<typeof vapiToolCallSchema>;

const artifactMessageSchema = z.object({
  role: z.string().optional(),
  message: z.string().optional(),
  secondsFromStart: z.number().optional(),
  time: z.number().optional(),
});

export const vapiMessageSchema = z.object({
  type: z.string().optional(),
  toolCallList: z.array(vapiToolCallSchema).optional(),
  call: z
    .object({
      id: z.string().optional(),
      phoneNumberId: z.string().optional(),
      assistantId: z.string().optional(),
      type: z.string().optional(),
      customer: z.object({ number: z.string().optional() }).optional(),
    })
    .optional(),
  assistant: z.object({ id: z.string().optional() }).optional(),
  phoneNumber: z.object({ id: z.string().optional() }).optional(),
  artifact: z
    .object({
      transcript: z.string().optional(),
      recordingUrl: z.string().optional(),
      recording: z
        .object({
          url: z.string().optional(),
          stereoUrl: z.string().optional(),
        })
        .optional(),
      messages: z.array(artifactMessageSchema).optional(),
    })
    .optional(),
  analysis: z.object({ summary: z.string().optional() }).optional(),
  endedReason: z.string().optional(),
  cost: z.number().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  status: z.string().optional(),
});

export type VapiMessage = z.infer<typeof vapiMessageSchema>;

export const vapiEnvelopeSchema = z.object({ message: vapiMessageSchema });

/** Los parámetros llegan en `parameters` o en `arguments` según la versión. */
export function toolCallParameters(toolCall: VapiToolCall): unknown {
  return toolCall.parameters ?? toolCall.arguments ?? {};
}

/**
 * Identificadores por los que se puede atribuir la llamada a una clínica.
 * Se prefiere el del número, presente en toda llamada telefónica entrante.
 */
export function tenantIdentifiers(message: VapiMessage): {
  phoneNumberId: string | null;
  assistantId: string | null;
} {
  return {
    phoneNumberId: message.call?.phoneNumberId ?? message.phoneNumber?.id ?? null,
    assistantId: message.call?.assistantId ?? message.assistant?.id ?? null,
  };
}

/** Convierte los turnos del artefacto en filas de `transcripts`. */
export function extractTranscriptTurns(message: VapiMessage): {
  role: 'assistant' | 'user' | 'system' | 'tool';
  text: string;
  seconds_from_start: number | null;
  spoken_at: string | null;
}[] {
  const turns: ReturnType<typeof extractTranscriptTurns> = [];

  for (const entry of message.artifact?.messages ?? []) {
    const text = entry.message?.trim();
    if (!text) continue;

    // `bot` es como Vapi nombra al asistente en algunos artefactos.
    const role =
      entry.role === 'user'
        ? 'user'
        : entry.role === 'bot' || entry.role === 'assistant'
          ? 'assistant'
          : entry.role === 'tool' || entry.role === 'tool_calls'
            ? 'tool'
            : 'system';

    turns.push({
      role,
      text,
      seconds_from_start: entry.secondsFromStart ?? null,
      spoken_at: entry.time ? new Date(entry.time).toISOString() : null,
    });
  }

  return turns;
}
