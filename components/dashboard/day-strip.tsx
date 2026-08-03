/**
 * La jornada de hoy como una sola barra de tiempo.
 *
 * Es lo primero que ve el dueño de la clínica porque es como se lee una consulta:
 * la hoja del día. De un vistazo responde qué queda libre y qué ha llenado el
 * agente, sin tener que interpretar ninguna métrica.
 *
 * Todo se recibe en minutos desde medianoche, ya convertidos a la hora local de
 * la clínica, para que el componente no tenga que saber nada de zonas horarias.
 */

export interface DaySpan {
  from: number;
  to: number;
}

export interface DayBlock extends DaySpan {
  id: string;
  label: string;
  time: string;
}

function formatHour(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:00`;
}

export function DayStrip({
  openRanges,
  blocks,
  nowMinutes,
}: {
  openRanges: DaySpan[];
  blocks: DayBlock[];
  /** Minuto actual, o null si hoy no es un día de atención. */
  nowMinutes: number | null;
}) {
  if (openRanges.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-soft">
        Hoy la clínica está cerrada según el horario configurado.
      </p>
    );
  }

  const dayStart = Math.min(...openRanges.map((range) => range.from));
  const dayEnd = Math.max(...openRanges.map((range) => range.to));
  const span = dayEnd - dayStart;

  const percent = (minutes: number) => ((minutes - dayStart) / span) * 100;

  // Marcas cada hora en punto, aligeradas si la jornada es muy larga.
  const step = span > 600 ? 120 : 60;
  const ticks: number[] = [];
  for (let m = Math.ceil(dayStart / step) * step; m <= dayEnd; m += step) {
    ticks.push(m);
  }

  const showNow = nowMinutes !== null && nowMinutes >= dayStart && nowMinutes <= dayEnd;

  return (
    <div className="px-5 pt-5 pb-4">
      <div className="relative h-14">
        {/* Fondo: solo los tramos en los que la clínica está abierta. La pausa
            de mediodía queda como un hueco real, no como una zona coloreada. */}
        {openRanges.map((range) => (
          <div
            key={`${range.from}-${range.to}`}
            className="absolute top-0 h-14 rounded-sm bg-sunken"
            style={{
              left: `${percent(range.from)}%`,
              width: `${percent(range.to) - percent(range.from)}%`,
            }}
          />
        ))}

        {/* Citas agendadas por el agente. */}
        {blocks.map((block) => (
          <div
            key={block.id}
            title={`${block.time} · ${block.label}`}
            className="absolute top-0 h-14 overflow-hidden rounded-sm border border-agent/25 bg-agent-soft px-1.5 py-1"
            style={{
              left: `${percent(block.from)}%`,
              width: `${Math.max(percent(block.to) - percent(block.from), 1.5)}%`,
            }}
          >
            <p className="tabular text-[0.625rem] leading-tight text-agent">
              {block.time}
            </p>
            <p className="truncate text-[0.6875rem] leading-tight font-medium text-agent">
              {block.label}
            </p>
          </div>
        ))}

        {/* Ahora. */}
        {showNow ? (
          <div
            className="absolute -top-1 h-16 w-px bg-alert"
            style={{ left: `${percent(nowMinutes)}%` }}
          >
            <span className="absolute -top-1 -left-[3px] block h-[7px] w-[7px] rounded-full bg-alert" />
          </div>
        ) : null}
      </div>

      <div className="relative mt-1.5 h-4">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="tabular absolute -translate-x-1/2 text-[0.625rem] text-ink-faint"
            style={{ left: `${percent(tick)}%` }}
          >
            {formatHour(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}
