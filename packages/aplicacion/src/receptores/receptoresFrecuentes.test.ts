import { CondicionIvaReceptor, Cuit } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import type { AlmacenSeguro } from '../puertos/almacenSeguro';
import {
  crearReceptoresFrecuentes,
  MAXIMO_DE_RECEPTORES_FRECUENTES,
  type ReceptorConCuit,
} from './receptoresFrecuentes';

const cuit = (texto: string): Cuit => {
  const resultado = Cuit.crear(texto);
  if (!resultado.ok) throw new Error(`CUIT de prueba inválido: ${texto}`);
  return resultado.valor;
};

const receptor = (
  texto: string,
  nombre?: string,
  condicion = CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
): ReceptorConCuit => ({ cuit: cuit(texto), condicion, ...(nombre ? { nombre } : {}) });

const CUITS = [
  '20111111112',
  '20222222223',
  '20444444445',
  '20555555556',
  '20666666667',
  '20777777778',
  '20888888889',
  '27333333339',
  '30712345671',
];

/** Un reloj que avanza un segundo en cada lectura, así cada uso es posterior al anterior. */
function reloj() {
  let instante = 1_000;
  return () => (instante += 1_000);
}

const cuitsDe = (lista: readonly ReceptorConCuit[]) => lista.map((r) => r.cuit.valor);

describe('ReceptoresFrecuentes', () => {
  it('sin nada guardado, la lista está vacía', async () => {
    await expect(crearReceptoresFrecuentes(new AlmacenEnMemoria()).listar()).resolves.toEqual([]);
  });

  it('recuerda el receptor con su condición y su nombre', async () => {
    const almacen = new AlmacenEnMemoria();
    await crearReceptoresFrecuentes(almacen).registrarUso(
      receptor('30712345671', 'Ferretería Sur', CondicionIvaReceptor.EXENTO),
    );

    const [recordado] = await crearReceptoresFrecuentes(almacen).listar();

    expect(recordado?.cuit.valor).toBe('30712345671');
    expect(recordado?.condicion).toBe(CondicionIvaReceptor.EXENTO);
    expect(recordado?.nombre).toBe('Ferretería Sur');
  });

  it('pone primero a los más usados y, entre iguales, al más reciente', async () => {
    const frecuentes = crearReceptoresFrecuentes(new AlmacenEnMemoria(), reloj());

    await frecuentes.registrarUso(receptor('20111111112'));
    await frecuentes.registrarUso(receptor('20222222223'));
    await frecuentes.registrarUso(receptor('20444444445'));
    await frecuentes.registrarUso(receptor('20222222223'));

    expect(cuitsDe(await frecuentes.listar())).toEqual([
      '20222222223',
      '20444444445',
      '20111111112',
    ]);
  });

  it('un nuevo uso actualiza la condición y el nombre', async () => {
    const frecuentes = crearReceptoresFrecuentes(new AlmacenEnMemoria(), reloj());

    await frecuentes.registrarUso(receptor('20111111112', 'Juan'));
    await frecuentes.registrarUso(
      receptor('20111111112', 'Juan Pérez', CondicionIvaReceptor.MONOTRIBUTO),
    );

    const lista = await frecuentes.listar();
    expect(lista).toHaveLength(1);
    expect(lista[0]?.nombre).toBe('Juan Pérez');
    expect(lista[0]?.condicion).toBe(CondicionIvaReceptor.MONOTRIBUTO);
  });

  it('si no entran todos, olvida al que se usó hace más tiempo', async () => {
    const frecuentes = crearReceptoresFrecuentes(new AlmacenEnMemoria(), reloj());

    // El primero se usa muchas veces, pero hace mucho.
    await frecuentes.registrarUso(receptor(CUITS[0] ?? ''));
    await frecuentes.registrarUso(receptor(CUITS[0] ?? ''));
    for (const texto of CUITS.slice(1)) await frecuentes.registrarUso(receptor(texto));

    const lista = cuitsDe(await frecuentes.listar());
    expect(lista).toHaveLength(MAXIMO_DE_RECEPTORES_FRECUENTES);
    expect(lista).not.toContain(CUITS[0]);
  });

  it('dos usos seguidos sin esperar no se pisan', async () => {
    const frecuentes = crearReceptoresFrecuentes(new AlmacenEnMemoria(), reloj());

    await Promise.all([
      frecuentes.registrarUso(receptor('20111111112')),
      frecuentes.registrarUso(receptor('20222222223')),
    ]);

    expect(await frecuentes.listar()).toHaveLength(2);
  });

  it('limpia el nombre y no guarda uno vacío', async () => {
    const frecuentes = crearReceptoresFrecuentes(new AlmacenEnMemoria(), reloj());

    await frecuentes.registrarUso(receptor('20111111112', `  ${'x'.repeat(80)}\u0007 `));
    await frecuentes.registrarUso(receptor('20222222223', '   '));

    const lista = await frecuentes.listar();
    expect(lista.find((r) => r.cuit.valor === '20111111112')?.nombre).toBe('x'.repeat(60));
    expect(lista.find((r) => r.cuit.valor === '20222222223')).not.toHaveProperty('nombre');
  });

  it.each([
    ['no es JSON', '{roto'],
    ['no es una lista', '{"cuit":"20111111112"}'],
  ])('lo guardado que %s se trata como una lista vacía', async (_, guardado) => {
    const almacen = new AlmacenEnMemoria();
    await almacen.guardar('receptores.frecuentes', guardado);

    await expect(crearReceptoresFrecuentes(almacen).listar()).resolves.toEqual([]);
  });

  it('descarta los registros dañados y conserva los buenos', async () => {
    const almacen = new AlmacenEnMemoria();
    const bueno = { cuit: '20111111112', condicion: 1, usos: 1, ultimoUso: 1 };
    await almacen.guardar(
      'receptores.frecuentes',
      JSON.stringify([
        null,
        'texto',
        { ...bueno, usos: 'muchos' },
        { ...bueno, nombre: 5 },
        { ...bueno, cuit: '20111111113' },
        { ...bueno, condicion: 99 },
        bueno,
      ]),
    );

    expect(cuitsDe(await crearReceptoresFrecuentes(almacen).listar())).toEqual(['20111111112']);
  });

  it('un almacén que falla no interrumpe la carga', async () => {
    const roto: AlmacenSeguro = {
      leer: () => Promise.reject(new Error('bloqueado')),
      guardar: () => Promise.reject(new Error('bloqueado')),
      borrar: () => Promise.reject(new Error('bloqueado')),
    };
    const frecuentes = crearReceptoresFrecuentes(roto);

    await expect(frecuentes.registrarUso(receptor('20111111112'))).resolves.toBeUndefined();
    await expect(frecuentes.listar()).resolves.toEqual([]);
  });
});
