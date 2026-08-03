import Link from 'next/link';

/**
 * Rejilla mensual.
 *
 * El índigo distingue las citas que agendó el agente de los eventos creados a
 * mano en Google Calendar, que se muestran en gris. Es la pregunta que el dueño
 * de la clínica se hace al abrir esta pantalla: qué ha llenado el robot y qué
 * hemos puesto nosotros.
 */

export interface CalendarEntry {
  key: string;
  start: Date;
  end: Date | null;
  title: string;
  subtitle: string | null;
  source: 'agent' | 'google';
  appointmentId: string | null;
  allDay: boolean;
}

export interface CalendarDay {
  /** Clave `YYYY-MM-DD` en hora local de la clínica. */
  key: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MAX_VISIBLE = 3;

export function MonthGrid({
  days,
  timeLabel,
  buildHref,
}: {
  days: CalendarDay[];
  timeLabel: (date: Date) => string;
  buildHref: (entry: CalendarEntry) => string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAY_HEADERS.map((label) => (
            <div key={label} className="px-2 py-2">
              <span className="eyebrow">{label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => (
            <div
              key={day.key}
              className={`min-h-28 border-r border-b border-line p-1.5 last:border-r-0 ${
                day.inMonth ? '' : 'bg-paper'
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.6875rem] ${
                    day.isToday
                      ? 'bg-ink font-medium text-white'
                      : day.inMonth
                        ? 'text-ink-soft'
                        : 'text-ink-faint'
                  }`}
                >
                  {day.dayNumber}
                </span>
              </div>

              <ul className="space-y-0.5">
                {day.entries.slice(0, MAX_VISIBLE).map((entry) => {
                  const href = buildHref(entry);

                  const content = (
                    <span
                      className={`block truncate rounded px-1.5 py-0.5 text-[0.6875rem] leading-tight ${
                        entry.source === 'agent'
                          ? 'bg-agent-soft text-agent'
                          : 'bg-sunken text-ink-soft'
                      }`}
                    >
                      {!entry.allDay ? (
                        <span className="tabular mr-1">{timeLabel(entry.start)}</span>
                      ) : null}
                      {entry.title}
                    </span>
                  );

                  return (
                    <li key={entry.key}>
                      {href ? (
                        <Link href={href} className="block hover:opacity-80">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}

                {day.entries.length > MAX_VISIBLE ? (
                  <li className="px-1.5 text-[0.6875rem] text-ink-faint">
                    +{day.entries.length - MAX_VISIBLE} más
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
