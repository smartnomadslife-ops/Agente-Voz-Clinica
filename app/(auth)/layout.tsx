import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="eyebrow mb-2">Agente de voz</p>
          <h1 className="text-2xl leading-tight">Panel de clínica</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
