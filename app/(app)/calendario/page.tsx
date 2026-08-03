import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  CalendarBlank,
  Waveform,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { TZDate } from '@date-fns/tz';
import {
  MonthGrid,
  type CalendarDay,
  type CalendarEntry,
} from '@/components/calendar/month-grid';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Note, Pill } from '@/components/ui/states';
import { requireSession } from '@/lib/auth/session';
import {
  clinicDateParts,
  formatLongDate,
  formatMonthYear,
  formatTime,
  isSameClinicDay,
} from '@/lib/clinic-time';
import { listEvents } from '@/lib/google/calendar';
import { getAuthorizedGoogleClient } from '@/lib/google/credentials';

export const metadata = { title: 'Calendario · Panel de clínica' };

/** Seis semanas cubren cualquier mes empezando en lunes. */
const GRID_DAYS = 42;

function parseMonthParam(value: string | undefined, timeZone: string): Date {
  const match = value ? /^(\d{4})-(\d{2})$/.exec(value) : null;

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (month >= 0 && month <= 11) {
      return new Date(TZDate.tz(timeZone, year, month, 1).getTime());
    }
  }

  const today = clinicDateParts(new Date(), timeZone);
  return new Date(TZDate.tz(timeZone, today.year, today.month, 1).getTime());
}

function monthParam(date: Date, timeZone: string): string {
  const { year, month } = clinicDateParts(date, timeZone);
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function dayKey(date: Date, timeZone: string): string {
  const { year, month, day } = clinicDateParts(date, timeZone);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cita?: string }>;
}) {
  const session = await requireSession();
  const { mes, cita } = await searchParams;

  const { data: clinic } = await session.supabase
    .from('clinics')
    .select('timezone')
    .eq('id', session.clinicId)
    .maybeSingle();

  const timeZone = clinic?.timezone ?? 'America/Mexico_City';
  const now = new Date();

  const monthStart = parseMonthParam(mes, timeZone);
  const { year, month } = clinicDateParts(monthStart, timeZone);

  // La rejilla empieza el lunes de la semana del día 1. getDay() da 0 para
  // domingo, así que se desplaza para que la semana comience en lunes.
  const firstWeekday = new TZDate(monthStart, timeZone).getDay();
  const leadingDays = (firstWeekday + 6) % 7;

  const gridStart = new Date(
    TZDate.tz(timeZone, year, month, 1 - leadingDays).getTime()
  );
  const gridEnd = new Date(
    TZDate.tz(timeZone, year, month, 1 - leadingDays + GRID_DAYS).getTime()
  );

  // --- Citas propias --------------------------------------------------------
  const { data: appointments } = await session.supabase
    .from('appointments')
    .select(
      'id, start_time, end_time, patient_name, treatment, status, google_event_id'
    )
    .neq('status', 'cancelled')
    .gte('start_time', gridStart.toISOString())
    .lt('start_time', gridEnd.toISOString())
    .order('start_time', { ascending: true });

  // --- Eventos de Google ----------------------------------------------------
  // Lectura directa: así aparece también lo que se haya creado a mano en Google
  // Calendar, sin ningún proceso de sincronización que pueda desfasarse.
  const google = await getAuthorizedGoogleClient(session.clinicId);
  let googleEvents: Awaited<ReturnType<typeof listEvents>> = [];
  let googleError = false;

  if (google) {
    try {
      googleEvents = await listEvents(
        google.client,
        google.calendarId,
        gridStart,
        gridEnd
      );
    } catch {
      googleError = true;
    }
  }

  // --- Fusión ---------------------------------------------------------------
  const ownEventIds = new Set(
    (appointments ?? [])
      .map((appointment) => appointment.google_event_id)
      .filter((id): id is string => Boolean(id))
  );

  const entries: CalendarEntry[] = [];

  for (const appointment of appointments ?? []) {
    entries.push({
      key: `cita-${appointment.id}`,
      start: new Date(appointment.start_time),
      end: new Date(appointment.end_time),
      title: appointment.patient_name,
      subtitle: appointment.treatment,
      source: 'agent',
      appointmentId: appointment.id,
      allDay: false,
    });
  }

  for (const event of googleEvents) {
    // El evento que creó el propio agente ya está en la lista con más detalle.
    if (ownEventIds.has(event.id) || !event.start) continue;

    entries.push({
      key: `google-${event.id}`,
      start: event.start,
      end: event.end,
      title: event.summary ?? 'Evento sin título',
      subtitle: null,
      source: 'google',
      appointmentId: null,
      allDay: event.allDay,
    });
  }

  entries.sort((a, b) => a.start.getTime() - b.start.getTime());

  // --- Rejilla --------------------------------------------------------------
  const days: CalendarDay[] = [];
  for (let offset = 0; offset < GRID_DAYS; offset += 1) {
    const dayStart = new Date(
      TZDate.tz(timeZone, year, month, 1 - leadingDays + offset).getTime()
    );
    const key = dayKey(dayStart, timeZone);
    const parts = clinicDateParts(dayStart, timeZone);

    days.push({
      key,
      dayNumber: parts.day,
      inMonth: parts.month === month,
      isToday: isSameClinicDay(dayStart, now, timeZone),
      entries: entries.filter((entry) => dayKey(entry.start, timeZone) === key),
    });
  }

  const previousMonth = monthParam(
    new Date(TZDate.tz(timeZone, year, month - 1, 1).getTime()),
    timeZone
  );
  const nextMonth = monthParam(
    new Date(TZDate.tz(timeZone, year, month + 1, 1).getTime()),
    timeZone
  );

  // --- Detalle de una cita --------------------------------------------------
  const selected = cita
    ? ((await session.supabase
        .from('appointments')
        .select('*')
        .eq('id', cita)
        .maybeSingle()).data ?? null)
    : null;

  const selectedEvent =
    selected?.google_event_id
      ? (googleEvents.find((event) => event.id === selected.google_event_id) ?? null)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1.5">Calendario</p>
          <h1 className="text-2xl capitalize">{formatMonthYear(monthStart, timeZone)}</h1>
        </div>

        <div className="flex items-center gap-2">
          <ButtonLink href={`/calendario?mes=${previousMonth}`} variant="secondary" size="sm">
            <ArrowLeft size={15} />
            <span className="sr-only">Mes anterior</span>
          </ButtonLink>
          <ButtonLink href="/calendario" variant="secondary" size="sm">
            Hoy
          </ButtonLink>
          <ButtonLink href={`/calendario?mes=${nextMonth}`} variant="secondary" size="sm">
            <ArrowRight size={15} />
            <span className="sr-only">Mes siguiente</span>
          </ButtonLink>
        </div>
      </div>

      {!google ? (
        <Note tone="warn">
          Google Calendar no está conectado, así que aquí solo se ven las citas que
          registró el agente.{' '}
          <Link href="/integraciones" className="font-medium underline">
            Conectar Google Calendar
          </Link>
        </Note>
      ) : null}

      {googleError ? (
        <Note tone="alert">
          No se pudo leer Google Calendar. Puede que el permiso haya caducado.{' '}
          <Link href="/integraciones" className="font-medium underline">
            Volver a conectar
          </Link>
        </Note>
      ) : null}

      {selected ? (
        <Card>
          <CardHeader
            title={selected.patient_name}
            eyebrow="Detalle de la cita"
            action={
              <Link href="/calendario" className="text-sm text-agent hover:underline">
                Cerrar
              </Link>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-1">Cuándo</p>
                <p className="text-sm text-ink capitalize">
                  {formatLongDate(new Date(selected.start_time), timeZone)}
                </p>
                <p className="tabular text-sm text-ink-soft">
                  {formatTime(new Date(selected.start_time), timeZone)} –{' '}
                  {formatTime(new Date(selected.end_time), timeZone)}
                </p>
              </div>

              <div>
                <p className="eyebrow mb-1">Tratamiento</p>
                <p className="text-sm text-ink">{selected.treatment}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selected.is_new_patient ? (
                    <Pill tone="agent">Paciente nuevo</Pill>
                  ) : (
                    <Pill>Paciente conocido</Pill>
                  )}
                  {selected.status === 'cancelled' ? <Pill tone="alert">Cancelada</Pill> : null}
                </div>
              </div>

              <div>
                <p className="eyebrow mb-1">Contacto</p>
                <p className="tabular text-sm text-ink">{selected.patient_phone}</p>
                {selected.patient_email ? (
                  <p className="text-sm text-ink-soft">{selected.patient_email}</p>
                ) : (
                  <p className="text-sm text-ink-faint">Sin correo</p>
                )}
              </div>

              <div>
                <p className="eyebrow mb-1">Notas</p>
                <p className="text-sm text-ink-soft">
                  {selected.notes || 'Sin notas.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {selected.call_id ? (
                <ButtonLink
                  href={`/transcripciones/${selected.call_id}`}
                  variant="secondary"
                  size="sm"
                >
                  <Waveform size={15} />
                  Ver la llamada
                </ButtonLink>
              ) : null}

              {selectedEvent?.htmlLink ? (
                <a
                  href={selectedEvent.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[0.8125rem] font-medium text-ink hover:bg-sunken"
                >
                  <ArrowSquareOut size={15} />
                  Abrir en Google Calendar
                </a>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="eyebrow">Agenda del mes</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[0.6875rem] text-ink-soft">
              <span className="h-2 w-2 rounded-[2px] bg-agent" />
              Agendadas por el agente
            </span>
            <span className="flex items-center gap-1.5 text-[0.6875rem] text-ink-soft">
              <span className="h-2 w-2 rounded-[2px] bg-line-strong" />
              Creadas en Google
            </span>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CalendarBlank size={28} className="mx-auto mb-3 text-ink-faint" />
            <p className="font-display text-base font-semibold">Este mes está vacío</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
              Las citas que agende el agente por teléfono aparecerán aquí, junto con lo
              que crees directamente en Google Calendar.
            </p>
          </div>
        ) : (
          <MonthGrid
            days={days}
            timeLabel={(date) => formatTime(date, timeZone)}
            buildHref={(entry) =>
              entry.appointmentId
                ? `/calendario?mes=${monthParam(monthStart, timeZone)}&cita=${entry.appointmentId}`
                : null
            }
          />
        )}
      </Card>
    </div>
  );
}
