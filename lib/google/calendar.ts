import 'server-only';

import { calendar as calendarApi, type calendar_v3 } from '@googleapis/calendar';
import type { Interval } from '@/lib/google/availability';
import type { GoogleOAuthClient } from '@/lib/google/credentials';

function api(client: GoogleOAuthClient): calendar_v3.Calendar {
  return calendarApi({ version: 'v3', auth: client });
}

/** Código HTTP de un error de la librería de Google, si lo tiene. */
function httpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;

  const candidate = error as { status?: unknown; code?: unknown };
  if (typeof candidate.status === 'number') return candidate.status;
  if (typeof candidate.code === 'number') return candidate.code;
  return null;
}

/** El evento ya no existe: borrado a mano en Google o cancelado dos veces. */
export function isMissingEventError(error: unknown): boolean {
  const status = httpStatus(error);
  return status === 404 || status === 410;
}

// -----------------------------------------------------------------------------
// Disponibilidad
// -----------------------------------------------------------------------------

/**
 * Intervalos ocupados del calendario entre dos instantes.
 *
 * Se recorren todas las entradas de la respuesta en lugar de buscar la clave
 * `calendarId`: cuando se consulta por `primary`, Google puede responder usando
 * la dirección de correo real del calendario como clave.
 */
export async function fetchBusyIntervals(
  client: GoogleOAuthClient,
  calendarId: string,
  from: Date,
  to: Date
): Promise<Interval[]> {
  const response = await api(client).freebusy.query({
    requestBody: {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const intervals: Interval[] = [];

  for (const entry of Object.values(response.data.calendars ?? {})) {
    for (const period of entry.busy ?? []) {
      if (period.start && period.end) {
        intervals.push({
          start: new Date(period.start),
          end: new Date(period.end),
        });
      }
    }
  }

  return intervals;
}

// -----------------------------------------------------------------------------
// Creación de citas
// -----------------------------------------------------------------------------

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  /** Zona horaria de la clínica; Google la usa para mostrar bien el evento. */
  timeZone: string;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
}

export interface CreatedEvent {
  id: string;
  htmlLink: string | null;
}

/**
 * Crea el evento en Google Calendar.
 *
 * Si hay correo del paciente se le añade como invitado y `sendUpdates: 'all'`
 * hace que Google le envíe la confirmación. Sin correo no se notifica a nadie.
 */
export async function createEvent(
  client: GoogleOAuthClient,
  calendarId: string,
  params: CreateEventParams
): Promise<CreatedEvent> {
  const response = await api(client).events.insert({
    calendarId,
    sendUpdates: params.attendeeEmail ? 'all' : 'none',
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: {
        dateTime: params.start.toISOString(),
        timeZone: params.timeZone,
      },
      end: {
        dateTime: params.end.toISOString(),
        timeZone: params.timeZone,
      },
      attendees: params.attendeeEmail
        ? [
            {
              email: params.attendeeEmail,
              displayName: params.attendeeName ?? undefined,
            },
          ]
        : undefined,
    },
  });

  const id = response.data.id;
  if (!id) {
    throw new Error('Google no devolvió el identificador del evento creado');
  }

  return { id, htmlLink: response.data.htmlLink ?? null };
}

/**
 * Cancela un evento. Si ya no existe se considera hecho: el objetivo es que la
 * cita no esté en el calendario, y eso ya se cumple.
 */
export async function cancelEvent(
  client: GoogleOAuthClient,
  calendarId: string,
  eventId: string
): Promise<void> {
  try {
    await api(client).events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all',
    });
  } catch (error) {
    if (!isMissingEventError(error)) throw error;
  }
}

// -----------------------------------------------------------------------------
// Lectura del calendario
// -----------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  summary: string | null;
  description: string | null;
  start: Date | null;
  end: Date | null;
  /** Los eventos de día completo llegan con `date` en vez de `dateTime`. */
  allDay: boolean;
  htmlLink: string | null;
}

/**
 * Eventos del calendario en un rango.
 *
 * `singleEvents: true` expande las series periódicas en apariciones concretas,
 * que es lo que hay que pintar en una rejilla de calendario. Es también lo que
 * hace que aparezcan en la app las citas creadas a mano desde Google.
 */
export async function listEvents(
  client: GoogleOAuthClient,
  calendarId: string,
  from: Date,
  to: Date
): Promise<CalendarEvent[]> {
  const response = await api(client).events.list({
    calendarId,
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  });

  const events: CalendarEvent[] = [];

  for (const item of response.data.items ?? []) {
    if (!item.id || item.status === 'cancelled') continue;

    const startValue = item.start?.dateTime ?? item.start?.date ?? null;
    const endValue = item.end?.dateTime ?? item.end?.date ?? null;

    events.push({
      id: item.id,
      summary: item.summary ?? null,
      description: item.description ?? null,
      start: startValue ? new Date(startValue) : null,
      end: endValue ? new Date(endValue) : null,
      allDay: Boolean(item.start?.date),
      htmlLink: item.htmlLink ?? null,
    });
  }

  return events;
}
