import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow mb-2">Error 404</p>
      <h1 className="text-2xl">Aquí no hay nada</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        La página que buscas no existe, o pertenece a otra clínica.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center rounded-md bg-agent px-4 text-sm font-medium text-white hover:bg-agent/90"
      >
        Volver al resumen
      </Link>
    </main>
  );
}
