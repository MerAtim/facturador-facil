/// <reference types="node" />

import { pbkdf2Sync, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  cifrarRespaldo,
  crearCifradoDeRespaldos,
  descifrarRespaldo,
  TAMANIO_MAXIMO_DEL_RESPALDO,
  type PlataformaDelCifrado,
} from './archivoCifrado';

/** El costo más bajo admitido, para que los tests no tarden. */
const BARATO = 100_000;

/** La misma derivación que hace el teléfono en código nativo. */
const plataforma: PlataformaDelCifrado = {
  aleatorio: (cantidad) => new Uint8Array(randomBytes(cantidad)),
  derivar: (contrasena, sal, iteraciones) =>
    Promise.resolve(new Uint8Array(pbkdf2Sync(contrasena, sal, iteraciones, 32, 'sha256'))),
};

const contenido = new TextEncoder().encode('{"comprobantes":[]}');
const CONTRASENA = 'una contraseña larga';

const cifrar = (contrasena = CONTRASENA) =>
  cifrarRespaldo(contenido, contrasena, plataforma, BARATO);

const motivo = async (archivo: Uint8Array, contrasena = CONTRASENA) => {
  const resultado = await descifrarRespaldo(archivo, contrasena, plataforma);
  return resultado.ok ? undefined : resultado.error.motivo;
};

describe('archivo de respaldo', () => {
  it('se descifra con la misma contraseña', async () => {
    const resultado = await descifrarRespaldo(await cifrar(), CONTRASENA, plataforma);

    expect(resultado.ok && new TextDecoder().decode(resultado.valor)).toBe('{"comprobantes":[]}');
  });

  it('acepta la contraseña aunque llegue en otra forma Unicode', async () => {
    const archivo = await cifrar('contraseña segura');

    expect((await descifrarRespaldo(archivo, 'contraseña segura', plataforma)).ok).toBe(true);
  });

  it('guarda en el encabezado el costo con que se cifró', async () => {
    const archivo = await cifrar();

    expect(new TextDecoder().decode(archivo.subarray(0, 6))).toBe('FFRESP');
    expect([...archivo.subarray(6, 12)]).toEqual([1, 1, 0x00, 0x01, 0x86, 0xa0]);
  });

  it('no se lee el contenido sin descifrar', async () => {
    expect(new TextDecoder().decode(await cifrar())).not.toContain('comprobantes');
  });

  it('cada respaldo usa sal y nonce nuevos', async () => {
    const [uno, otro] = await Promise.all([cifrar(), cifrar()]);

    expect(uno.subarray(12, 52)).not.toEqual(otro.subarray(12, 52));
  });

  it('rechaza otra contraseña', async () => {
    expect(await motivo(await cifrar(), 'otra contraseña larga')).toBe(
      'contrasena_incorrecta_o_archivo_danado',
    );
  });

  it('detecta un byte cambiado en el contenido', async () => {
    const archivo = await cifrar();
    archivo[60] = (archivo[60] ?? 0) ^ 1;

    expect(await motivo(archivo)).toBe('contrasena_incorrecta_o_archivo_danado');
  });

  it('detecta un cambio en el encabezado, que va autenticado', async () => {
    const archivo = await cifrar();
    archivo[40] = (archivo[40] ?? 0) ^ 1;

    expect(await motivo(archivo)).toBe('contrasena_incorrecta_o_archivo_danado');
  });

  it('rechaza lo que no es un respaldo', async () => {
    expect(await motivo(new TextEncoder().encode('%PDF-1.7 no es un respaldo, es un PDF'))).toBe(
      'no_es_un_respaldo',
    );
    expect(await motivo((await cifrar()).subarray(0, 60))).toBe('no_es_un_respaldo');
  });

  it('rechaza una versión que no conoce', async () => {
    const archivo = await cifrar();
    archivo[6] = 2;

    expect(await motivo(archivo)).toBe('version_desconocida');
  });

  it.each([
    ['otra derivación', [2, 0x00, 0x01, 0x86, 0xa0]],
    ['un costo enorme', [1, 0xff, 0xff, 0xff, 0xff]],
    ['un costo que no protege', [1, 0x00, 0x00, 0x03, 0xe8]],
  ])('rechaza %s antes de derivar la clave', async (_caso, bytes) => {
    const archivo = await cifrar();
    archivo.set(bytes, 7);

    expect(await motivo(archivo)).toBe('costo_no_admitido');
  });

  it('rechaza un archivo demasiado grande sin mirarlo', async () => {
    expect(await motivo(new Uint8Array(TAMANIO_MAXIMO_DEL_RESPALDO + 1))).toBe('demasiado_grande');
  });

  it('el cifrado de la app ida y vuelta', async () => {
    const cifrado = crearCifradoDeRespaldos(plataforma, BARATO);

    const resultado = await cifrado.descifrar(
      await cifrado.cifrar(contenido, CONTRASENA),
      CONTRASENA,
    );

    expect(resultado.ok && new TextDecoder().decode(resultado.valor)).toBe('{"comprobantes":[]}');
  });

  it('no cifra con una fuente aleatoria que devuelve menos bytes', async () => {
    const corta = { ...plataforma, aleatorio: () => new Uint8Array(8) };

    await expect(cifrarRespaldo(contenido, CONTRASENA, corta, BARATO)).rejects.toThrow('aleatoria');
  });

  it('no usa una clave derivada de otro largo', async () => {
    const corta = { ...plataforma, derivar: () => Promise.resolve(new Uint8Array(16)) };

    await expect(cifrarRespaldo(contenido, CONTRASENA, corta, BARATO)).rejects.toThrow('32 bytes');
  });
});
