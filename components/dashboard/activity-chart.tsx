/**
 * Llamadas y citas por día.
 *
 * SVG a mano en lugar de una librería de gráficas: es una sola serie doble y
 * añadir una dependencia de cientos de kilobytes por esto no se sostiene.
 *
 * La barra clara es el total de llamadas y la índigo, la parte que acabó en
 * cita. Se dibujan superpuestas y no una al lado de la otra porque la relación
 * que importa es de parte a todo: cuántas de las llamadas que entraron
 * terminaron llenando la agenda.
 */

export interface ActivityDay {
  /** Fecha en formato ISO corto, usada como clave. */
  date: string;
  /** Etiqueta corta para el eje, p. ej. "12 ago". */
  label: string;
  calls: number;
  appointments: number;
}

export function ActivityChart({ days }: { days: ActivityDay[] }) {
  const peak = Math.max(1, ...days.map((day) => day.calls));

  return (
    <div>
      <div
        className="flex items-end gap-1"
        role="img"
        aria-label={`Actividad de los últimos ${days.length} días`}
      >
        {days.map((day) => {
          const callsHeight = (day.calls / peak) * 100;
          const bookedHeight = (day.appointments / peak) * 100;

          return (
            <div key={day.date} className="group relative flex-1">
              <div className="relative h-28 w-full">
                <div
                  className="absolute bottom-0 w-full rounded-t-[2px] bg-sunken"
                  style={{ height: `${Math.max(callsHeight, day.calls > 0 ? 3 : 0)}%` }}
                />
                <div
                  className="absolute bottom-0 w-full rounded-t-[2px] bg-agent"
                  style={{
                    height: `${Math.max(bookedHeight, day.appointments > 0 ? 3 : 0)}%`,
                  }}
                />
              </div>

              {/* Detalle al pasar el cursor, sin depender de JavaScript. */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded border border-line bg-surface px-2 py-1 whitespace-nowrap shadow-sm group-hover:block">
                <p className="text-[0.6875rem] font-medium text-ink">{day.label}</p>
                <p className="tabular text-[0.6875rem] text-ink-soft">
                  {day.calls} llamadas · {day.appointments} citas
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="tabular text-[0.625rem] text-ink-faint">
          {days[0]?.label ?? ''}
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-ink-soft">
            <span className="h-2 w-2 rounded-[2px] bg-sunken" />
            Llamadas
          </span>
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-ink-soft">
            <span className="h-2 w-2 rounded-[2px] bg-agent" />
            Con cita
          </span>
        </div>
        <span className="tabular text-[0.625rem] text-ink-faint">
          {days[days.length - 1]?.label ?? ''}
        </span>
      </div>
    </div>
  );
}
