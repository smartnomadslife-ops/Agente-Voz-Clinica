/**
 * Cálculo de huecos libres en la agenda de la clínica.
 *
 * Módulo puro y sin dependencias de red o base de datos, para poder probarlo
 * (`pnpm test:availability`). Toda la aritmética se hace sobre la hora de pared
 * de la zona horaria de la clínica: un horario de "09:00 a 14:00" significa las
 * nueve locales tanto en enero como en julio, aunque el desfase con UTC cambie
 * por el horario de verano.
 *
 * Cada hora candidata se construye de forma independiente con
 * `TZDate.tz(zona, año, mes, día, hora, minuto)`, en lugar de ir sumando
 * milisegundos a un instante inicial. Sumar desplazamientos sobre un instante
 * cruzaría mal los cambios de hora: el día del cambio tiene 23 o 25 horas.
 */

import { TZDate } from '@date-fns/tz';
import {
  SLOT_GRANULARITY_MINUTES,
  WEEKDAY_BY_DATE_INDEX,
  type BusinessHours,
  type TimeRange,
} from '@/lib/types/domain';

export interface Interval {
  start: Date;
  end: Date;
}

/** Límite defensivo para que un `daysAhead` disparatado no cuelgue el proceso. */
const MAX_DAYS_SCANNED = 60;

/** Convierte "HH:MM" en minutos desde medianoche. Devuelve null si no encaja. */
function parseHhMm(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

/** Instante UTC correspondiente a una hora de pared concreta en una zona. */
function wallClockToInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minutesFromMidnight: number
): Date {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  return new Date(TZDate.tz(timeZone, year, month, day, hours, minutes).getTime());
}

/** ¿Se solapan dos intervalos? Tocarse por un extremo no cuenta como solape. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

/** ¿Está el hueco libre de todos los intervalos ocupados? */
export function isSlotFree(slot: Interval, busy: readonly Interval[]): boolean {
  return !busy.some((interval) => overlaps(slot, interval));
}

export interface CandidateSlotsParams {
  timeZone: string;
  businessHours: BusinessHours;
  /** Duración de la cita en minutos; determina si el hueco cabe en el tramo. */
  durationMinutes: number;
  /** Inicio de la ventana de búsqueda. No se proponen huecos anteriores. */
  from: Date;
  /** Fin de la ventana de búsqueda. */
  to: Date;
  granularityMinutes?: number;
}

/**
 * Todos los huecos que caben en el horario de atención dentro de la ventana,
 * sin tener en cuenta todavía lo que ya está ocupado.
 */
export function generateCandidateSlots(params: CandidateSlotsParams): Interval[] {
  const {
    timeZone,
    businessHours,
    durationMinutes,
    from,
    to,
    granularityMinutes = SLOT_GRANULARITY_MINUTES,
  } = params;

  if (durationMinutes <= 0 || to <= from) return [];

  const slots: Interval[] = [];

  // El cursor de días avanza sobre la fecha del calendario LOCAL de la clínica.
  // Se guarda como año/mes/día sueltos y se normaliza con Date.UTC para que
  // "31 de enero + 1 día" pase correctamente a febrero.
  const firstDay = new TZDate(from, timeZone);
  let cursor = Date.UTC(
    firstDay.getFullYear(),
    firstDay.getMonth(),
    firstDay.getDate()
  );

  const lastDay = new TZDate(to, timeZone);
  const lastCursor = Date.UTC(
    lastDay.getFullYear(),
    lastDay.getMonth(),
    lastDay.getDate()
  );

  for (let scanned = 0; cursor <= lastCursor && scanned < MAX_DAYS_SCANNED; scanned += 1) {
    const day = new Date(cursor);
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth();
    const date = day.getUTCDate();

    // getUTCDay() sobre el cursor da el día de la semana de esa fecha del
    // calendario, que es justo lo que se quiere: el cursor representa una fecha,
    // no un instante.
    const weekday = WEEKDAY_BY_DATE_INDEX[day.getUTCDay()];
    const ranges: TimeRange[] = weekday ? businessHours[weekday] : [];

    for (const range of ranges) {
      const opensAt = parseHhMm(range.start);
      const closesAt = parseHhMm(range.end);
      if (opensAt === null || closesAt === null || closesAt <= opensAt) continue;

      for (
        let startsAt = opensAt;
        startsAt + durationMinutes <= closesAt;
        startsAt += granularityMinutes
      ) {
        const start = wallClockToInstant(timeZone, year, month, date, startsAt);
        const end = new Date(start.getTime() + durationMinutes * 60_000);

        if (start >= from && end <= to) {
          slots.push({ start, end });
        }
      }
    }

    cursor = Date.UTC(year, month, date + 1);
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Huecos libres: los candidatos del horario menos lo que Google marca ocupado.
 */
export function findFreeSlots(
  params: CandidateSlotsParams & { busy: readonly Interval[] }
): Interval[] {
  return generateCandidateSlots(params).filter((slot) =>
    isSlotFree(slot, params.busy)
  );
}

/**
 * Texto legible de una fecha en la zona de la clínica, pensado para que el
 * agente lo lea en voz alta. Por ejemplo: "lunes, 3 de agosto, 9:00 a.m.".
 */
export function formatForSpeech(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

/** Solo la hora, para enumerar alternativas del mismo día. */
export function formatTimeForSpeech(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

/**
 * Convierte una fecha ISO 8601 recibida del agente en un `Date` válido.
 *
 * El modelo a veces devuelve una hora local sin zona ("2026-08-03T09:00:00").
 * En ese caso se interpreta como hora de pared de la clínica, que es lo que el
 * paciente ha querido decir; interpretarla como UTC desplazaría la cita varias
 * horas.
 */
export function parseIsoInClinicTimeZone(
  value: string,
  timeZone: string
): Date | null {
  const trimmed = value.trim();

  const withoutZone =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);

  if (withoutZone) {
    const [, year, month, day, hours, minutes] = withoutZone;
    const instant = TZDate.tz(
      timeZone,
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes)
    );
    return Number.isNaN(instant.getTime()) ? null : new Date(instant.getTime());
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
