'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { savePhoneNumber, type ActionState } from '@/app/(app)/integraciones/actions';
import { Button } from '@/components/ui/button';
import { Field, inputClasses } from '@/components/ui/field';
import { Note } from '@/components/ui/states';

const INITIAL: ActionState = { error: null, notice: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}

export function PhoneNumberForm({ current }: { current: string | null }) {
  const [state, formAction] = useActionState(savePhoneNumber, INITIAL);

  return (
    <form action={formAction} className="space-y-3">
      <Field
        label="Identificador del número en Vapi"
        htmlFor="phoneNumberId"
        hint="Lo encuentras en el panel de Vapi, en Phone Numbers. Es un UUID, no el número marcable."
      >
        <input
          id="phoneNumberId"
          name="phoneNumberId"
          type="text"
          defaultValue={current ?? ''}
          placeholder="1a2b3c4d-5e6f-7890-abcd-ef1234567890"
          className={`${inputClasses} font-mono text-xs`}
        />
      </Field>

      {state.error ? <Note tone="alert">{state.error}</Note> : null}
      {state.notice ? <Note tone="ok">{state.notice}</Note> : null}

      <Submit />
    </form>
  );
}
