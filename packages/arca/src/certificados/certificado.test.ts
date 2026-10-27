import { AlmacenEnMemoria } from '@facturador/aplicacion';
import { Cuit } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { aPem } from '../criptografia/codificacion';
import {
  crearAlmacenDeClavesDePrueba,
  crearCertificadoDePrueba,
  type OpcionesDeCertificado,
} from '../criptografia/paraPruebas';
import { crearAlmacenDeCertificados } from './almacenDeCertificados';
import { leerCertificado, validarCertificado } from './certificado';
import {
  aliasDeClave,
  crearPedidoDeCertificado,
  firmadorDeClave,
  type Titular,
} from './pedidoDeCertificado';

const cuit = Cuit.crear('20123456786');
if (!cuit.ok) throw new Error('CUIT de prueba inválido');

const titular: Titular = { ambiente: 'homologacion', cuit: cuit.valor, razonSocial: 'Pérez SRL' };
const ahora = new Date('2026-06-01T00:00:00Z');

/**
 * Generar claves RSA es lento: todos los tests comparten un dispositivo, que genera una clave por
 * ambiente la primera vez y después la reutiliza, y un segundo teléfono para los certificados ajenos.
 */
const dispositivo = crearAlmacenDeClavesDePrueba().almacen;
const otroTelefono = crearAlmacenDeClavesDePrueba().almacen;

/** Un certificado emitido para la clave de `claves`, que la genera si todavía no la tiene. */
async function conCertificado(
  opciones: OpcionesDeCertificado = {},
  deTitular = titular,
  claves = dispositivo,
) {
  await crearPedidoDeCertificado(deTitular, claves);
  const certificado = await crearCertificadoDePrueba(
    firmadorDeClave(claves, aliasDeClave(deTitular)),
    opciones,
  );
  return { claves, certificado };
}

const motivo = (resultado: Awaited<ReturnType<typeof validarCertificado>>) =>
  resultado.ok ? 'valido' : resultado.error.motivo;

describe('validarCertificado', () => {
  it('acepta el certificado de ARCA para la clave del dispositivo, en DER', async () => {
    const { claves, certificado } = await conCertificado();

    const resultado = await validarCertificado(certificado, titular, claves, ahora);

    expect(resultado.ok && resultado.valor.vigenteHasta.toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('acepta el mismo certificado en PEM', async () => {
    const { claves, certificado } = await conCertificado();
    const pem = new TextEncoder().encode(aPem('CERTIFICATE', certificado));

    const resultado = await validarCertificado(pem, titular, claves, ahora);

    expect(resultado.ok && resultado.valor.der).toEqual(certificado);
  });

  it('rechaza un certificado emitido para otra clave', async () => {
    const { claves } = await conCertificado();
    const deOtroTelefono = await conCertificado({}, titular, otroTelefono);

    expect(
      motivo(await validarCertificado(deOtroTelefono.certificado, titular, claves, ahora)),
    ).toBe('no_corresponde_a_la_clave');
  });

  it('rechaza un certificado si el dispositivo no generó la clave', async () => {
    const { certificado } = await conCertificado();
    const sinClave = crearAlmacenDeClavesDePrueba().almacen;

    expect(motivo(await validarCertificado(certificado, titular, sinClave, ahora))).toBe(
      'no_corresponde_a_la_clave',
    );
  });

  it('rechaza un certificado de otro CUIT', async () => {
    const { claves, certificado } = await conCertificado({ cuit: '27333333339' });

    expect(motivo(await validarCertificado(certificado, titular, claves, ahora))).toBe(
      'cuit_distinto',
    );
  });

  it('avisa si el certificado es del otro ambiente', async () => {
    const { claves, certificado } = await conCertificado({ emisor: 'Computadores' });

    expect(motivo(await validarCertificado(certificado, titular, claves, ahora))).toBe(
      'es_de_otro_ambiente',
    );
  });

  it('en producción acepta el emisor de producción', async () => {
    const enProduccion: Titular = { ...titular, ambiente: 'produccion' };
    const { claves, certificado } = await conCertificado({ emisor: 'Computadores' }, enProduccion);

    expect(motivo(await validarCertificado(certificado, enProduccion, claves, ahora))).toBe(
      'valido',
    );
  });

  it('rechaza un certificado que no emitió ARCA', async () => {
    const { claves, certificado } = await conCertificado({ emisor: 'Otra autoridad' });

    expect(motivo(await validarCertificado(certificado, titular, claves, ahora))).toBe(
      'emisor_desconocido',
    );
  });

  it.each([
    ['2025-12-31T23:59:59Z', 'todavia_no_vigente'],
    ['2027-01-01T00:00:01Z', 'vencido'],
  ])('el %s el certificado está %s', async (instante, esperado) => {
    const { claves, certificado } = await conCertificado();

    expect(motivo(await validarCertificado(certificado, titular, claves, new Date(instante)))).toBe(
      esperado,
    );
  });

  it.each([
    ['texto cualquiera', new TextEncoder().encode('hola')],
    [
      'un PEM de otra cosa',
      new TextEncoder().encode('-----BEGIN CERTIFICATE REQUEST-----\nAA==\n'),
    ],
    ['bytes sueltos', Uint8Array.of(0x30, 0x03, 0x02, 0x01)],
    ['un archivo vacío', new Uint8Array()],
  ])('rechaza %s', async (_, archivo) => {
    const { claves } = await conCertificado();

    expect(motivo(await validarCertificado(archivo, titular, claves, ahora))).toBe(
      'no_es_un_certificado',
    );
  });

  it('rechaza un archivo demasiado grande sin leerlo', async () => {
    const { claves } = await conCertificado();
    const enorme = new Uint8Array(16 * 1024 + 1);

    expect(motivo(await validarCertificado(enorme, titular, claves, ahora))).toBe(
      'archivo_demasiado_grande',
    );
  });
});

describe('leerCertificado', () => {
  it('lee las fechas en GeneralizedTime', async () => {
    const { certificado } = await conCertificado({
      desde: new Date('2050-01-01T00:00:00Z'),
      hasta: new Date('2052-03-04T05:06:07Z'),
      fechasGeneralizadas: true,
    });

    expect(leerCertificado(certificado)?.vigenteHasta.toISOString()).toBe(
      '2052-03-04T05:06:07.000Z',
    );
  });

  it('interpreta los años de UTCTime anteriores a 2000', async () => {
    const { certificado } = await conCertificado({ desde: new Date('1999-05-01T00:00:00Z') });

    expect(leerCertificado(certificado)?.vigenteDesde.getUTCFullYear()).toBe(1999);
  });

  it('rechaza datos de más después del certificado', async () => {
    const { certificado } = await conCertificado();

    expect(leerCertificado(Uint8Array.of(...certificado, 0))).toBeUndefined();
  });
});

describe('AlmacenDeCertificados', () => {
  it('guarda y lee el certificado de cada ambiente por separado', async () => {
    const { certificado } = await conCertificado();
    const almacen = crearAlmacenDeCertificados(new AlmacenEnMemoria());

    await almacen.guardar(titular, certificado);

    expect((await almacen.leer(titular))?.der).toEqual(certificado);
    expect(await almacen.leer({ ...titular, ambiente: 'produccion' })).toBeUndefined();
  });

  it.each([
    ['no es base64', '%%%'],
    ['no es un certificado', 'AAAA'],
  ])('si lo guardado %s, no hay certificado', async (_, guardado) => {
    const memoria = new AlmacenEnMemoria();
    await memoria.guardar('certificado.homologacion.20123456786', guardado);

    expect(await crearAlmacenDeCertificados(memoria).leer(titular)).toBeUndefined();
  });
});
