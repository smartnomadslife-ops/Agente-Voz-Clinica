'use client';

import {
  CalendarBlank,
  Gauge,
  PlugsConnected,
  SignOut,
  SlidersHorizontal,
  Waveform,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/(auth)/actions';

const NAV = [
  { href: '/dashboard', label: 'Resumen', Icon: Gauge },
  { href: '/calendario', label: 'Calendario', Icon: CalendarBlank },
  { href: '/transcripciones', label: 'Transcripciones', Icon: Waveform },
  { href: '/personalizacion', label: 'Personalización', Icon: SlidersHorizontal },
  { href: '/integraciones', label: 'Integraciones', Icon: PlugsConnected },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  clinicName,
  userLabel,
}: {
  clinicName: string;
  userLabel: string;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Escritorio: raíl fijo a la izquierda. */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-paper lg:flex">
        <div className="px-5 py-6">
          <p className="eyebrow mb-1.5">Clínica</p>
          <p className="font-display text-[0.9375rem] leading-snug font-semibold break-words text-ink">
            {clinicName}
          </p>
        </div>

        <nav className="flex-1 px-3">
          <ul className="space-y-0.5">
            {NAV.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-agent-soft font-medium text-agent'
                        : 'text-ink-soft hover:bg-sunken hover:text-ink'
                    }`}
                  >
                    <Icon size={18} weight={active ? 'fill' : 'regular'} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-line px-3 py-3">
          <p className="truncate px-3 pb-2 text-xs text-ink-faint">{userLabel}</p>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
            >
              <SignOut size={18} />
              Salir
            </button>
          </form>
        </div>
      </aside>

      {/* Móvil y tableta: barra superior con navegación desplazable. */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="truncate font-display text-sm font-semibold text-ink">
            {clinicName}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Salir"
              className="rounded-md p-1.5 text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <SignOut size={18} />
            </button>
          </form>
        </div>

        <nav className="overflow-x-auto">
          <ul className="flex min-w-max gap-1 px-3 pb-2">
            {NAV.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                      active
                        ? 'bg-agent-soft font-medium text-agent'
                        : 'text-ink-soft hover:bg-sunken'
                    }`}
                  >
                    <Icon size={16} weight={active ? 'fill' : 'regular'} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
    </>
  );
}
