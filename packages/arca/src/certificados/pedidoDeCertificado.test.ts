import { verify } from 'node:crypto';

import { Cuit } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { desdePem } from '../criptografia/codificacion';
import { hijos, leer } from '../criptografia/der';
import { crearAlmacenDeClavesDePrueba } from '../criptografia/paraPruebas';
import {
  aliasDeClave,
  crearPedidoDeCertificado,
  nombreDelArchivoDePedido,
  type Titular,
} from './pedidoDeCertificado';

const cuit = Cuit.crear('27333333339');
if (!cuit.ok) throw new Error('CUIT de prueba inválido');

const titular: Titular = { ambiente: 'homologacion', cuit: cuit.valor, razonSocial: 'Juana Pérez' };

describe('crearPedidoDeCertificado', () => {
  it('genera la clave la primera vez y firma el pedido con ella', async () => {
    const { almacen, generadas, clave } = crearAlmacenDeClavesDePrueba();

    const pem = await crearPedidoDeCertificado(titular, almacen);

    expect(generadas).toEqual(['facturador.homologacion.27333333339']);
    const [informacion, , firma] = hijos(leer(desdePem('CERTIFICATE REQUEST', pem)));
    const publica = clave('facturador.homologacion.27333333339')?.publicKey;
    expect(publica).toBeDefined();
    expect(
      verify(
        'sha256',
        informacion?.bytes ?? new Uint8Array(),
        publica ?? '',
        firma?.contenido.subarray(1) ?? new Uint8Array(),
      ),
    ).toBe(true);
  });

  it('pone el CUIT y la razón social en el pedido', async () => {
    const { almacen } = crearAlmacenDeClavesDePrueba();

    const pem = await crearPedidoDeCertificado(titular, almacen);
    const texto = new TextDecoder().decode(desdePem('CERTIFICATE REQUEST', pem));

    expect(texto).toContain('CUIT 27333333339');
    expect(texto).toContain('Juana Pérez');
    expect(texto).toContain('facturadorfacil');
  });

  it('la segunda vez reutiliza la clave y el pedido es el mismo', async () => {
    const { almacen, generadas } = crearAlmacenDeClavesDePrueba();

    const primero = await crearPedidoDeCertificado(titular, almacen);
    const segundo = await crearPedidoDeCertificado(titular, almacen);

    expect(generadas).toHaveLength(1);
    expect(segundo).toBe(primero);
  });

  it('dos pedidos a la vez generan una sola clave', async () => {
    const { almacen, generadas } = crearAlmacenDeClavesDePrueba();

    await Promise.all([
      crearPedidoDeCertificado(titular, almacen),
      crearPedidoDeCertificado(titular, almacen),
    ]);

    expect(generadas).toHaveLength(1);
  });

  it('cada ambiente tiene su propia clave', async () => {
    const { almacen, generadas } = crearAlmacenDeClavesDePrueba();

    await crearPedidoDeCertificado(titular, almacen);
    await crearPedidoDeCertificado({ ...titular, ambiente: 'produccion' }, almacen);

    expect(generadas).toEqual([
      'facturador.homologacion.27333333339',
      'facturador.produccion.27333333339',
    ]);
  });

  it('firmar con un alias sin clave falla', async () => {
    const { almacen } = crearAlmacenDeClavesDePrueba();

    await expect(almacen.firmar(aliasDeClave(titular), new Uint8Array())).rejects.toThrow(
      'SIN_CLAVE',
    );
    await expect(almacen.clavePublica(aliasDeClave(titular))).rejects.toThrow('SIN_CLAVE');
  });

  it('nombra el archivo con el CUIT y el ambiente', () => {
    expect(nombreDelArchivoDePedido(titular)).toBe('pedido-27333333339-homologacion.csr');
  });
});
