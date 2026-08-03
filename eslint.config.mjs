// Next.js 16 eliminó `next lint`: el linting se ejecuta con la CLI de ESLint
// sobre esta flat config (`pnpm lint`). eslint-config-next v16 ya exporta
// arrays de flat config, así que no hace falta FlatCompat.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      // Fichero generado por `supabase gen types`.
      'lib/types/database.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Sin esta lista, `eslint .` solo recorrería los .js y no analizaría ni un
    // solo fichero del proyecto: en la flat config de ESLint 9 el descubrimiento
    // de ficheros por directorio depende de los patrones `files` declarados.
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
