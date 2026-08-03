'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signUp, type AuthFormState } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, inputClasses } from '@/components/ui/field';
import { Note } from '@/components/ui/states';

const INITIAL: AuthFormState = { error: null, notice: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Creando la cuenta…' : 'Crear cuenta'}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signUp, INITIAL);

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <Field
            label="Nombre de la clínica"
            htmlFor="clinicName"
            hint="Es el nombre con el que el agente se presentará al teléfono."
          >
            <input
              id="clinicName"
              name="clinicName"
              type="text"
              required
              maxLength={120}
              className={inputClasses}
              placeholder="Clínica Dental Sonrisa"
            />
          </Field>

          <Field label="Tu nombre" htmlFor="fullName">
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              className={inputClasses}
              placeholder="María López"
            />
          </Field>

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

          <Field label="Contraseña" htmlFor="password" hint="Mínimo 8 caracteres.">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputClasses}
            />
          </Field>

          {state.error ? <Note tone="alert">{state.error}</Note> : null}
          {state.notice ? <Note tone="ok">{state.notice}</Note> : null}

          <Submit />
        </form>
      </CardBody>
    </Card>
  );
}
