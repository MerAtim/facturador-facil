import { aBase64, desdeBase64, type Firmador } from '@facturador/arca';

import AlmacenClaves from '../../modules/almacen-claves';

/** Firmador respaldado por Keystore o Keychain: la clave privada nunca llega a JS. */
export const crearFirmadorDelDispositivo = (alias: string): Firmador => ({
  clavePublica: async () => desdeBase64(await AlmacenClaves.clavePublica(alias)),
  firmar: async (datos) => desdeBase64(await AlmacenClaves.firmar(alias, aBase64(datos))),
});
