import { Skeleton } from '@/components/ui/states';

/**
 * Esqueleto de carga con la misma silueta que la vista que sustituye, para que
 * el contenido no dé un salto al aparecer.
 */
export function PageSkeleton({
  cards = 2,
  withMetrics = false,
}: {
  cards?: number;
  withMetrics?: boolean;
}) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <div>
        <Skeleton className="mb-2 h-3 w-24" />
        <Skeleton className="h-8 w-64" />
      </div>

      {withMetrics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-card" />
          ))}
        </div>
      ) : null}

      {Array.from({ length: cards }, (_, index) => (
        <Skeleton key={index} className="h-64 rounded-card" />
      ))}
    </div>
  );
}
