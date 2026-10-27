import { aBase64, desdeBase64, type AlmacenDeClaves } from '@facturador/arca';

import AlmacenClaves from '../../modules/almacen-claves';

/** Claves en Keystore o Keychain: la privada nunca llega a JS. */
export const almacenDeClavesDelDispositivo: AlmacenDeClaves = {
  existeClave: (alias) => AlmacenClaves.existeClave(alias),
  generarClave: (alias) => AlmacenClaves.generarClave(alias),
  clavePublica: async (alias) => desdeBase64(await AlmacenClaves.clavePublica(alias)),
  firmar: async (alias, datos) => desdeBase64(await AlmacenClaves.firmar(alias, aBase64(datos))),
};
