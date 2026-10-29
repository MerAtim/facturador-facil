import { CondicionIvaReceptor, Cuit } from '@facturador/dominio';
import { beforeEach, describe, expect, it } from 'vitest';

import { crearBaseSqliteDePrueba } from '../persistencia/baseSqliteDePrueba';
import { migrar } from '../persistencia/migraciones';
import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import {
  crearCliente,
  crearRepositorioDeClientes,
  importarClientesFrecuentes,
  type Cliente,
  type RepositorioDeClientes,
} from './clientes';

const cuit = (texto: string) => {
  const resultado = Cuit.crear(texto);
  if (!resultado.ok) throw new Error('CUIT de prueba inválido');
  return resultado.valor;
};

const ferreteria: Cliente = {
  cuit: cuit('30712345671'),
  condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  nombre: 'Ferretería Sur',
  domicilio: 'Belgrano 123, Rosario',
};
const corralon: Cliente = {
  cuit: cuit('20123456786'),
  condicion: CondicionIvaReceptor.MONOTRIBUTO,
  nombre: 'Corralón 100% Norte',
};
const sinNombre: Cliente = {
  cuit: cuit('27333333339'),
  condicion: CondicionIvaReceptor.EXENTO,
};

const nombres = (clientes: readonly Cliente[]) =>
  clientes.map((cliente) => cliente.nombre ?? cliente.cuit.valor);

describe('crearCliente', () => {
  const datos = {
    cuit: '30-71234567-1',
    condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
    nombre: '  Ferretería Sur ',
    domicilio: '',
  };

  it('valida el CUIT y limpia los textos', () => {
    expect(crearCliente(datos)).toEqual({
      ok: true,
      valor: {
        cuit: cuit('30712345671'),
        condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
        nombre: 'Ferretería Sur',
      },
    });
  });

  it('saca los caracteres de control', () => {
    const creado = crearCliente({ ...datos, nombre: 'Ferretería\u0000Sur' });

    expect(creado.ok && creado.valor.nombre).toBe('Ferretería Sur');
  });

  it('informa todos los problemas juntos', () => {
    expect(
      crearCliente({
        ...datos,
        cuit: '30712345670',
        nombre: 'x'.repeat(61),
        domicilio: 'y'.repeat(201),
      }),
    ).toEqual({
      ok: false,
      error: [
        { tipo: 'cuit', motivo: 'digito_verificador_invalido' },
        { tipo: 'nombre_largo' },
        { tipo: 'domicilio_largo' },
      ],
    });
  });
});

describe('RepositorioDeClientes', () => {
  let base: ReturnType<typeof crearBaseSqliteDePrueba>;
  let clientes: RepositorioDeClientes;
  let reloj: number;

  beforeEach(async () => {
    base = crearBaseSqliteDePrueba();
    await migrar(base);
    reloj = 1_000;
    clientes = crearRepositorioDeClientes(base, () => reloj++);
  });

  it('guarda, lee y edita un cliente', async () => {
    await clientes.guardar(ferreteria);
    await clientes.guardar({ ...ferreteria, domicilio: 'Mitre 9' });

    expect(await clientes.leer(ferreteria.cuit)).toEqual({ ...ferreteria, domicilio: 'Mitre 9' });
    expect(await clientes.leer(corralon.cuit)).toBeUndefined();
  });

  it('borra un cliente', async () => {
    await clientes.guardar(ferreteria);

    await clientes.borrar(ferreteria.cuit);

    expect(await clientes.todos()).toEqual([]);
  });

  describe('buscar', () => {
    beforeEach(async () => {
      await clientes.guardar(ferreteria);
      await clientes.guardar(corralon);
      await clientes.guardar(sinNombre);
    });

    it('sin texto lista todos, primero los que tienen nombre', async () => {
      expect(nombres(await clientes.buscar('', 10))).toEqual([
        'Corralón 100% Norte',
        'Ferretería Sur',
        '27333333339',
      ]);
    });

    it('encuentra por parte del nombre sin importar mayúsculas ni tildes', async () => {
      expect(nombres(await clientes.buscar('FERRETERIA', 10))).toEqual(['Ferretería Sur']);
      expect(nombres(await clientes.buscar('corralon', 10))).toEqual(['Corralón 100% Norte']);
    });

    it('encuentra por parte del CUIT, con o sin guiones', async () => {
      expect(nombres(await clientes.buscar('30-7123', 10))).toEqual(['Ferretería Sur']);
      expect(nombres(await clientes.buscar('3333', 10))).toEqual(['27333333339']);
    });

    it('los comodines del texto se buscan como texto', async () => {
      expect(nombres(await clientes.buscar('100%', 10))).toEqual(['Corralón 100% Norte']);
      expect(await clientes.buscar('r_a', 10)).toEqual([]);
    });

    it('respeta el límite', async () => {
      expect(await clientes.buscar('', 2)).toHaveLength(2);
    });
  });

  describe('usos', () => {
    it('al facturar a un CUIT nuevo lo agrega como cliente', async () => {
      await clientes.registrarUso(ferreteria);

      expect(await clientes.todos()).toEqual([ferreteria]);
    });

    it('los frecuentes van por usos y, si empatan, por el más reciente', async () => {
      await clientes.registrarUso(ferreteria);
      await clientes.registrarUso(corralon);
      await clientes.registrarUso(sinNombre);
      await clientes.registrarUso(ferreteria);

      expect(nombres(await clientes.frecuentes(10))).toEqual([
        'Ferretería Sur',
        '27333333339',
        'Corralón 100% Norte',
      ]);
      expect(await clientes.frecuentes(1)).toHaveLength(1);
    });

    it('un cliente cargado a mano no es frecuente hasta que se le factura', async () => {
      await clientes.guardar(ferreteria);

      expect(await clientes.frecuentes(10)).toEqual([]);
    });

    it('facturar sin nombre no borra el que tenía', async () => {
      await clientes.guardar(ferreteria);

      await clientes.registrarUso({
        cuit: ferreteria.cuit,
        condicion: CondicionIvaReceptor.MONOTRIBUTO,
      });

      expect(await clientes.leer(ferreteria.cuit)).toEqual({
        ...ferreteria,
        condicion: CondicionIvaReceptor.MONOTRIBUTO,
      });
    });
  });

  it('una fila dañada no tapa a las demás', async () => {
    await clientes.guardar(ferreteria);
    await base.ejecutar(
      'INSERT INTO clientes (cuit, condicion, usos, creado_en) VALUES (?, ?, 0, 0)',
      ['20000000000', 1],
    );

    expect(await clientes.todos()).toEqual([ferreteria]);
  });

  describe('importar los frecuentes del almacén', () => {
    const CLAVE = 'receptores.frecuentes';

    it('los pasa a la tabla en orden de uso y los borra del almacén', async () => {
      const almacen = new AlmacenEnMemoria();
      await almacen.guardar(
        CLAVE,
        JSON.stringify([
          { cuit: '20123456786', condicion: 6, usos: 1, ultimoUso: 5 },
          { cuit: '30712345671', condicion: 1, nombre: 'Ferretería Sur', usos: 3, ultimoUso: 2 },
          { cuit: '30712345670', condicion: 1, usos: 9, ultimoUso: 9 },
          'basura',
        ]),
      );

      expect(await importarClientesFrecuentes(almacen, clientes)).toBe(2);

      expect(nombres(await clientes.frecuentes(10))).toEqual(['Ferretería Sur', '20123456786']);
      expect(await almacen.leer(CLAVE)).toBeUndefined();
    });

    it('sin frecuentes guardados no hace nada', async () => {
      expect(await importarClientesFrecuentes(new AlmacenEnMemoria(), clientes)).toBe(0);
    });

    it('un valor ilegible se descarta', async () => {
      const almacen = new AlmacenEnMemoria();
      await almacen.guardar(CLAVE, '{no es json');

      expect(await importarClientesFrecuentes(almacen, clientes)).toBe(0);
      expect(await almacen.leer(CLAVE)).toBeUndefined();
    });
  });
});
