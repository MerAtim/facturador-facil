import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * El build de las pruebas de punta a punta usa ARCA simulado (ver src/composicion.ts). Se instala
 * como otra app para que nunca reemplace a la real ni comparta sus datos.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (process.env.EXPO_PUBLIC_DOBLE_DE_ARCA !== 'si') return base;

  return {
    ...base,
    name: 'Facturador (pruebas)',
    android: { ...base.android, package: 'com.facturadorfacil.app.pruebas' },
    ios: { ...base.ios, bundleIdentifier: 'com.facturadorfacil.app.pruebas' },
  };
};
