import {
  CalendarBlank,
  CheckCircle,
  Phone,
  Robot,
  WarningCircle,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { disconnectGoogle } from '@/app/(app)/integraciones/actions';
import { PhoneNumberForm } from '@/app/(app)/integraciones/phone-number-form';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Note, Pill } from '@/components/ui/states';
import { requireSession } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/clinic-time';
import { GOOGLE_CREDENTIALS_PUBLIC_COLUMNS } from '@/lib/google/credentials';

export const metadata = { title: 'Integraciones · Panel de clínica' };

/** Mensajes del callback de OAuth, traducidos a lenguaje del usuario. */
const GOOGLE_FEEDBACK: Record<string, { tone: 'ok' | 'warn' | 'alert'; text: string }> = {
  connected: {
    tone: 'ok',
    text: 'Google Calendar conectado. El agente ya puede consultar la agenda y crear citas.',
  },
  denied: {
    tone: 'warn',
    text: 'Cancelaste el permiso en Google. Sin él, el agente no puede agendar citas.',
  },
  invalid_state: {
    tone: 'alert',
    text: 'La conexión caducó antes de completarse. Vuelve a intentarlo desde este botón.',
  },
  error: {
    tone: 'alert',
    text: 'Google rechazó la conexión. Revisa que las credenciales de OAuth sean correctas y vuelve a intentarlo.',
  },
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const session = await requireSession();
  const { google: googleStatus } = await searchParams;

  const [{ data: clinic }, { data: credentials }, { data: config }] = await Promise.all([
    session.supabase
      .from('clinics')
      .select('timezone')
      .eq('id', session.clinicId)
      .maybeSingle(),
    session.supabase
      .from('google_credentials')
      .select(GOOGLE_CREDENTIALS_PUBLIC_COLUMNS)
      .eq('clinic_id', session.clinicId)
      .maybeSingle(),
    session.supabase
      .from('agent_configs')
      .select('vapi_assistant_id, vapi_phone_number_id, last_published_at')
      .eq('clinic_id', session.clinicId)
      .maybeSingle(),
  ]);

  const timeZone = clinic?.timezone ?? 'America/Mexico_City';
  const connected = Boolean(credentials);
  const feedback = googleStatus ? GOOGLE_FEEDBACK[googleStatus] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1.5">Integraciones</p>
        <h1 className="text-2xl">Conexiones de la clínica</h1>
      </div>

      {feedback ? <Note tone={feedback.tone}>{feedback.text}</Note> : null}

      {/* --- Google Calendar -------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Google Calendar"
          eyebrow="Agenda"
          action={connected ? <Pill tone="ok">Conectado</Pill> : <Pill tone="warn">Sin conectar</Pill>}
        />
        <CardBody className="space-y-4">
          <p className="text-sm text-ink-soft">
            El agente consulta esta agenda para saber qué huecos están libres y crea en
            ella las citas que reserva por teléfono. Las citas que crees a mano en Google
            también aparecerán en el calendario de la aplicación.
          </p>

          {connected ? (
            <>
              <dl className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
                <div>
                  <dt className="eyebrow mb-1">Calendario</dt>
                  <dd className="text-sm text-ink">
                    {credentials?.calendar_id === 'primary'
                      ? 'Principal'
                      : (credentials?.calendar_id ?? '—')}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Permiso caduca</dt>
                  <dd className="tabular text-sm text-ink">
                    {credentials?.token_expires_at
                      ? formatDateTime(new Date(credentials.token_expires_at), timeZone)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Actualizado</dt>
                  <dd className="tabular text-sm text-ink">
                    {credentials?.updated_at
                      ? formatDateTime(new Date(credentials.updated_at), timeZone)
                      : '—'}
                  </dd>
                </div>
              </dl>

              <p className="text-xs text-ink-faint">
                El permiso se renueva solo. Solo tendrás que reconectar si revocas el
                acceso desde tu cuenta de Google.
              </p>

              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <ButtonLink href="/api/google/auth" variant="secondary" size="sm">
                  <CalendarBlank size={15} />
                  Volver a conectar
                </ButtonLink>
                <form action={disconnectGoogle}>
                  <Button type="submit" variant="danger" size="sm">
                    Desconectar
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="border-t border-line pt-4">
              <ButtonLink href="/api/google/auth" size="sm">
                <CalendarBlank size={15} />
                Conectar con Google
              </ButtonLink>
            </div>
          )}
        </CardBody>
      </Card>

      {/* --- Vapi ------------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Asistente de Vapi"
          eyebrow="Telefonía"
          action={
            config?.vapi_assistant_id ? (
              <Pill tone="ok">Publicado</Pill>
            ) : (
              <Pill tone="warn">Sin publicar</Pill>
            )
          }
        />
        <CardBody className="space-y-4">
          <div className="flex items-start gap-2.5">
            {config?.vapi_assistant_id ? (
              <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-ok" />
            ) : (
              <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-warn" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {config?.vapi_assistant_id
                  ? 'El asistente existe en Vapi con la configuración publicada.'
                  : 'Todavía no se ha creado el asistente.'}
              </p>
              {config?.vapi_assistant_id ? (
                <p className="mt-0.5 font-mono text-xs break-all text-ink-faint">
                  {config.vapi_assistant_id}
                </p>
              ) : null}
              {config?.last_published_at ? (
                <p className="tabular mt-1 text-xs text-ink-faint">
                  Publicado por última vez el{' '}
                  {formatDateTime(new Date(config.last_published_at), timeZone)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <ButtonLink href="/personalizacion" variant="secondary" size="sm">
              <Robot size={15} />
              {config?.vapi_assistant_id ? 'Editar y volver a publicar' : 'Configurar y publicar'}
            </ButtonLink>
          </div>
        </CardBody>
      </Card>

      {/* --- Número ----------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Número de teléfono"
          eyebrow="Telefonía"
          action={
            config?.vapi_phone_number_id ? (
              <Pill tone="ok">Vinculado</Pill>
            ) : (
              <Pill tone="warn">Sin vincular</Pill>
            )
          }
        />
        <CardBody className="space-y-4">
          <p className="text-sm text-ink-soft">
            Para que las llamadas entrantes lleguen al agente, el número tiene que estar
            asignado al asistente. Pega aquí el identificador del número que compraste o
            importaste en Vapi y publica la configuración: la asignación se hace sola.
          </p>

          <div className="border-t border-line pt-4">
            <PhoneNumberForm current={config?.vapi_phone_number_id ?? null} />
          </div>

          {config?.vapi_phone_number_id && !config?.vapi_assistant_id ? (
            <Note tone="warn">
              El número está guardado pero el asistente aún no existe.{' '}
              <Link href="/personalizacion" className="font-medium underline">
                Publica la configuración
              </Link>{' '}
              para vincularlos.
            </Note>
          ) : null}

          {!config?.vapi_phone_number_id ? (
            <div className="flex items-start gap-2.5 rounded-md bg-sunken px-4 py-3">
              <Phone size={16} className="mt-0.5 shrink-0 text-ink-faint" />
              <p className="text-xs text-ink-soft">
                Sin número vinculado el agente puede probarse, pero no atenderá llamadas
                reales.
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
