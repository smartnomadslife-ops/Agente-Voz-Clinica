import { CalendarCheck, MagnifyingGlass, Waveform } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { inputClasses } from '@/components/ui/field';
import { EmptyState, Pill } from '@/components/ui/states';
import { requireSession } from '@/lib/auth/session';
import {
  durationSeconds,
  formatDuration,
  formatShortDate,
  formatTime,
} from '@/lib/clinic-time';

export const metadata = { title: 'Transcripciones · Panel de clínica' };

const PAGE_SIZE = 40;

/**
 * PostgREST interpreta comas y paréntesis como sintaxis dentro de `.or(...)`.
 * Se eliminan del término de búsqueda para que un texto con una coma no rompa
 * la consulta.
 */
function sanitizeSearch(value: string): string {
  return value.replace(/[,()*]/g, ' ').trim().slice(0, 80);
}

export default async function TranscriptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; desde?: string; hasta?: string; con_cita?: string }>;
}) {
  const session = await requireSession();
  const { q, desde, hasta, con_cita: conCita } = await searchParams;

  const { data: clinic } = await session.supabase
    .from('clinics')
    .select('timezone')
    .eq('id', session.clinicId)
    .maybeSingle();

  const timeZone = clinic?.timezone ?? 'America/Mexico_City';

  let query = session.supabase
    .from('calls')
    .select('id, started_at, ended_at, phone_number, summary, cost, created_at')
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE);

  const search = q ? sanitizeSearch(q) : '';
  if (search) {
    query = query.or(`summary.ilike.%${search}%,full_transcript.ilike.%${search}%`);
  }

  if (desde) query = query.gte('created_at', `${desde}T00:00:00Z`);
  if (hasta) query = query.lte('created_at', `${hasta}T23:59:59Z`);

  const { data: calls } = await query;

  // Qué llamadas terminaron en cita. Se resuelve en una sola consulta sobre las
  // llamadas devueltas en lugar de una por fila.
  const callIds = (calls ?? []).map((call) => call.id);
  const { data: bookedCalls } = callIds.length
    ? await session.supabase
        .from('appointments')
        .select('call_id')
        .in('call_id', callIds)
        .neq('status', 'cancelled')
    : { data: [] };

  const withAppointment = new Set(
    (bookedCalls ?? [])
      .map((row) => row.call_id)
      .filter((id): id is string => Boolean(id))
  );

  const onlyBooked = conCita === '1';
  const visible = (calls ?? []).filter(
    (call) => !onlyBooked || withAppointment.has(call.id)
  );

  const hasFilters = Boolean(search || desde || hasta || onlyBooked);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1.5">Transcripciones</p>
        <h1 className="text-2xl">Llamadas atendidas</h1>
      </div>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-ink">
              Buscar
            </label>
            <div className="relative">
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
              />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q ?? ''}
                placeholder="Nombre, tratamiento, cualquier palabra…"
                className={`${inputClasses} pl-9`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="desde" className="mb-1.5 block text-sm font-medium text-ink">
              Desde
            </label>
            <input
              id="desde"
              name="desde"
              type="date"
              defaultValue={desde ?? ''}
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="hasta" className="mb-1.5 block text-sm font-medium text-ink">
              Hasta
            </label>
            <input
              id="hasta"
              name="hasta"
              type="date"
              defaultValue={hasta ?? ''}
              className={inputClasses}
            />
          </div>

          <label className="flex h-10 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="con_cita"
              value="1"
              defaultChecked={onlyBooked}
              className="h-4 w-4 rounded border-line-strong text-agent focus:ring-agent/30"
            />
            Solo con cita
          </label>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>

          {hasFilters ? (
            <Link
              href="/transcripciones"
              className="flex h-10 items-center px-2 text-sm text-ink-soft hover:text-ink"
            >
              Limpiar
            </Link>
          ) : null}
        </form>
      </Card>

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            icon={<Waveform size={28} />}
            title={hasFilters ? 'Ninguna llamada coincide' : 'Todavía no hay llamadas'}
            description={
              hasFilters
                ? 'Prueba con otras fechas o con menos palabras en la búsqueda.'
                : 'Cuando un paciente llame al número de la clínica, la conversación completa quedará aquí.'
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((call) => {
              const at = new Date(call.started_at ?? call.created_at);
              const seconds = durationSeconds(call.started_at, call.ended_at);
              const booked = withAppointment.has(call.id);

              return (
                <li key={call.id}>
                  <Link
                    href={`/transcripciones/${call.id}`}
                    className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-sunken"
                  >
                    <div className="w-24 shrink-0">
                      <p className="tabular text-sm text-ink">
                        {formatTime(at, timeZone)}
                      </p>
                      <p className="tabular text-xs text-ink-faint">
                        {formatShortDate(at, timeZone)}
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">
                        {call.summary ?? 'Sin resumen disponible'}
                      </p>
                      <p className="tabular mt-1 text-xs text-ink-faint">
                        {call.phone_number ?? 'Número oculto'}
                        {seconds ? ` · ${formatDuration(seconds)}` : ''}
                      </p>
                    </div>

                    {booked ? (
                      <div className="shrink-0">
                        <Pill tone="agent">
                          <CalendarCheck size={12} weight="fill" />
                          Con cita
                        </Pill>
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {visible.length >= PAGE_SIZE ? (
        <p className="text-center text-xs text-ink-faint">
          Se muestran las {PAGE_SIZE} llamadas más recientes. Acota con las fechas para
          ver otras.
        </p>
      ) : null}
    </div>
  );
}
