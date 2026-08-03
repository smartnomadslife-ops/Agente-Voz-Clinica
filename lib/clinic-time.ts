/**
 * Fechas en la hora local de la clínica.
 *
 * Toda la aplicación guarda instantes en UTC (`timestamptz`) pero los presenta y
 * los agrupa por el día natural de la clínica: «las citas de hoy» significa el
 * día de la consulta, no el del servidor ni el del navegador de quien mira.
 */

import { TZDate } from '@date-fns/tz';
import { WEEKDAY_BY_DATE_INDEX, type Weekday } from '@/lib/types/domain';

export interface ClinicDateParts {
  year: number;
  month: number;
  day: number;
  weekday: Weekday;
}

export function clinicDateParts(date: Date, timeZone: string): ClinicDateParts {
  const local = new TZDate(date, timeZone);
  return {
    year: local.getFullYear(),
    month: local.getMonth(),
    day: local.getDate(),
    weekday: WEEKDAY_BY_DATE_INDEX[local.getDay()] ?? 'monday',
  };
}

/** Minutos transcurridos desde la medianoche local de la clínica. */
export function minutesFromMidnight(date: Date, timeZone: string): number {
  const local = new TZDate(date, timeZone);
  return local.getHours() * 60 + local.getMinutes();
}

/** Instante de la medianoche local del día al que pertenece `date`. */
export function startOfClinicDay(date: Date, timeZone: string): Date {
  const { year, month, day } = clinicDateParts(date, timeZone);
  return new Date(TZDate.tz(timeZone, year, month, day).getTime());
}

/**
 * Medianoche local desplazada N días naturales.
 *
 * Se recompone la fecha en lugar de sumar 24 horas: el día del cambio de
 * horario de verano dura 23 o 25 horas y sumar milisegundos desplazaría el
 * corte del día.
 */
export function shiftClinicDay(date: Date, timeZone: string, days: number): Date {
  const { year, month, day } = clinicDateParts(date, timeZone);
  return new Date(TZDate.tz(timeZone, year, month, day + days).getTime());
}

/** Primer día del mes local al que pertenece `date`. */
export function startOfClinicMonth(date: Date, timeZone: string): Date {
  const { year, month } = clinicDateParts(date, timeZone);
  return new Date(TZDate.tz(timeZone, year, month, 1).getTime());
}

export function isSameClinicDay(a: Date, b: Date, timeZone: string): boolean {
  const first = clinicDateParts(a, timeZone);
  const second = clinicDateParts(b, timeZone);
  return (
    first.year === second.year &&
    first.month === second.month &&
    first.day === second.day
  );
}

// -----------------------------------------------------------------------------
// Presentación
// -----------------------------------------------------------------------------

export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
}

export function formatShortDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(date);
}

export function formatLongDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(date);
}

export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
}

export function formatMonthYear(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

/** Duración en minutos y segundos, para listados de llamadas. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Segundos entre dos marcas ISO, o null si falta alguna. */
export function durationSeconds(
  startedAt: string | null,
  endedAt: string | null
): number | null {
  if (!startedAt || !endedAt) return null;

  const seconds = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
