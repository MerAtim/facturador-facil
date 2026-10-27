import { crearConfig } from '@facturador/config/eslint';

export default crearConfig({
  directorio: import.meta.dirname,
  importsProhibidos: [
    {
      group: ['react-native-paper', 'react-native-paper/*'],
      message:
        'La app usa el tema y los componentes de @facturador/ui, no la librería directamente.',
    },
  ],
});
