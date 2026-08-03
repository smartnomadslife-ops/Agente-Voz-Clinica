import Link from 'next/link';
import { SignupForm } from '@/app/(auth)/signup/signup-form';

export const metadata = { title: 'Registrar clínica · Panel de clínica' };

export default function SignupPage() {
  return (
    <>
      <SignupForm />

      <p className="mt-6 text-sm text-ink-soft">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-medium text-agent hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
