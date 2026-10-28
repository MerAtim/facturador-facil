import { Cuit } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import type { AlmacenLocal } from '../puertos/almacenLocal';
import {
  crearRegistroDeAlta,
  estadoDeAlta,
  PROGRESO_INICIAL,
  type SituacionDeAlta,
  type TitularDelAlta,
} from './guiaDeAlta';

const cuit = (() => {
  const resultado = Cuit.crear('20123456786');
  if (!resultado.ok) throw new Error('CUIT de prueba inválido');
  return resultado.valor;
})();

const titular: TitularDelAlta = { ambiente: 'produccion', cuit };

const situacion = (cambios: Partial<SituacionDeAlta> = {}): SituacionDeAlta => ({
  ambiente: 'produccion',
  puntoDeVenta: 3,
  conCertificado: true,
  progreso: PROGRESO_INICIAL,
  ...cambios,
});

const hechos = (s: SituacionDeAlta) =>
  estadoDeAlta(s)
    .pasos.filter(({ hecho }) => hecho)
    .map(({ paso }) => paso);

describe('estadoDeAlta', () => {
  it('sin datos cargados, empieza por los datos del emisor', () => {
    const sinDatos = estadoDeAlta({
      ambiente: 'homologacion',
      conCertificado: false,
      progreso: PROGRESO_INICIAL,
    });

    expect(sinDatos.actual).toBe('datos');
  });

  it('en producción hay que dar de alta el punto de venta', () => {
    expect(estadoDeAlta(situacion()).pasos.map(({ paso }) => paso)).toEqual([
      'datos',
      'certificado',
      'autorizacion',
      'punto_de_venta',
      'verificacion',
    ]);
  });

  it('en homologación el punto de venta no hace falta', () => {
    const { pasos } = estadoDeAlta(situacion({ ambiente: 'homologacion' }));

    expect(pasos.map(({ paso }) => paso)).not.toContain('punto_de_venta');
  });

  it('retoma en el primer paso sin hacer aunque haya marcado uno posterior', () => {
    const estado = estadoDeAlta(
      situacion({ conCertificado: false, progreso: { autorizacion: true, puntoDeVenta: true } }),
    );

    expect(estado.actual).toBe('certificado');
  });

  it('con los pasos de ARCA marcados, falta verificar', () => {
    const estado = estadoDeAlta(
      situacion({ progreso: { autorizacion: true, puntoDeVenta: true } }),
    );

    expect(estado.actual).toBe('verificacion');
  });

  it('una verificación exitosa da por hechos los pasos de ARCA', () => {
    const verificada = situacion({ progreso: { ...PROGRESO_INICIAL, verificadoCon: 3 } });

    expect(estadoDeAlta(verificada).actual).toBeUndefined();
    expect(hechos(verificada)).toEqual([
      'datos',
      'certificado',
      'autorizacion',
      'punto_de_venta',
      'verificacion',
    ]);
  });

  it('la verificación deja de valer si cambia el punto de venta', () => {
    const otroPunto = situacion({
      puntoDeVenta: 4,
      progreso: { autorizacion: true, puntoDeVenta: true, verificadoCon: 3 },
    });

    expect(estadoDeAlta(otroPunto).actual).toBe('verificacion');
  });

  it('sin certificado, la verificación no vale', () => {
    const sinCertificado = situacion({
      conCertificado: false,
      progreso: { ...PROGRESO_INICIAL, verificadoCon: 3 },
    });

    expect(hechos(sinCertificado)).toEqual(['datos']);
  });
});

describe('RegistroDeAlta', () => {
  it('sin nada guardado, no hay avance', async () => {
    await expect(crearRegistroDeAlta(new AlmacenEnMemoria()).leer(titular)).resolves.toEqual(
      PROGRESO_INICIAL,
    );
  });

  it('recuerda los pasos marcados entre usos', async () => {
    const almacen = new AlmacenEnMemoria();
    await crearRegistroDeAlta(almacen).marcar(titular, 'autorizacion', true);

    await expect(crearRegistroDeAlta(almacen).leer(titular)).resolves.toEqual({
      autorizacion: true,
      puntoDeVenta: false,
    });
  });

  it('un paso marcado se puede desmarcar', async () => {
    const registro = crearRegistroDeAlta(new AlmacenEnMemoria());
    await registro.marcar(titular, 'punto_de_venta', true);
    await registro.marcar(titular, 'punto_de_venta', false);

    expect((await registro.leer(titular)).puntoDeVenta).toBe(false);
  });

  it('dos marcas seguidas sin esperar no se pisan', async () => {
    const registro = crearRegistroDeAlta(new AlmacenEnMemoria());

    await Promise.all([
      registro.marcar(titular, 'autorizacion', true),
      registro.marcar(titular, 'punto_de_venta', true),
    ]);

    expect(await registro.leer(titular)).toEqual({ autorizacion: true, puntoDeVenta: true });
  });

  it('recuerda la verificación y la olvida sin perder lo marcado', async () => {
    const registro = crearRegistroDeAlta(new AlmacenEnMemoria());
    await registro.marcar(titular, 'autorizacion', true);
    await registro.registrarVerificacion(titular, 3);

    expect((await registro.leer(titular)).verificadoCon).toBe(3);

    await registro.olvidarVerificacion(titular);
    expect(await registro.leer(titular)).toEqual({ autorizacion: true, puntoDeVenta: false });
  });

  it('cada ambiente lleva su propio avance', async () => {
    const registro = crearRegistroDeAlta(new AlmacenEnMemoria());
    await registro.marcar(titular, 'autorizacion', true);

    expect(await registro.leer({ ambiente: 'homologacion', cuit })).toEqual(PROGRESO_INICIAL);
  });

  it.each([
    ['no es JSON', '{roto'],
    ['no es un objeto', '"texto"'],
    ['es null', 'null'],
  ])('lo guardado que %s se trata como sin avance', async (_, guardado) => {
    const almacen = new AlmacenEnMemoria();
    await almacen.guardar('alta.v1.produccion.20123456786', guardado);

    await expect(crearRegistroDeAlta(almacen).leer(titular)).resolves.toEqual(PROGRESO_INICIAL);
  });

  it('descarta los valores con otro tipo', async () => {
    const almacen = new AlmacenEnMemoria();
    await almacen.guardar(
      'alta.v1.produccion.20123456786',
      JSON.stringify({ autorizacion: 'si', puntoDeVenta: true, verificadoCon: 2.5 }),
    );

    await expect(crearRegistroDeAlta(almacen).leer(titular)).resolves.toEqual({
      autorizacion: false,
      puntoDeVenta: true,
    });
  });

  it('un almacén que falla no interrumpe la guía', async () => {
    const roto: AlmacenLocal = {
      leer: () => Promise.reject(new Error('bloqueado')),
      guardar: () => Promise.reject(new Error('bloqueado')),
      borrar: () => Promise.reject(new Error('bloqueado')),
    };
    const registro = crearRegistroDeAlta(roto);

    await expect(registro.marcar(titular, 'autorizacion', true)).resolves.toBeUndefined();
    await expect(registro.leer(titular)).resolves.toEqual(PROGRESO_INICIAL);
  });
});
