'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type AuthFormState } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, inputClasses } from '@/components/ui/field';
import { Note } from '@/components/ui/states';

// El estado inicial vive aquí y no en actions.ts: un fichero "use server" solo
// puede exportar funciones asíncronas.
const INITIAL: AuthFormState = { error: null, notice: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar'}
    </Button>
  );
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(signIn, INITIAL);

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <Field label="Correo" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={inputClasses}
              placeholder="tu@clinica.com"
            />
          </Field>

          <Field label="Contraseña" htmlFor="password">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClasses}
            />
          </Field>

          {state.error ? <Note tone="alert">{state.error}</Note> : null}

          <Submit />
        </form>
      </CardBody>
    </Card>
  );
}
