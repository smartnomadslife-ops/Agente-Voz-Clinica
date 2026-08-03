import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { requireSession } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Revalidación propia además de proxy.ts: si el matcher cambiara, este layout
  // seguiría protegiendo todo lo que cuelga de él.
  const session = await requireSession();

  const { data: clinic } = await session.supabase
    .from('clinics')
    .select('name')
    .eq('id', session.clinicId)
    .maybeSingle();

  return (
    <div className="min-h-dvh">
      <Sidebar
        clinicName={clinic?.name ?? 'Tu clínica'}
        userLabel={session.fullName ?? session.email ?? ''}
      />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
