import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

/** Los métodos que reciben SQL: el de la base de la app y los de expo-sqlite. */
const METODOS_SQL =
  '/^(ejecutar|consultar|execAsync|runAsync|getAllAsync|getFirstAsync|getEachAsync|prepareAsync|execSync|runSync|getAllSync|getFirstSync|prepareSync)$/';

/**
 * Configuración común a todos los paquetes.
 * `importsProhibidos` define qué no puede importar cada capa para respetar la regla de dependencia.
 */
export function crearConfig({ directorio, importsProhibidos = [] }) {
  return defineConfig(
    { ignores: ['dist', 'coverage', '*.config.js', '*.config.mjs'] },
    {
      files: ['**/*.ts', '**/*.tsx'],
      extends: [
        js.configs.recommended,
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
        security.configs.recommended,
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
        // El SQL es un texto fijo y los datos van como parámetros: así un dato nunca se ejecuta.
        'no-restricted-syntax': [
          'error',
          {
            selector: `CallExpression[callee.property.name=${METODOS_SQL}] > TemplateLiteral[expressions.length>0]`,
            message: 'No armes SQL insertando valores: pasalos como parámetros.',
          },
          {
            selector: `CallExpression[callee.property.name=${METODOS_SQL}] > BinaryExpression[operator="+"]`,
            message: 'No armes SQL concatenando texto: pasá los valores como parámetros.',
          },
        ],
        // Marca cualquier acceso con corchetes. Con noUncheckedIndexedAccess los tipos ya cubren ese riesgo.
        'security/detect-object-injection': 'off',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    prettier,
  );
}
