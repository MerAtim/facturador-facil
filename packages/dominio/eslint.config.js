import { crearConfig } from '@facturador/config/eslint';

export default crearConfig({
  directorio: import.meta.dirname,
  importsProhibidos: [
    {
      regex: '^[^.]',
      message: 'El dominio no depende de librerías externas ni de otras capas.',
    },
  ],
});
