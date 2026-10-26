import { X509Certificate, createHash, verify } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { firmarCms } from './cms';
import { hijos, leer, type Elemento } from './der';
import { crearCertificadoDePrueba, crearFirmadorDePrueba } from './paraPruebas';

const contenido = new TextEncoder().encode('<loginTicketRequest/>');
const ahora = new Date('2026-10-26T12:00:00Z');

async function firmar() {
  const { firmador, publicKey } = crearFirmadorDePrueba();
  const certificado = await crearCertificadoDePrueba(firmador);
  const cms = await firmarCms(contenido, certificado, firmador, ahora);
  return { cms, certificado, publicKey };
}

const hijo = (elemento: Elemento | undefined, indice: number) => {
  if (!elemento) throw new Error('Elemento ausente');
  const resultado = hijos(elemento)[indice];
  if (!resultado) throw new Error(`Hijo ${String(indice)} ausente`);
  return resultado;
};

function desarmar(cms: Uint8Array) {
  const datosFirmados = hijo(hijo(leer(cms), 1), 0);
  const firmante = hijo(hijo(datosFirmados, 4), 0);
  return {
    contenidoIncluido: hijo(hijo(hijo(datosFirmados, 2), 1), 0).contenido,
    certificados: hijo(datosFirmados, 3),
    identificador: hijo(firmante, 1),
    atributos: hijo(firmante, 3),
    firma: hijo(firmante, 5).contenido,
  };
}

describe('firmarCms', () => {
  it('incluye el contenido y el certificado del firmante', async () => {
    const { cms, certificado } = await firmar();
    const partes = desarmar(cms);

    expect(partes.contenidoIncluido).toEqual(contenido);
    expect(partes.certificados.contenido).toEqual(certificado);
  });

  it('identifica al firmante por emisor y número de serie del certificado', async () => {
    const { cms, certificado } = await firmar();
    const x509 = new X509Certificate(certificado);
    const [, numeroDeSerie] = hijos(desarmar(cms).identificador);

    expect(numeroDeSerie?.contenido).toEqual(
      Uint8Array.from(Buffer.from(`00${x509.serialNumber}`, 'hex')),
    );
  });

  it('firma los atributos, que incluyen el resumen SHA-256 del contenido', async () => {
    const { cms, publicKey } = await firmar();
    const { atributos, firma } = desarmar(cms);
    const comoConjunto = Uint8Array.from(atributos.bytes);
    comoConjunto[0] = 0x31;

    expect(verify('sha256', comoConjunto, publicKey, firma)).toBe(true);
    const resumen = createHash('sha256').update(contenido).digest();
    expect(Buffer.from(atributos.bytes).includes(resumen)).toBe(true);
  });

  it('rechaza un certificado que no es X.509', async () => {
    const { firmador } = crearFirmadorDePrueba();

    await expect(firmarCms(contenido, Uint8Array.of(0x30, 0x00), firmador, ahora)).rejects.toThrow(
      'TBSCertificate',
    );
    await expect(
      firmarCms(contenido, Uint8Array.of(0x30, 0x04, 0x30, 0x02, 0x05, 0x00), firmador, ahora),
    ).rejects.toThrow('formato inesperado');
  });
});
