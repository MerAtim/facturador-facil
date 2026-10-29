import { crearConfig } from '@facturador/config/eslint';

export default crearConfig({
  directorio: import.meta.dirname,
  importsProhibidos: [
    {
      group: ['@facturador/ui', 'react', 'react-native', 'expo', 'expo-*'],
      message: 'El formato del respaldo no depende de la plataforma: lo que necesita se inyecta.',
    },
  ],
});
