/**
 * Hook de resolución de módulos que enseña a Node el alias `@/` de tsconfig.
 *
 * El runner de pruebas de Node no lee `compilerOptions.paths`, así que sin esto
 * cualquier módulo que importe `@/lib/...` fallaría al ejecutarse fuera de Next.
 *
 * Además añade la extensión: TypeScript permite importar sin ella
 * (`@/lib/types/domain`), pero Node exige la ruta completa del archivo.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = new URL('../', import.meta.url);
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

function firstExisting(baseUrl) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = new URL(baseUrl.href + suffix);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = firstExisting(new URL(specifier.slice(2), projectRoot));
    if (resolved) return nextResolve(resolved.href, context);
  }
  return nextResolve(specifier, context);
}
