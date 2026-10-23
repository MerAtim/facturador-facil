import { crearConfig } from '@facturador/config/eslint';

export default crearConfig({
  directorio: import.meta.dirname,
  importsProhibidos: [
    {
      group: ['@facturador/arca', '@facturador/aplicacion'],
      message: 'Los componentes de UI no conocen casos de uso ni infraestructura.',
    },
  ],
});
