// Solo para tests: usa node:crypto, que no existe en la app.
import { generateKeyPairSync, sign } from 'node:crypto';

import { cadenaBits, conjunto, contexto, entero, nulo, oid, secuencia, utcTime, utf8 } from './der';
import type { Firmador } from './firmador';
import { OID } from './oids';

export function crearFirmadorDePrueba() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const firmador: Firmador = {
    clavePublica: () =>
      Promise.resolve(new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }))),
    firmar: (datos) => Promise.resolve(new Uint8Array(sign('sha256', datos, privateKey))),
  };

  return { firmador, publicKey };
}

/** Certificado autofirmado, equivalente al que ARCA emite a partir del CSR. */
export async function crearCertificadoDePrueba(firmador: Firmador): Promise<Uint8Array> {
  const algoritmo = secuencia(oid(OID.sha256ConRsa), nulo());
  const nombre = secuencia(conjunto(secuencia(oid(OID.nombreComun), utf8('prueba'))));

  const tbs = secuencia(
    contexto(0, entero(2)),
    entero(Uint8Array.of(0x8a, 0x01, 0x02)),
    algoritmo,
    nombre,
    secuencia(utcTime(new Date('2026-01-01T00:00:00Z')), utcTime(new Date('2027-01-01T00:00:00Z'))),
    nombre,
    await firmador.clavePublica(),
  );

  return secuencia(tbs, algoritmo, cadenaBits(await firmador.firmar(tbs)));
}
