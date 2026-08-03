import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'agent' | 'ok' | 'warn' | 'alert';

const PILL_TONES: Record<Tone, string> = {
  neutral: 'border-line-strong bg-sunken text-ink-soft',
  agent: 'border-agent-line bg-agent-soft text-agent',
  ok: 'border-ok/25 bg-ok-soft text-ok',
  warn: 'border-warn/25 bg-warn-soft text-warn',
  alert: 'border-alert/25 bg-alert-soft text-alert',
};

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Una pantalla vacía es una invitación a actuar: dice qué falta y cuál es el
 * siguiente paso, nunca solo «no hay datos».
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-ink-faint">{icon}</div> : null}
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm text-ink-soft">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

const NOTE_TONES: Record<Tone, string> = {
  neutral: 'border-line bg-sunken text-ink-soft',
  agent: 'border-agent-line bg-agent-soft text-agent',
  ok: 'border-ok/25 bg-ok-soft text-ok',
  warn: 'border-warn/25 bg-warn-soft text-warn',
  alert: 'border-alert/25 bg-alert-soft text-alert',
};

/** Aviso en línea. Explica qué pasó y qué hacer, sin disculparse. */
export function Note({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${NOTE_TONES[tone]}`}>
      {children}
    </div>
  );
}

/** Bloque de carga con la misma silueta que el contenido que sustituye. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-sunken ${className}`} />;
}
