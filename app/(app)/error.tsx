'use client';

import { ArrowClockwise } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';

/**
 * Un error explica qué pasó y cómo seguir. No se disculpa ni muestra el
 * mensaje técnico, que podría revelar detalles internos.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card>
      <CardBody className="flex flex-col items-center px-6 py-14 text-center">
        <p className="font-display text-lg font-semibold">Esta pantalla no cargó</p>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          Puede ser un corte momentáneo con la base de datos o con Google. Vuelve a
          intentarlo; si sigue igual, revisa las conexiones en Integraciones.
        </p>
        {error.digest ? (
          <p className="tabular mt-3 text-xs text-ink-faint">
            Referencia: {error.digest}
          </p>
        ) : null}
        <div className="mt-6">
          <Button type="button" onClick={reset}>
            <ArrowClockwise size={16} />
            Reintentar
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
