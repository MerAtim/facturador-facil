import { crearConfig } from '@facturador/config/eslint';

export default crearConfig({
  directorio: import.meta.dirname,
  importsProhibidos: [
    {
      group: ['@facturador/ui', 'react', 'react-native', 'expo', 'expo-*'],
      message: 'Los adaptadores de ARCA no conocen la presentación.',
    },
  ],
});
