import { firmadorDeClave, type Firmador } from '@facturador/arca';

import { almacenDeClavesDelDispositivo } from './almacenDeClavesDelDispositivo';

/** Firmador respaldado por Keystore o Keychain: la clave privada nunca llega a JS. */
export const crearFirmadorDelDispositivo = (alias: string): Firmador =>
  firmadorDeClave(almacenDeClavesDelDispositivo, alias);
