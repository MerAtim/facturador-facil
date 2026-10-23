import { crearConfig } from '@facturador/config/eslint';

export default crearConfig({
  directorio: import.meta.dirname,
  importsProhibidos: [
    {
      regex: '^(?!\\.|@facturador/dominio$)',
      message:
        'La capa de aplicación solo depende del dominio. La infraestructura entra por puertos.',
    },
  ],
});
