import {
  ArrowRight,
  CalendarCheck,
  PhoneCall,
  PlugsConnected,
  Timer,
  Waveform,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { ActivityChart, type ActivityDay } from '@/components/dashboard/activity-chart';
import { DayStrip, type DayBlock, type DaySpan } from '@/components/dashboard/day-strip';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, Note, Pill } from '@/components/ui/states';
import { requireSession } from '@/lib/auth/session';
import {
  clinicDateParts,
  durationSeconds,
  formatDuration,
  formatShortDate,
  formatTime,
  isSameClinicDay,
  minutesFromMidnight,
  shiftClinicDay,
  startOfClinicDay,
} from '@/lib/clinic-time';
import { GOOGLE_CREDENTIALS_PUBLIC_COLUMNS } from '@/lib/google/credentials';
import {
  EMPTY_BUSINESS_HOURS,
  businessHoursSchema,
  parseJsonColumn,
} from '@/lib/types/domain';

export const metadata = { title: 'Resumen · Panel de clínica' };

const CHART_DAYS = 14;
const RECENT_CALLS = 6;

function parseMinutes(value: string): number {
  const [hours, minutes] = value.split(':');
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

function Metric({
  label,
  value,
  detail,
  icon,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        <span className={emphasis ? 'text-agent' : 'text-ink-faint'}>{icon}</span>
      </div>
      <p
        className={`tabular text-2xl leading-none font-medium ${
          emphasis ? 'text-agent' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-ink-soft">{detail}</p>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = session.supabase;

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name, timezone')
    .eq('id', session.clinicId)
    .maybeSingle();

  const timeZone = clinic?.timezone ?? 'America/Mexico_City';
  const now = new Date();

  const todayStart = startOfClinicDay(now, timeZone);
  const tomorrowStart = shiftClinicDay(now, timeZone, 1);
  const weekStart = shiftClinicDay(now, timeZone, -6);
  const chartStart = shiftClinicDay(now, timeZone, -(CHART_DAYS - 1));

  const [
    { data: config },
    { data: googleCredentials },
    { data: recentCalls },
    { data: windowCalls },
    { data: windowAppointments },
    { data: todayAppointments },
  ] = await Promise.all([
    supabase
      .from('agent_configs')
      .select('business_hours, vapi_assistant_id, vapi_phone_number_id, last_published_at')
      .eq('clinic_id', session.clinicId)
      .maybeSingle(),
    supabase
      .from('google_credentials')
      .select(GOOGLE_CREDENTIALS_PUBLIC_COLUMNS)
      .eq('clinic_id', session.clinicId)
      .maybeSingle(),
    supabase
      .from('calls')
      .select('id, started_at, ended_at, phone_number, summary, created_at')
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(RECENT_CALLS),
    supabase
      .from('calls')
      .select('id, started_at, ended_at, created_at')
      .gte('created_at', chartStart.toISOString()),
    supabase
      .from('appointments')
      .select('id, created_at, status')
      .gte('created_at', chartStart.toISOString()),
    supabase
      .from('appointments')
      .select('id, start_time, end_time, patient_name, treatment')
      .eq('status', 'scheduled')
      .gte('start_time', todayStart.toISOString())
      .lt('start_time', tomorrowStart.toISOString())
      .order('start_time', { ascending: true }),
  ]);

  const calls = windowCalls ?? [];
  const appointments = windowAppointments ?? [];

  // --- Métricas -------------------------------------------------------------
  const callTime = (call: { started_at: string | null; created_at: string }) =>
    new Date(call.started_at ?? call.created_at);

  const callsToday = calls.filter((call) =>
    isSameClinicDay(callTime(call), now, timeZone)
  ).length;

  const callsThisWeek = calls.filter(
    (call) => callTime(call).getTime() >= weekStart.getTime()
  ).length;

  const appointmentsThisWeek = appointments.filter(
    (appointment) =>
      new Date(appointment.created_at).getTime() >= weekStart.getTime() &&
      appointment.status !== 'cancelled'
  ).length;

  const durations = calls
    .map((call) => durationSeconds(call.started_at, call.ended_at))
    .filter((value): value is number => value !== null);

  const averageDuration =
    durations.length > 0
      ? durations.reduce((total, value) => total + value, 0) / durations.length
      : null;

  const bookingRate =
    callsThisWeek > 0 ? Math.round((appointmentsThisWeek / callsThisWeek) * 100) : null;

  // --- Serie del gráfico ----------------------------------------------------
  const days: ActivityDay[] = [];
  for (let offset = CHART_DAYS - 1; offset >= 0; offset -= 1) {
    const dayStart = shiftClinicDay(now, timeZone, -offset);
    const dayEnd = shiftClinicDay(now, timeZone, -offset + 1);

    const within = (iso: string) => {
      const time = Date.parse(iso);
      return time >= dayStart.getTime() && time < dayEnd.getTime();
    };

    days.push({
      date: dayStart.toISOString(),
      label: formatShortDate(dayStart, timeZone),
      calls: calls.filter((call) => within(call.started_at ?? call.created_at)).length,
      appointments: appointments.filter(
        (appointment) =>
          within(appointment.created_at) && appointment.status !== 'cancelled'
      ).length,
    });
  }

  // --- Jornada de hoy -------------------------------------------------------
  const businessHours = parseJsonColumn(
    businessHoursSchema,
    config?.business_hours,
    EMPTY_BUSINESS_HOURS
  );
  const todayWeekday = clinicDateParts(now, timeZone).weekday;

  const openRanges: DaySpan[] = businessHours[todayWeekday].map((range) => ({
    from: parseMinutes(range.start),
    to: parseMinutes(range.end),
  }));

  const blocks: DayBlock[] = (todayAppointments ?? []).map((appointment) => {
    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);
    return {
      id: appointment.id,
      from: minutesFromMidnight(start, timeZone),
      to: minutesFromMidnight(end, timeZone),
      label: appointment.patient_name,
      time: `${formatTime(start, timeZone)} · ${appointment.treatment}`,
    };
  });

  // --- Estado de las conexiones --------------------------------------------
  const googleConnected = Boolean(googleCredentials);
  const assistantPublished = Boolean(config?.vapi_assistant_id);
  const numberAssigned = Boolean(config?.vapi_phone_number_id);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1.5">Resumen</p>
        <h1 className="text-2xl">
          {clinic?.name ?? 'Tu clínica'}
        </h1>
      </div>

      {!googleConnected || !assistantPublished ? (
        <Note tone="warn">
          <p className="font-medium">Falta un paso para que el agente atienda llamadas.</p>
          <ul className="mt-2 space-y-1">
            {!googleConnected ? (
              <li>
                Conecta Google Calendar para que pueda consultar la agenda y crear citas.{' '}
                <Link href="/integraciones" className="font-medium underline">
                  Conectar
                </Link>
              </li>
            ) : null}
            {!assistantPublished ? (
              <li>
                Publica la configuración para crear el asistente en Vapi.{' '}
                <Link href="/personalizacion" className="font-medium underline">
                  Ir a Personalización
                </Link>
              </li>
            ) : null}
          </ul>
        </Note>
      ) : null}

      {/* La hoja del día: lo primero que se lee en una consulta. */}
      <Card>
        <CardHeader
          title="Hoy"
          eyebrow="La jornada"
          action={
            <Link
              href="/calendario"
              className="flex items-center gap-1 text-sm text-agent hover:underline"
            >
              Calendario <ArrowRight size={14} />
            </Link>
          }
        />
        <DayStrip
          openRanges={openRanges}
          blocks={blocks}
          nowMinutes={minutesFromMidnight(now, timeZone)}
        />
        <div className="border-t border-line px-5 py-2.5">
          <p className="text-xs text-ink-soft">
            {blocks.length === 0
              ? 'Sin citas agendadas para hoy.'
              : `${blocks.length} ${blocks.length === 1 ? 'cita agendada' : 'citas agendadas'} para hoy.`}
          </p>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Llamadas hoy"
          value={String(callsToday)}
          detail={`${callsThisWeek} en los últimos 7 días`}
          icon={<PhoneCall size={16} />}
        />
        <Metric
          label="Citas agendadas"
          value={String(appointmentsThisWeek)}
          detail="Últimos 7 días"
          icon={<CalendarCheck size={16} />}
        />
        <Metric
          label="Duración media"
          value={averageDuration ? formatDuration(averageDuration) : '—'}
          detail={
            durations.length > 0
              ? `Sobre ${durations.length} llamadas`
              : 'Sin llamadas completadas todavía'
          }
          icon={<Timer size={16} />}
        />
        <Metric
          label="Tasa de agendamiento"
          value={bookingRate === null ? '—' : `${bookingRate}%`}
          detail="Citas por llamada, 7 días"
          icon={<Waveform size={16} />}
          emphasis
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Actividad" eyebrow={`Últimos ${CHART_DAYS} días`} />
          <CardBody>
            <ActivityChart days={days} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Conexiones" eyebrow="Estado" />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-soft">Google Calendar</span>
              {googleConnected ? (
                <Pill tone="ok">Conectado</Pill>
              ) : (
                <Pill tone="warn">Sin conectar</Pill>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-soft">Asistente de Vapi</span>
              {assistantPublished ? (
                <Pill tone="ok">Publicado</Pill>
              ) : (
                <Pill tone="warn">Sin publicar</Pill>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-soft">Número de teléfono</span>
              {numberAssigned ? (
                <Pill tone="ok">Asignado</Pill>
              ) : (
                <Pill tone="warn">Sin asignar</Pill>
              )}
            </div>

            <div className="pt-1">
              <ButtonLink href="/integraciones" variant="secondary" size="sm">
                <PlugsConnected size={15} />
                Gestionar conexiones
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Últimas llamadas"
          eyebrow="Actividad reciente"
          action={
            <Link
              href="/transcripciones"
              className="flex items-center gap-1 text-sm text-agent hover:underline"
            >
              Ver todas <ArrowRight size={14} />
            </Link>
          }
        />

        {(recentCalls ?? []).length === 0 ? (
          <EmptyState
            icon={<PhoneCall size={28} />}
            title="Todavía no hay llamadas"
            description="Cuando un paciente llame al número de la clínica, la conversación aparecerá aquí con su transcripción."
          />
        ) : (
          <ul className="divide-y divide-line">
            {(recentCalls ?? []).map((call) => {
              const at = new Date(call.started_at ?? call.created_at);
              const seconds = durationSeconds(call.started_at, call.ended_at);

              return (
                <li key={call.id}>
                  <Link
                    href={`/transcripciones/${call.id}`}
                    className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-sunken"
                  >
                    <div className="w-28 shrink-0">
                      <p className="tabular text-xs text-ink">
                        {formatTime(at, timeZone)}
                      </p>
                      <p className="tabular text-[0.6875rem] text-ink-faint">
                        {formatShortDate(at, timeZone)}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        {call.summary ?? 'Sin resumen disponible'}
                      </p>
                      <p className="tabular mt-0.5 text-xs text-ink-faint">
                        {call.phone_number ?? 'Número oculto'}
                        {seconds ? ` · ${formatDuration(seconds)}` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
