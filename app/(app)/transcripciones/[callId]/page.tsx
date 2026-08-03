import {
  ArrowLeft,
  CalendarCheck,
  CurrencyDollar,
  Phone,
  SpeakerHigh,
  Timer,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Note } from '@/components/ui/states';
import { requireSession } from '@/lib/auth/session';
import {
  durationSeconds,
  formatDuration,
  formatLongDate,
  formatTime,
} from '@/lib/clinic-time';

export const metadata = { title: 'Llamada · Panel de clínica' };

function elapsed(seconds: number | null): string {
  if (seconds === null) return '';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const session = await requireSession();
  const { callId } = await params;

  const { data: call } = await session.supabase
    .from('calls')
    .select('*')
    .eq('id', callId)
    .maybeSingle();

  // RLS ya limita la consulta a la clínica del usuario: si no aparece, o no
  // existe o es de otra clínica. En ambos casos, 404.
  if (!call) notFound();

  const [{ data: clinic }, { data: turns }, { data: appointments }] = await Promise.all([
    session.supabase
      .from('clinics')
      .select('timezone')
      .eq('id', session.clinicId)
      .maybeSingle(),
    session.supabase
      .from('transcripts')
      .select('id, role, text, seconds_from_start')
      .eq('call_id', callId)
      .order('seconds_from_start', { ascending: true, nullsFirst: true }),
    session.supabase
      .from('appointments')
      .select('id, patient_name, treatment, start_time, status')
      .eq('call_id', callId),
  ]);

  const timeZone = clinic?.timezone ?? 'America/Mexico_City';
  const at = new Date(call.started_at ?? call.created_at);
  const seconds = durationSeconds(call.started_at, call.ended_at);

  const conversation = (turns ?? []).filter(
    (turn) => turn.role === 'assistant' || turn.role === 'user'
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/transcripciones"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
        >
          <ArrowLeft size={15} />
          Todas las llamadas
        </Link>

        <p className="eyebrow mb-1.5">Llamada</p>
        <h1 className="text-2xl capitalize">{formatLongDate(at, timeZone)}</h1>
        <p className="tabular mt-1 text-sm text-ink-soft">
          {formatTime(at, timeZone)}
          {call.ended_at ? ` – ${formatTime(new Date(call.ended_at), timeZone)}` : ''}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <Phone size={13} /> Número
          </p>
          <p className="tabular text-sm text-ink">{call.phone_number ?? 'Oculto'}</p>
        </Card>
        <Card className="p-4">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <Timer size={13} /> Duración
          </p>
          <p className="tabular text-sm text-ink">
            {seconds ? formatDuration(seconds) : '—'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <CurrencyDollar size={13} /> Coste
          </p>
          <p className="tabular text-sm text-ink">
            {call.cost !== null ? `$${call.cost.toFixed(3)}` : '—'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="eyebrow mb-2">Cómo terminó</p>
          <p className="text-sm text-ink">{call.ended_reason ?? call.status}</p>
        </Card>
      </div>

      {(appointments ?? []).length > 0 ? (
        <Card>
          <CardHeader title="Citas de esta llamada" eyebrow="Resultado" />
          <ul className="divide-y divide-line">
            {(appointments ?? []).map((appointment) => (
              <li
                key={appointment.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {appointment.patient_name}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {appointment.treatment} ·{' '}
                    <span className="tabular">
                      {formatLongDate(new Date(appointment.start_time), timeZone)},{' '}
                      {formatTime(new Date(appointment.start_time), timeZone)}
                    </span>
                  </p>
                </div>
                <ButtonLink
                  href={`/calendario?cita=${appointment.id}`}
                  variant="secondary"
                  size="sm"
                >
                  <CalendarCheck size={15} />
                  Ver en el calendario
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {call.summary ? (
        <Card>
          <CardHeader title="Resumen" eyebrow="Generado por Vapi" />
          <CardBody>
            <p className="text-sm text-ink-soft">{call.summary}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Conversación"
          eyebrow="Turno por turno"
          action={
            call.recording_url ? (
              <a
                href={call.recording_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[0.8125rem] font-medium text-ink hover:bg-sunken"
              >
                <SpeakerHigh size={15} />
                Grabación
              </a>
            ) : null
          }
        />

        {conversation.length === 0 ? (
          <CardBody>
            <Note>
              No hay transcripción para esta llamada. Si tienes activado el modo HIPAA en
              Personalización, Vapi no almacena grabaciones ni transcripciones.
            </Note>
          </CardBody>
        ) : (
          <CardBody>
            {/* Raíl de tiempo: una llamada es una línea temporal, y leerla así
                deja ver de un vistazo dónde se alargó la conversación. */}
            <ol className="relative space-y-4 border-l border-line pl-4 sm:pl-6">
              {conversation.map((turn) => {
                const isAgent = turn.role === 'assistant';

                return (
                  <li key={turn.id} className="relative">
                    <span
                      className={`absolute top-1.5 -left-[21px] h-2 w-2 rounded-full sm:-left-[29px] ${
                        isAgent ? 'bg-agent' : 'bg-line-strong'
                      }`}
                    />

                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-xs font-medium ${
                          isAgent ? 'text-agent' : 'text-ink-soft'
                        }`}
                      >
                        {isAgent ? 'Asistente' : 'Paciente'}
                      </span>
                      {turn.seconds_from_start !== null ? (
                        <span className="tabular text-[0.6875rem] text-ink-faint">
                          {elapsed(turn.seconds_from_start)}
                        </span>
                      ) : null}
                    </div>

                    <p
                      className={`mt-1 rounded-md px-3 py-2 text-sm ${
                        isAgent
                          ? 'bg-agent-soft text-ink'
                          : 'border border-line bg-surface text-ink'
                      }`}
                    >
                      {turn.text}
                    </p>
                  </li>
                );
              })}
            </ol>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
