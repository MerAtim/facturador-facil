import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Configuración común a todos los paquetes.
 * `importsProhibidos` define qué no puede importar cada capa para respetar la regla de dependencia.
 */
export function crearConfig({ directorio, importsProhibidos = [] }) {
  return defineConfig(
    { ignores: ['dist', 'coverage', 'eslint.config.js'] },
    {
      files: ['**/*.ts', '**/*.tsx'],
      extends: [
        js.configs.recommended,
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
      ],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: directorio,
        },
      },
      rules: {
        eqeqeq: 'error',
        'no-console': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        'no-restricted-imports': ['error', { patterns: importsProhibidos }],
      },
    },
    prettier,
  );
}
