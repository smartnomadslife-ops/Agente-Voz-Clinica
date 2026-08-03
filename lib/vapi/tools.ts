/**
 * Herramientas del agente: definición para Vapi y validación de lo que llega.
 *
 * Los parámetros de una llamada a herramienta los redacta el modelo de lenguaje,
 * así que son entrada NO confiable: pueden faltar campos, venir un número como
 * cadena o traer una fecha inventada. Por eso cada herramienta tiene dos
 * definiciones: el JSON Schema que se publica en Vapi para guiar al modelo, y un
 * esquema de zod que valida de verdad en el servidor.
 */

import { z } from 'zod';

export const TOOL_NAMES = {
  checkAvailability: 'checkAvailability',
  bookAppointment: 'bookAppointment',
  cancelAppointment: 'cancelAppointment',
  getClinicInfo: 'getClinicInfo',
  requestHumanHandoff: 'requestHumanHandoff',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

/** Los modelos devuelven a veces booleanos como cadena o como 0/1. */
const looseBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'sí', 'si', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return value;
}, z.boolean());

/** Cadena opcional que trata "" y "null" como ausencia de valor. */
const looseOptionalString = z.preprocess((value) => {
  if (typeof value !== 'string') return value ?? undefined;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return undefined;
  return trimmed;
}, z.string().optional());

// -----------------------------------------------------------------------------
// Esquemas de validación en servidor
// -----------------------------------------------------------------------------

export const checkAvailabilitySchema = z.object({
  treatment: looseOptionalString,
  datetime: looseOptionalString,
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  daysAhead: z.coerce.number().int().min(1).max(30).optional(),
});

export const bookAppointmentSchema = z.object({
  datetime: z.string().min(1, 'Falta la fecha y hora'),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  patientName: z.string().trim().min(2, 'Falta el nombre del paciente').max(120),
  patientPhone: z.string().trim().min(6, 'Falta el teléfono del paciente').max(40),
  patientEmail: z.preprocess((value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, z.email('Correo no válido').optional()),
  treatment: z.string().trim().min(1, 'Falta el tratamiento').max(120),
  isNewPatient: looseBoolean.optional(),
  notes: looseOptionalString,
});

export const cancelAppointmentSchema = z.object({
  eventId: looseOptionalString,
  patientName: looseOptionalString,
  datetime: looseOptionalString,
});

export const getClinicInfoSchema = z.object({
  topic: looseOptionalString,
});

export const requestHumanHandoffSchema = z.object({
  reason: looseOptionalString,
  urgent: looseBoolean.optional(),
});

// -----------------------------------------------------------------------------
// Definiciones publicadas en Vapi (function calling estilo OpenAI)
//
// No llevan `server` a propósito: sin él, Vapi aplica el orden de prioridad
// documentado (servidor de la herramienta > servidor del asistente) y usan el
// del asistente, que es donde va también el secreto. Si cada herramienta
// declarase su propio servidor, habría que repetir el secreto en cinco sitios y
// mantenerlos sincronizados.
// -----------------------------------------------------------------------------

export interface VapiFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  messages?: { type: string; content: string; timingMilliseconds?: number }[];
}

export function buildToolDefinitions(): VapiFunctionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.checkAvailability,
        description:
          'Comprueba si un hueco está libre en la agenda de la clínica y, si no lo está, propone alternativas. Llámala SIEMPRE antes de confirmar una cita.',
        parameters: {
          type: 'object',
          properties: {
            treatment: {
              type: 'string',
              description:
                'Tratamiento solicitado. Determina la duración de la cita si no se indica durationMinutes.',
            },
            datetime: {
              type: 'string',
              description:
                'Fecha y hora deseadas en formato ISO 8601, por ejemplo 2026-08-03T16:30:00. Omítelo para obtener los próximos huecos libres.',
            },
            durationMinutes: {
              type: 'number',
              description:
                'Duración en minutos. Si se omite se usa la del tratamiento.',
            },
            daysAhead: {
              type: 'number',
              description:
                'Cuántos días mirar hacia adelante cuando no se indica una fecha concreta. Entre 1 y 30.',
            },
          },
        },
      },
      messages: [
        {
          type: 'request-start',
          content: 'Déjeme revisar la agenda un momento.',
        },
      ],
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.bookAppointment,
        description:
          'Agenda la cita en el calendario de la clínica. Úsala solo después de haber comprobado la disponibilidad y de que el paciente haya confirmado todos los datos en voz alta.',
        parameters: {
          type: 'object',
          properties: {
            datetime: {
              type: 'string',
              description: 'Inicio de la cita en formato ISO 8601.',
            },
            durationMinutes: {
              type: 'number',
              description: 'Duración en minutos. Si se omite se usa la del tratamiento.',
            },
            patientName: { type: 'string', description: 'Nombre completo del paciente.' },
            patientPhone: { type: 'string', description: 'Teléfono de contacto del paciente.' },
            patientEmail: {
              type: 'string',
              description:
                'Correo del paciente. Opcional; si se indica, recibe la confirmación por email.',
            },
            treatment: { type: 'string', description: 'Tratamiento o motivo de la consulta.' },
            isNewPatient: {
              type: 'boolean',
              description: '¿Es la primera vez que el paciente acude a la clínica?',
            },
            notes: { type: 'string', description: 'Cualquier observación relevante.' },
          },
          required: ['datetime', 'patientName', 'patientPhone', 'treatment'],
        },
      },
      messages: [
        { type: 'request-start', content: 'Perfecto, se la agendo ahora mismo.' },
      ],
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.cancelAppointment,
        description:
          'Cancela una cita existente. Identifícala por el nombre del paciente y, si se conoce, la fecha.',
        parameters: {
          type: 'object',
          properties: {
            patientName: { type: 'string', description: 'Nombre con el que se reservó la cita.' },
            datetime: {
              type: 'string',
              description: 'Fecha y hora de la cita a cancelar, en formato ISO 8601.',
            },
            eventId: {
              type: 'string',
              description: 'Identificador del evento, si se conoce.',
            },
          },
        },
      },
      messages: [{ type: 'request-start', content: 'Un momento, la busco.' }],
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.getClinicInfo,
        description:
          'Devuelve los datos de la clínica: dirección, horario, formas de pago, políticas y preguntas frecuentes. Úsala para responder dudas en lugar de inventar la respuesta.',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description:
                'Sobre qué se pregunta: dirección, horario, pago, políticas o preguntas frecuentes.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.requestHumanHandoff,
        description:
          'Registra que el paciente necesita atención humana. Úsala en urgencias o cuando pida hablar con una persona.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Motivo por el que se necesita a una persona.' },
            urgent: { type: 'boolean', description: '¿Se trata de una urgencia?' },
          },
        },
      },
    },
  ];
}
