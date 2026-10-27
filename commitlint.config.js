export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot arma los títulos solo y en grupos pueden pasar los 72 caracteres.
  ignores: [(mensaje) => /^build\(deps(-dev)?\): bump /.test(mensaje)],
  plugins: [
    {
      rules: {
        // Convención del equipo: en textos en español no se usan guiones como puntuación.
        'sin-guiones': ({ header }) => [
          !/\s[-–—]\s|[–—]/.test(header ?? ''),
          'no uses guiones en el mensaje, preferí comas o dos puntos',
        ],
      },
    },
  ],
  rules: {
    'sin-guiones': [2, 'always'],
    'header-max-length': [2, 'always', 72],
    'subject-case': [2, 'always', 'lower-case'],
    'scope-enum': [
      2,
      'always',
      ['dominio', 'aplicacion', 'arca', 'mobile', 'seguridad', 'ui', 'infra', 'deps', 'deps-dev'],
    ],
  },
};
