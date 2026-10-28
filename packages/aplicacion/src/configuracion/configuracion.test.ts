import { Cuit, Emisor, FechaCalendario } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import { crearRepositorioDeConfiguracion, type Configuracion } from './configuracion';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const configuracion: Configuracion = {
  ambiente: 'homologacion',
  emisor: valor(
    Emisor.crear({
      razonSocial: 'Juana Pérez',
      cuit: valor(Cuit.crear('27333333339')),
      condicion: 'monotributo',
      domicilio: 'Av. Siempreviva 742',
      inicioDeActividades: valor(FechaCalendario.crear(1998, 3, 1)),
      puntoDeVenta: 2,
    }),
  ),
};

const guardadoValido = {
  version: 1,
  ambiente: 'homologacion',
  razonSocial: 'Juana Pérez',
  cuit: '27333333339',
  condicion: 'monotributo',
  domicilio: 'Av. Siempreviva 742',
  inicioDeActividades: '19980301',
  puntoDeVenta: 2,
};

describe('RepositorioDeConfiguracion', () => {
  it('sin nada guardado devuelve undefined', async () => {
    await expect(
      crearRepositorioDeConfiguracion(new AlmacenEnMemoria()).leer(),
    ).resolves.toBeUndefined();
  });

  it('guarda y vuelve a leer la configuración', async () => {
    const almacen = new AlmacenEnMemoria();
    await crearRepositorioDeConfiguracion(almacen).guardar(configuracion);

    const leida = await crearRepositorioDeConfiguracion(almacen).leer();

    expect(leida?.ambiente).toBe('homologacion');
    expect(leida?.emisor.datos.razonSocial).toBe('Juana Pérez');
    expect(leida?.emisor.datos.cuit.valor).toBe('27333333339');
    expect(leida?.emisor.datos.condicion).toBe('monotributo');
    expect(leida?.emisor.datos.inicioDeActividades.formatear()).toBe('01/03/1998');
    expect(leida?.emisor.datos.puntoDeVenta).toBe(2);
  });

  it.each([
    ['no es JSON', '{roto'],
    ['no es un objeto', '"texto"'],
    ['es de otra versión', JSON.stringify({ ...guardadoValido, version: 3 })],
    ['le falta un campo', JSON.stringify({ ...guardadoValido, domicilio: undefined })],
    ['tiene un ambiente desconocido', JSON.stringify({ ...guardadoValido, ambiente: 'pruebas' })],
    ['tiene una condición desconocida', JSON.stringify({ ...guardadoValido, condicion: 'otra' })],
    ['tiene un CUIT inválido', JSON.stringify({ ...guardadoValido, cuit: '27333333330' })],
    [
      'tiene una fecha inválida',
      JSON.stringify({ ...guardadoValido, inicioDeActividades: 'ayer' }),
    ],
    ['tiene un emisor inválido', JSON.stringify({ ...guardadoValido, puntoDeVenta: 0 })],
  ])('si lo guardado %s, no hay configuración', async (_, texto) => {
    const almacen = new AlmacenEnMemoria();
    await almacen.guardar('configuracion.emisor', texto);

    await expect(crearRepositorioDeConfiguracion(almacen).leer()).resolves.toBeUndefined();
  });

  it('guarda y lee Ingresos Brutos', async () => {
    const almacen = new AlmacenEnMemoria();
    const conIngresosBrutos = valor(
      Emisor.crear({ ...configuracion.emisor.datos, ingresosBrutos: '901-123456-7' }),
    );
    await crearRepositorioDeConfiguracion(almacen).guardar({
      ...configuracion,
      emisor: conIngresosBrutos,
    });

    const leida = await crearRepositorioDeConfiguracion(almacen).leer();

    expect(leida?.emisor.datos.ingresosBrutos).toBe('901-123456-7');
  });

  it('sigue leyendo una configuración guardada antes de pedir Ingresos Brutos', async () => {
    const almacen = new AlmacenEnMemoria();
    await almacen.guardar('configuracion.emisor', JSON.stringify(guardadoValido));

    const leida = await crearRepositorioDeConfiguracion(almacen).leer();

    expect(leida?.emisor.datos.razonSocial).toBe('Juana Pérez');
    expect(leida?.emisor.datos).not.toHaveProperty('ingresosBrutos');
  });

  it('si Ingresos Brutos guardado no es texto, no hay configuración', async () => {
    const almacen = new AlmacenEnMemoria();
    await almacen.guardar(
      'configuracion.emisor',
      JSON.stringify({ ...guardadoValido, version: 2, ingresosBrutos: 5 }),
    );

    await expect(crearRepositorioDeConfiguracion(almacen).leer()).resolves.toBeUndefined();
  });

  it('si el almacén falla al guardar, el error llega a quien guarda', async () => {
    const repositorio = crearRepositorioDeConfiguracion({
      leer: () => Promise.resolve(undefined),
      guardar: () => Promise.reject(new Error('bloqueado')),
      borrar: () => Promise.resolve(),
    });

    await expect(repositorio.guardar(configuracion)).rejects.toThrow('bloqueado');
  });
});
