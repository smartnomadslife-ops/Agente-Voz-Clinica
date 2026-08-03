import 'server-only';

import {
  findFreeSlots,
  formatForSpeech,
  generateCandidateSlots,
  isSlotFree,
  parseIsoInClinicTimeZone,
  type Interval,
} from '@/lib/google/availability';
import {
  cancelEvent,
  createEvent,
  fetchBusyIntervals,
} from '@/lib/google/calendar';
import { getAuthorizedGoogleClient } from '@/lib/google/credentials';
import type { ClinicStore, ResolvedClinic } from '@/lib/tenant/scoped-admin';
import {
  bookAppointmentSchema,
  cancelAppointmentSchema,
  checkAvailabilitySchema,
  getClinicInfoSchema,
  requestHumanHandoffSchema,
  TOOL_NAMES,
} from '@/lib/vapi/tools';
import {
  WEEKDAY_LABELS,
  WEEKDAYS,
  type BusinessHours,
  type ClinicInfo,
  type Service,
} from '@/lib/types/domain';

/** Duración por defecto cuando no se reconoce el tratamiento. */
const DEFAULT_DURATION_MINUTES = 30;

/** No se ofrecen huecos con menos antelación que esto. */
const MINIMUM_LEAD_MINUTES = 30;

/** Días que se miran hacia adelante cuando el paciente no da una fecha. */
const DEFAULT_DAYS_AHEAD = 7;

const MAX_ALTERNATIVES = 3;

export interface ToolContext {
  store: ClinicStore;
  clinic: ResolvedClinic;
  services: Service[];
  businessHours: BusinessHours;
  clinicInfo: ClinicInfo;
  handoffMessage: string;
  /**
   * Fila de `calls` de la llamada en curso. Se crea al recibir la primera
   * llamada a herramienta para que las citas queden enlazadas con la
   * conversación que las originó, y el informe final la completa después.
   */
  callRowId: string | null;
}

/** Quita acentos y mayúsculas para comparar nombres de tratamiento. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Duración de la cita: la indicada explícitamente, la del tratamiento
 * configurado, o el valor por defecto.
 */
function resolveDuration(
  treatment: string | undefined,
  services: Service[],
  explicit: number | undefined
): number {
  if (explicit && explicit > 0) return explicit;
  if (!treatment) return DEFAULT_DURATION_MINUTES;

  const wanted = normalize(treatment);

  const exact = services.find((service) => normalize(service.name) === wanted);
  if (exact) return exact.duration_minutes;

  // El paciente dice "una limpieza" y el servicio se llama "Limpieza dental".
  const partial = services.find(
    (service) =>
      wanted.includes(normalize(service.name)) ||
      normalize(service.name).includes(wanted)
  );

  return partial?.duration_minutes ?? DEFAULT_DURATION_MINUTES;
}

/** Momento más temprano que se puede ofrecer. */
function earliestBookableTime(): Date {
  return new Date(Date.now() + MINIMUM_LEAD_MINUTES * 60_000);
}

/**
 * Respuesta estructurada de las herramientas de agenda.
 *
 * Se devuelve como JSON y no como texto plano para que el modelo distinga con
 * claridad entre "libre" y "ocupado" y disponga de la versión hablada de cada
 * hora. `iso` es para uso técnico (volver a llamar a la herramienta) y `local`
 * es lo que debe leer en voz alta.
 */
interface SlotSuggestion {
  iso: string;
  local: string;
}

function toSuggestions(slots: Interval[], timeZone: string): SlotSuggestion[] {
  return slots.slice(0, MAX_ALTERNATIVES).map((slot) => ({
    iso: slot.start.toISOString(),
    local: formatForSpeech(slot.start, timeZone),
  }));
}

// -----------------------------------------------------------------------------
// checkAvailability
// -----------------------------------------------------------------------------

export async function handleCheckAvailability(
  context: ToolContext,
  rawParameters: unknown
): Promise<unknown> {
  const parsed = checkAvailabilitySchema.safeParse(rawParameters ?? {});
  if (!parsed.success) {
    return {
      error:
        'No he entendido la fecha o la duración. Pregunta al paciente qué día y a qué hora le vendría bien.',
    };
  }

  const { treatment, datetime, durationMinutes, daysAhead } = parsed.data;
  const { timezone } = context.clinic;
  const duration = resolveDuration(treatment, context.services, durationMinutes);

  const google = await getAuthorizedGoogleClient(context.store.clinicId);
  if (!google) {
    return {
      error:
        'La agenda no está disponible en este momento. Toma los datos del paciente y dile que la clínica le llamará para confirmar la cita.',
    };
  }

  const requestedStart = datetime
    ? parseIsoInClinicTimeZone(datetime, timezone)
    : null;

  if (datetime && !requestedStart) {
    return {
      error:
        'No he podido interpretar esa fecha. Pide al paciente el día y la hora de forma más concreta.',
    };
  }

  const lowerBound = earliestBookableTime();

  // La ventana empieza en la fecha pedida (o ahora) y se extiende para poder
  // proponer alternativas aunque el hueco exacto esté ocupado.
  const windowStart =
    requestedStart && requestedStart > lowerBound ? requestedStart : lowerBound;
  const span = daysAhead ?? DEFAULT_DAYS_AHEAD;
  const windowEnd = new Date(windowStart.getTime() + span * 24 * 60 * 60_000);

  let busy: Interval[];
  try {
    busy = await fetchBusyIntervals(
      google.client,
      google.calendarId,
      windowStart,
      windowEnd
    );
  } catch {
    return {
      error:
        'No he podido consultar la agenda. Toma los datos del paciente y dile que la clínica le confirmará la cita.',
    };
  }

  const slotParams = {
    timeZone: timezone,
    businessHours: context.businessHours,
    durationMinutes: duration,
    from: windowStart,
    to: windowEnd,
  };

  // Caso 1: el paciente ha pedido una hora concreta.
  if (requestedStart) {
    if (requestedStart < lowerBound) {
      return {
        available: false,
        reason: 'Esa hora ya ha pasado o es demasiado inmediata.',
        alternatives: toSuggestions(findFreeSlots({ ...slotParams, busy }), timezone),
      };
    }

    const requestedSlot: Interval = {
      start: requestedStart,
      end: new Date(requestedStart.getTime() + duration * 60_000),
    };

    // Se comprueba contra los candidatos para validar de paso que la hora cae
    // dentro del horario de atención, no solo que el calendario esté libre.
    const withinBusinessHours = generateCandidateSlots({
      ...slotParams,
      from: new Date(requestedStart.getTime() - 1),
      to: new Date(requestedSlot.end.getTime() + 1),
    }).some((slot) => slot.start.getTime() === requestedStart.getTime());

    if (withinBusinessHours && isSlotFree(requestedSlot, busy)) {
      return {
        available: true,
        durationMinutes: duration,
        slot: {
          iso: requestedStart.toISOString(),
          local: formatForSpeech(requestedStart, timezone),
        },
      };
    }

    const alternatives = findFreeSlots({ ...slotParams, busy }).filter(
      (slot) => slot.start.getTime() !== requestedStart.getTime()
    );

    return {
      available: false,
      reason: withinBusinessHours
        ? 'Ese hueco ya está ocupado.'
        : 'Esa hora queda fuera del horario de atención de la clínica.',
      durationMinutes: duration,
      alternatives: toSuggestions(alternatives, timezone),
    };
  }

  // Caso 2: sin fecha concreta, se ofrecen los próximos huecos libres.
  const free = findFreeSlots({ ...slotParams, busy });

  if (free.length === 0) {
    return {
      available: false,
      reason: `No hay huecos libres en los próximos ${span} días.`,
      alternatives: [],
    };
  }

  return {
    available: true,
    durationMinutes: duration,
    alternatives: toSuggestions(free, timezone),
  };
}

// -----------------------------------------------------------------------------
// bookAppointment
// -----------------------------------------------------------------------------

export async function handleBookAppointment(
  context: ToolContext,
  rawParameters: unknown
): Promise<unknown> {
  const parsed = bookAppointmentSchema.safeParse(rawParameters ?? {});
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.message).join('; ');
    return { error: `Faltan datos para agendar: ${missing}` };
  }

  const input = parsed.data;
  const { timezone } = context.clinic;
  const duration = resolveDuration(
    input.treatment,
    context.services,
    input.durationMinutes
  );

  const start = parseIsoInClinicTimeZone(input.datetime, timezone);
  if (!start) {
    return { error: 'No he podido interpretar la fecha. Confírmala con el paciente.' };
  }

  if (start < earliestBookableTime()) {
    return { error: 'Esa hora ya ha pasado. Ofrece al paciente otro momento.' };
  }

  const end = new Date(start.getTime() + duration * 60_000);

  const google = await getAuthorizedGoogleClient(context.store.clinicId);
  if (!google) {
    return {
      error:
        'La agenda no está disponible. Toma los datos del paciente y dile que la clínica le llamará para confirmar.',
    };
  }

  // Se revalida la disponibilidad: entre la consulta y la reserva pueden haber
  // pasado varios turnos de conversación.
  try {
    const busy = await fetchBusyIntervals(google.client, google.calendarId, start, end);
    if (!isSlotFree({ start, end }, busy)) {
      const windowEnd = new Date(start.getTime() + DEFAULT_DAYS_AHEAD * 24 * 60 * 60_000);
      const laterBusy = await fetchBusyIntervals(
        google.client,
        google.calendarId,
        start,
        windowEnd
      );
      const alternatives = findFreeSlots({
        timeZone: timezone,
        businessHours: context.businessHours,
        durationMinutes: duration,
        from: start,
        to: windowEnd,
        busy: laterBusy,
      });

      return {
        booked: false,
        reason: 'Ese hueco acaba de ocuparse.',
        alternatives: toSuggestions(alternatives, timezone),
      };
    }
  } catch {
    return { error: 'No he podido consultar la agenda. Inténtalo de nuevo en un momento.' };
  }

  // Primero la base de datos: el índice único parcial es lo que impide de
  // verdad la doble reserva si dos llamadas coinciden. Si se creara antes el
  // evento en Google, una colisión dejaría un evento huérfano en el calendario.
  const appointment = await context.store.insertAppointment({
    patient_name: input.patientName,
    patient_phone: input.patientPhone,
    patient_email: input.patientEmail ?? null,
    treatment: input.treatment,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    is_new_patient: input.isNewPatient ?? false,
    notes: input.notes ?? null,
    status: 'scheduled',
    call_id: context.callRowId,
  });

  if (!appointment) {
    return {
      booked: false,
      reason: 'Ese hueco acaba de ocuparse. Ofrece al paciente otra hora.',
    };
  }

  let event: { id: string; htmlLink: string | null };
  try {
    event = await createEvent(google.client, google.calendarId, {
      summary: `${input.treatment} — ${input.patientName}`,
      description: [
        `Paciente: ${input.patientName}`,
        `Teléfono: ${input.patientPhone}`,
        input.patientEmail ? `Correo: ${input.patientEmail}` : null,
        `Tratamiento: ${input.treatment}`,
        input.isNewPatient ? 'Paciente nuevo' : 'Paciente ya registrado',
        input.notes ? `Notas: ${input.notes}` : null,
        '',
        'Cita agendada por el asistente telefónico.',
      ]
        .filter(Boolean)
        .join('\n'),
      start,
      end,
      timeZone: timezone,
      attendeeEmail: input.patientEmail ?? null,
      attendeeName: input.patientName,
    });
  } catch {
    // El evento no se creó: se retira la reserva para no bloquear el hueco.
    await context.store.deleteAppointment(appointment.id);
    return {
      error:
        'No he podido guardar la cita en el calendario. Toma los datos y dile al paciente que la clínica le confirmará.',
    };
  }

  await context.store.setAppointmentGoogleEvent(appointment.id, event.id);

  return {
    booked: true,
    confirmation: {
      patient: input.patientName,
      treatment: input.treatment,
      local: formatForSpeech(start, timezone),
      durationMinutes: duration,
    },
    emailSent: Boolean(input.patientEmail),
  };
}

// -----------------------------------------------------------------------------
// cancelAppointment
// -----------------------------------------------------------------------------

export async function handleCancelAppointment(
  context: ToolContext,
  rawParameters: unknown
): Promise<unknown> {
  const parsed = cancelAppointmentSchema.safeParse(rawParameters ?? {});
  if (!parsed.success) {
    return { error: 'No he entendido qué cita hay que cancelar.' };
  }

  const { eventId, patientName, datetime } = parsed.data;
  const { timezone } = context.clinic;

  if (!eventId && !patientName) {
    return {
      error: 'Necesito el nombre con el que se reservó la cita para poder cancelarla.',
    };
  }

  const appointment = eventId
    ? await context.store.findAppointmentByGoogleEventId(eventId)
    : await context.store.findScheduledAppointmentByPatient(
        patientName ?? '',
        // Si el paciente indica la fecha se busca desde ese día; si no, desde ahora.
        (datetime ? parseIsoInClinicTimeZone(datetime, timezone) : null) ?? new Date()
      );

  if (!appointment || appointment.status !== 'scheduled') {
    return {
      cancelled: false,
      reason: 'No he encontrado ninguna cita activa a ese nombre.',
    };
  }

  if (appointment.google_event_id) {
    const google = await getAuthorizedGoogleClient(context.store.clinicId);
    if (google) {
      try {
        await cancelEvent(google.client, google.calendarId, appointment.google_event_id);
      } catch {
        return {
          error:
            'No he podido cancelar la cita en el calendario. Dile al paciente que la clínica se lo confirmará.',
        };
      }
    }
  }

  await context.store.markAppointmentCancelled(appointment.id);

  return {
    cancelled: true,
    appointment: {
      patient: appointment.patient_name,
      treatment: appointment.treatment,
      local: formatForSpeech(new Date(appointment.start_time), timezone),
    },
  };
}

// -----------------------------------------------------------------------------
// getClinicInfo
// -----------------------------------------------------------------------------

function describeBusinessHours(hours: BusinessHours): string[] {
  return WEEKDAYS.map((day) => {
    const ranges = hours[day];
    const label = WEEKDAY_LABELS[day];

    if (ranges.length === 0) return `${label}: cerrado`;

    const text = ranges.map((range) => `de ${range.start} a ${range.end}`).join(' y ');
    return `${label}: ${text}`;
  });
}

export async function handleGetClinicInfo(
  context: ToolContext,
  rawParameters: unknown
): Promise<unknown> {
  // El parámetro `topic` es solo una pista; se devuelve todo y el modelo elige.
  getClinicInfoSchema.safeParse(rawParameters ?? {});

  const { clinicInfo, services, businessHours, clinic } = context;

  return {
    name: clinic.name,
    address: clinicInfo.address || null,
    phone: clinicInfo.phone || null,
    timezone: clinic.timezone,
    businessHours: describeBusinessHours(businessHours),
    treatments: services.map((service) => ({
      name: service.name,
      durationMinutes: service.duration_minutes,
      description: service.description ?? null,
    })),
    paymentMethods: clinicInfo.payment_methods,
    policies: clinicInfo.policies || null,
    faq: clinicInfo.faq.map((item) => ({
      question: item.question,
      answer: item.answer,
    })),
  };
}

// -----------------------------------------------------------------------------
// requestHumanHandoff
// -----------------------------------------------------------------------------

export async function handleRequestHumanHandoff(
  context: ToolContext,
  rawParameters: unknown
): Promise<unknown> {
  const parsed = requestHumanHandoffSchema.safeParse(rawParameters ?? {});
  const reason = parsed.success ? parsed.data.reason : undefined;

  // El traspaso real lo hace la herramienta `transferCall` de Vapi, que se
  // publica junto al asistente cuando la clínica ha configurado un teléfono de
  // recepción. Aquí solo se deja constancia y se le da al agente qué decir.
  return {
    acknowledged: true,
    reason: reason ?? null,
    sayToPatient: context.handoffMessage,
  };
}

// -----------------------------------------------------------------------------
// Enrutado
// -----------------------------------------------------------------------------

export async function runTool(
  context: ToolContext,
  name: string,
  parameters: unknown
): Promise<unknown> {
  switch (name) {
    case TOOL_NAMES.checkAvailability:
      return handleCheckAvailability(context, parameters);
    case TOOL_NAMES.bookAppointment:
      return handleBookAppointment(context, parameters);
    case TOOL_NAMES.cancelAppointment:
      return handleCancelAppointment(context, parameters);
    case TOOL_NAMES.getClinicInfo:
      return handleGetClinicInfo(context, parameters);
    case TOOL_NAMES.requestHumanHandoff:
      return handleRequestHumanHandoff(context, parameters);
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

export { describeBusinessHours };
