import { crearConfig } from '@facturador/config/eslint';

export default crearConfig({
  directorio: import.meta.dirname,
  importsProhibidos: [
    {
      group: ['@facturador/ui', 'react', 'react-native', 'expo', 'expo-*'],
      message: 'Los documentos se arman como texto, sin conocer la presentación.',
    },
  ],
});
