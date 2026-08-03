import { redirect } from 'next/navigation';

/**
 * La raíz no muestra nada: proxy.ts ya ha decidido si hay sesión, así que aquí
 * solo queda llevar al panel.
 */
export default function RootPage() {
  redirect('/dashboard');
}
