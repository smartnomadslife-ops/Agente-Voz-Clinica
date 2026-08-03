import Link from 'next/link';
import { LoginForm } from '@/app/(auth)/login/login-form';

export const metadata = { title: 'Entrar · Panel de clínica' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <>
      <LoginForm redirectTo={redirectTo ?? '/dashboard'} />

      <p className="mt-6 text-sm text-ink-soft">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/signup" className="font-medium text-agent hover:underline">
          Registra tu clínica
        </Link>
      </p>
    </>
  );
}
