'use client';

import { PaperPlaneTilt, Robot, UploadSimple } from '@phosphor-icons/react';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  publishConfiguration,
  type PublishState,
} from '@/app/(app)/personalizacion/actions';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { inputClasses } from '@/components/ui/field';
import { Note } from '@/components/ui/states';

const INITIAL: PublishState = { error: null, notice: null, warning: null };

function PublishButton({ published }: { published: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <UploadSimple size={16} />
      {pending ? 'Publicando…' : published ? 'Volver a publicar' : 'Publicar'}
    </Button>
  );
}

export function PublishPanel({ published }: { published: boolean }) {
  const [state, formAction] = useActionState(publishConfiguration, INITIAL);

  return (
    <Card>
      <CardHeader title="Publicar" eyebrow="Llevarlo al teléfono" />
      <CardBody className="space-y-4">
        <p className="text-sm text-ink-soft">
          Guardar deja los cambios en el panel. Publicar los envía a Vapi: recompone el
          prompt con los tratamientos y el horario actuales, actualiza el asistente y
          asigna el número al agente.
        </p>

        {state.error ? <Note tone="alert">{state.error}</Note> : null}
        {state.notice ? <Note tone="ok">{state.notice}</Note> : null}
        {state.warning ? <Note tone="warn">{state.warning}</Note> : null}

        <form action={formAction}>
          <PublishButton published={published} />
        </form>
      </CardBody>
    </Card>
  );
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export function TestPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const message = draft.trim();
    if (!message || busy) return;

    setDraft('');
    setError(null);
    setTurns((current) => [...current, { role: 'user', text: message }]);
    setBusy(true);

    try {
      const response = await fetch('/api/agent/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const data: unknown = await response.json();
      const record = (data ?? {}) as { reply?: string; error?: string };

      if (!response.ok) {
        setError(record.error ?? 'No se pudo probar el agente.');
        return;
      }

      setTurns((current) => [
        ...current,
        { role: 'assistant', text: record.reply ?? '' },
      ]);
    } catch {
      setError('No se pudo contactar con el servidor. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Probar el prompt" eyebrow="Sin tocar la agenda" />
      <CardBody className="space-y-4">
        <p className="text-sm text-ink-soft">
          Escribe como lo haría un paciente para comprobar el tono y las respuestas. Esta
          prueba no tiene acceso a las herramientas, así que no consulta ni reserva nada
          en el calendario.
        </p>

        {turns.length > 0 ? (
          <ol className="max-h-80 space-y-2.5 overflow-y-auto rounded-md border border-line bg-paper p-3">
            {turns.map((turn, index) => (
              <li
                key={index}
                className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <p
                  className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                    turn.role === 'user'
                      ? 'bg-ink text-white'
                      : 'border border-agent-line bg-agent-soft text-ink'
                  }`}
                >
                  {turn.text}
                </p>
              </li>
            ))}
            {busy ? (
              <li className="flex justify-start">
                <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-faint">
                  Pensando…
                </p>
              </li>
            ) : null}
          </ol>
        ) : (
          <div className="flex flex-col items-center rounded-md border border-dashed border-line px-6 py-8 text-center">
            <Robot size={24} className="mb-2 text-ink-faint" />
            <p className="text-sm text-ink-soft">
              Prueba con «¿Cuánto dura una limpieza?» o «¿Dónde están?».
            </p>
          </div>
        )}

        {error ? <Note tone="alert">{error}</Note> : null}

        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Escribe como un paciente…"
            maxLength={500}
            className={inputClasses}
            aria-label="Mensaje de prueba"
          />
          <Button type="button" onClick={() => void send()} disabled={busy || !draft.trim()}>
            <PaperPlaneTilt size={16} />
            <span className="sr-only">Enviar</span>
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
