import { defineConfig } from 'vitest/config';

/**
 * Configuración común de tests. `coberturaMinima` es el porcentaje exigido en líneas,
 * funciones, ramas y sentencias.
 */
export function crearConfig({ coberturaMinima = 0 } = {}) {
  return defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      passWithNoTests: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
        reporter: ['text', 'lcov'],
        thresholds: {
          lines: coberturaMinima,
          functions: coberturaMinima,
          branches: coberturaMinima,
          statements: coberturaMinima,
        },
      },
    },
  });
}
