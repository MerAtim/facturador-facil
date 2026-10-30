// Solo para tests: usa node:crypto, que no existe en la app.
import { generateKeyPairSync, sign } from 'node:crypto';

import type { AlmacenDeClaves } from '../certificados/pedidoDeCertificado';
import type { Firmador } from './firmador';

export function crearFirmadorDePrueba() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const firmador: Firmador = {
    clavePublica: () =>
      Promise.resolve(new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }))),
    firmar: (datos) => Promise.resolve(new Uint8Array(sign('sha256', datos, privateKey))),
  };

  return { firmador, publicKey };
}

export { crearCertificadoDePrueba, type OpcionesDeCertificado } from '../doble/certificadoDePrueba';

/** Almacén de claves en memoria con claves RSA reales, como el del dispositivo. */
export function crearAlmacenDeClavesDePrueba() {
  const claves = new Map<string, ReturnType<typeof crearFirmadorDePrueba>>();
  const generadas: string[] = [];

  const almacen: AlmacenDeClaves = {
    existeClave: (alias) => claves.has(alias),
    generarClave: (alias) => {
      if (claves.has(alias)) return Promise.reject(new Error('CLAVE_EXISTENTE'));
      generadas.push(alias);
      claves.set(alias, crearFirmadorDePrueba());
      return Promise.resolve();
    },
    clavePublica: (alias) => conClave(alias, (firmador) => firmador.clavePublica()),
    firmar: (alias, datos) => conClave(alias, (firmador) => firmador.firmar(datos)),
  };

  /** Como el módulo nativo, usar un alias sin clave rechaza la promesa. */
  const conClave = (alias: string, usar: (firmador: Firmador) => Promise<Uint8Array>) => {
    const encontrada = claves.get(alias);
    return encontrada ? usar(encontrada.firmador) : Promise.reject(new Error('SIN_CLAVE'));
  };

  return { almacen, generadas, clave: (alias: string) => claves.get(alias) };
}
