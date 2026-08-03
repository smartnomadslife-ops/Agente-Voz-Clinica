/**
 * Formas de las columnas `jsonb` de `agent_configs`.
 *
 * Postgres las guarda como `jsonb` sin estructura, así que se validan con zod al
 * leerlas. Una fila con datos corruptos degrada a los valores por defecto en
 * lugar de tumbar la vista, y los formularios del panel reutilizan estos mismos
 * esquemas para validar antes de escribir.
 */

import { z } from 'zod';
import type { Json } from '@/lib/types/database';

/** Granularidad con la que se buscan huecos libres en la agenda. */
export const SLOT_GRANULARITY_MINUTES = 30;

// -----------------------------------------------------------------------------
// Servicios / tratamientos
// -----------------------------------------------------------------------------

export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'El nombre no puede estar vacío').max(80),
  duration_minutes: z
    .number()
    .int()
    .min(5, 'Mínimo 5 minutos')
    .max(480, 'Máximo 8 horas'),
  description: z.string().trim().max(300).optional(),
});

export type Service = z.infer<typeof serviceSchema>;

export const servicesSchema = z.array(serviceSchema);

// -----------------------------------------------------------------------------
// Horario de atención
// -----------------------------------------------------------------------------

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Etiquetas para la interfaz, en el orden en que se muestran. */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

/**
 * Índice de `Date.getDay()` (0 = domingo) a nuestra clave de día. Se usa para
 * cruzar una fecha concreta con el horario configurado.
 */
export const WEEKDAY_BY_DATE_INDEX: readonly Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timeRangeSchema = z
  .object({
    start: z.string().regex(HHMM, 'Usa el formato HH:MM'),
    end: z.string().regex(HHMM, 'Usa el formato HH:MM'),
  })
  // Comparar cadenas "HH:MM" lexicográficamente equivale a compararlas como
  // horas, porque están rellenadas con ceros a la izquierda.
  .refine((range) => range.start < range.end, {
    message: 'La hora de cierre debe ser posterior a la de apertura',
    path: ['end'],
  });

export type TimeRange = z.infer<typeof timeRangeSchema>;

export const businessHoursSchema = z.object({
  monday: z.array(timeRangeSchema).default([]),
  tuesday: z.array(timeRangeSchema).default([]),
  wednesday: z.array(timeRangeSchema).default([]),
  thursday: z.array(timeRangeSchema).default([]),
  friday: z.array(timeRangeSchema).default([]),
  saturday: z.array(timeRangeSchema).default([]),
  sunday: z.array(timeRangeSchema).default([]),
});

export type BusinessHours = z.infer<typeof businessHoursSchema>;

export const EMPTY_BUSINESS_HOURS: BusinessHours = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

// -----------------------------------------------------------------------------
// Información de la clínica (FAQ, políticas, formas de pago)
// -----------------------------------------------------------------------------

export const faqItemSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(1000),
});

export type FaqItem = z.infer<typeof faqItemSchema>;

export const clinicInfoSchema = z.object({
  address: z.string().trim().max(300).default(''),
  phone: z.string().trim().max(40).default(''),
  payment_methods: z.array(z.string().trim().min(1).max(60)).default([]),
  policies: z.string().trim().max(2000).default(''),
  faq: z.array(faqItemSchema).default([]),
});

export type ClinicInfo = z.infer<typeof clinicInfoSchema>;

export const EMPTY_CLINIC_INFO: ClinicInfo = {
  address: '',
  phone: '',
  payment_methods: [],
  policies: '',
  faq: [],
};

// -----------------------------------------------------------------------------
// Proveedores de Vapi
// -----------------------------------------------------------------------------

export const voiceSchema = z.object({
  provider: z.string().trim().min(1),
  voiceId: z.string().trim().min(1),
  /** Las voces del proveedor `vapi` exigen `version: 2`; Azure no la usa. */
  version: z.number().int().optional(),
});

export type VoiceConfig = z.infer<typeof voiceSchema>;

export const transcriberSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  language: z.string().trim().min(1),
});

export type TranscriberConfig = z.infer<typeof transcriberSchema>;

export const modelSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
});

export type ModelConfig = z.infer<typeof modelSchema>;

// -----------------------------------------------------------------------------
// Voces en español que Vapi ofrece sin conectar credenciales propias.
//
// Azure es un proveedor integrado en Vapi. Otros (ElevenLabs, PlayHT) exigen
// conectar tu propia credencial en el dashboard o devuelven un 400 al publicar.
// -----------------------------------------------------------------------------

export const SPANISH_VOICES: readonly { id: string; label: string }[] = [
  { id: 'es-MX-DaliaNeural', label: 'Dalia — español de México (femenina)' },
  { id: 'es-MX-JorgeNeural', label: 'Jorge — español de México (masculina)' },
  { id: 'es-ES-ElviraNeural', label: 'Elvira — español de España (femenina)' },
  { id: 'es-ES-AlvaroNeural', label: 'Álvaro — español de España (masculina)' },
  { id: 'es-AR-ElenaNeural', label: 'Elena — español de Argentina (femenina)' },
  { id: 'es-CO-SalomeNeural', label: 'Salomé — español de Colombia (femenina)' },
];

export const TRANSCRIBER_PRESETS: readonly {
  id: string;
  label: string;
  config: TranscriberConfig;
}[] = [
  {
    id: 'nova-2-es',
    label: 'Deepgram nova-2 — español (recomendado)',
    config: { provider: 'deepgram', model: 'nova-2', language: 'es' },
  },
  {
    id: 'nova-3-multi',
    label: 'Deepgram nova-3 — multilingüe (pacientes bilingües)',
    config: { provider: 'deepgram', model: 'nova-3', language: 'multi' },
  },
];

// -----------------------------------------------------------------------------
// Lectura tolerante a fallos
// -----------------------------------------------------------------------------

/**
 * Valida un valor `jsonb` contra un esquema y, si no encaja, devuelve el valor
 * por defecto. Se usa al leer de la base de datos, donde una fila corrupta no
 * debe romper la página entera.
 */
export function parseJsonColumn<T>(
  schema: z.ZodType<T>,
  value: Json | undefined,
  fallback: T
): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}
