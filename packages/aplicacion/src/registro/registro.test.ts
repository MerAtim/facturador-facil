import { describe, expect, it, vi } from 'vitest';

import { crearRegistro, redactar, salidaDeConsola, type Salida } from './registro';

function salidaDePrueba() {
  const escrito: { nivel: 'depurar' | 'error'; texto: string }[] = [];
  const salida: Salida = {
    depurar: (texto) => escrito.push({ nivel: 'depurar', texto }),
    error: (texto) => escrito.push({ nivel: 'error', texto }),
  };
  return { salida, escrito };
}

describe('redactar', () => {
  it.each([
    ['CUIT 20123456786 rechazado', 'CUIT [CUIT] rechazado'],
    ['receptor 30-71234567-1', 'receptor [CUIT]'],
    ['DNI 30.123.456 y 30123456', 'DNI [DNI] y [DNI]'],
    ['total $ 1.234,56', 'total [IMPORTE]'],
    ['CAE 76123456789012 vence', 'CAE [CAE] vence'],
    [
      `token ${'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgi'.repeat(3)}== fin`,
      'token [TOKEN] fin',
    ],
  ])('"%s" queda "%s"', (texto, redactado) => {
    expect(redactar(texto)).toBe(redactado);
  });

  it('deja los números cortos, como un punto de venta o un código de error', () => {
    expect(redactar('punto de venta 2, código 10016')).toBe('punto de venta 2, código 10016');
  });

  it('un texto enorme no lo vuelve lento', () => {
    const inicio = Date.now();
    redactar('1'.repeat(100_000) + '$'.repeat(100_000) + 'a'.repeat(100_000));
    expect(Date.now() - inicio).toBeLessThan(1_000);
  });
});

describe('crearRegistro', () => {
  it('en desarrollo registra los datos, redactados', () => {
    const { salida, escrito } = salidaDePrueba();
    const registro = crearRegistro({ produccion: false, salida });

    registro.depurar('emitiendo', { cuit: '20123456786', total: '$ 1.210,00', puntoDeVenta: 2 });

    expect(escrito).toEqual([
      {
        nivel: 'depurar',
        texto: 'emitiendo {"cuit":"[CUIT]","total":"[IMPORTE]","puntoDeVenta":2}',
      },
    ]);
  });

  it('en desarrollo un error muestra su detalle, redactado', () => {
    const { salida, escrito } = salidaDePrueba();

    crearRegistro({ produccion: false, salida }).error(
      'no se pudo guardar',
      new TypeError('falló para 27333333339'),
    );

    expect(escrito).toEqual([
      { nivel: 'error', texto: 'no se pudo guardar TypeError: falló para [CUIT]' },
    ]);
  });

  it('en producción no registra la depuración', () => {
    const { salida, escrito } = salidaDePrueba();

    crearRegistro({ produccion: true, salida }).depurar('emitiendo', { cuit: '20123456786' });

    expect(escrito).toEqual([]);
  });

  it('en producción un error deja solo el mensaje y el tipo, sin el detalle', () => {
    const { salida, escrito } = salidaDePrueba();
    const registro = crearRegistro({ produccion: true, salida });

    registro.error('no se pudo compartir', new Error('archivo de Juana Pérez, CUIT 27333333339'));
    registro.error('sin detalle');

    expect(escrito).toEqual([
      { nivel: 'error', texto: 'no se pudo compartir (Error)' },
      { nivel: 'error', texto: 'sin detalle' },
    ]);
  });

  it('muestra cualquier dato aunque no se pueda convertir a JSON', () => {
    const { salida, escrito } = salidaDePrueba();
    const circular: Record<string, unknown> = {};
    circular['yo'] = circular;
    const registro = crearRegistro({ produccion: false, salida });

    registro.depurar('circular', circular);
    registro.depurar('texto', 'hola');
    registro.depurar('funcion', () => undefined);
    registro.error('raro', undefined);

    expect(escrito.map((e) => e.texto)).toEqual([
      'circular [no se puede mostrar]',
      'texto hola',
      'funcion () => undefined',
      'raro',
    ]);
  });
});

describe('salidaDeConsola', () => {
  it('escribe en la consola', () => {
    const consola = (
      globalThis as unknown as { console: { log(t: string): void; error(t: string): void } }
    ).console;
    const log = vi.spyOn(consola, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(consola, 'error').mockImplementation(() => undefined);

    salidaDeConsola.depurar('a');
    salidaDeConsola.error('b');

    expect(log).toHaveBeenCalledWith('a');
    expect(error).toHaveBeenCalledWith('b');
    vi.restoreAllMocks();
  });
});
