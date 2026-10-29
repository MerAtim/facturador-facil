import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  Emisor,
  exito,
  fallo,
  FechaCalendario,
  TipoComprobante,
  UnidadDeMedida,
  type Receptor,
} from '@facturador/dominio';
import { beforeEach, describe, expect, it } from 'vitest';

import { crearRepositorioDeProductos } from '../catalogo/productos';
import { crearRepositorioDeClientes, type Cliente } from '../clientes/clientes';
import {
  crearRepositorioDeComprobantes,
  type ComprobanteEmitido,
} from '../comprobantes/comprobantesEmitidos';
import {
  crearRepositorioDeConfiguracion,
  type Configuracion,
} from '../configuracion/configuracion';
import { crearBaseSqliteDePrueba } from '../persistencia/baseSqliteDePrueba';
import { migrar } from '../persistencia/migraciones';
import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import { crearRespaldo, type CifradoDeRespaldos, type Respaldo } from './respaldo';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const fecha = (anio: number, mes: number, dia: number) =>
  valor(FechaCalendario.crear(anio, mes, dia));

const emisorCon = (cuit: string, domicilio = 'Mitre 100, Rosario') =>
  valor(
    Emisor.crear({
      razonSocial: 'Juana Pérez',
      cuit: valor(Cuit.crear(cuit)),
      condicion: 'responsable_inscripto',
      domicilio,
      inicioDeActividades: fecha(2020, 1, 1),
      puntoDeVenta: 3,
    }),
  );
const juana = emisorCon('20111111112');
const otra = emisorCon('27333333339');

const ferreteria: Receptor = {
  identificacion: { tipo: 'cuit', cuit: valor(Cuit.crear('30712345671')) },
  condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  nombre: 'Ferretería Sur',
};

const emitido = (
  numero: number,
  ambiente: ComprobanteEmitido['ambiente'] = 'produccion',
  emisor = juana,
): ComprobanteEmitido => {
  const comprobante = valor(
    Comprobante.crear({
      tipo: TipoComprobante.FACTURA_A,
      receptor: ferreteria.condicion,
      identificacionReceptor: ferreteria.identificacion,
      modoDePrecio: 'final',
      items: [
        {
          descripcion: 'Tornillos',
          cantidad: Cantidad.UNO,
          precioUnitario: valor(Dinero.desdeTexto('1.210')),
          alicuota: AlicuotaIva.VEINTIUNO,
        },
      ],
      fechaDeEmision: fecha(2026, 10, 27),
      concepto: 'productos',
    }),
  );
  return {
    ambiente,
    emisor,
    puntoDeVenta: 3,
    numero,
    comprobante: valor(comprobante.autorizar('76431234567890', fecha(2026, 11, 6))),
    receptor: ferreteria,
  };
};

/** Un doble que solo exige la contraseña: el cifrado real se prueba en su paquete. */
const cifradoDePrueba: CifradoDeRespaldos = {
  cifrar: (contenido, contrasena) =>
    Promise.resolve(new Uint8Array([...new TextEncoder().encode(`${contrasena}|`), ...contenido])),
  descifrar: (archivo, contrasena) => {
    const prefijo = new TextEncoder().encode(`${contrasena}|`);
    const coincide = prefijo.every((byte, indice) => archivo[indice] === byte);
    return Promise.resolve(
      coincide
        ? exito(archivo.subarray(prefijo.length))
        : fallo({
            tipo: 'respaldo_ilegible' as const,
            motivo: 'contrasena_incorrecta_o_archivo_danado' as const,
          }),
    );
  },
};

const CONTRASENA = 'una contraseña larga';

const pintura = {
  descripcion: 'Pintura látex 20 l',
  precio: valor(Dinero.desdeTexto('48.500')),
  modoDePrecio: 'final' as const,
  alicuota: AlicuotaIva.VEINTIUNO,
  unidad: UnidadDeMedida.UNIDADES,
};

/** El contenido de un respaldo, para alterarlo en los tests. */
const abrir = async (archivo: Uint8Array) =>
  JSON.parse(
    new TextDecoder().decode(valor(await cifradoDePrueba.descifrar(archivo, CONTRASENA))),
  ) as { comprobantes: Record<string, unknown>[] };

/** Un teléfono con su base, su almacén y su logo. */
async function telefono(configuracion?: Configuracion, logoInicial?: string) {
  const base = crearBaseSqliteDePrueba();
  await migrar(base);
  const almacen = new AlmacenEnMemoria();
  const repositorios = {
    configuracion: crearRepositorioDeConfiguracion(almacen),
    clientes: crearRepositorioDeClientes(base),
    productos: crearRepositorioDeProductos(base),
    comprobantes: crearRepositorioDeComprobantes(base),
  };
  if (configuracion) await repositorios.configuracion.guardar(configuracion);
  const logo = { actual: logoInicial };
  const respaldo: Respaldo = crearRespaldo({
    ...repositorios,
    logo: {
      leer: () => Promise.resolve(logo.actual),
      guardar: (base64) => {
        if (base64 === 'dañado') return Promise.reject(new Error('no es un PNG'));
        logo.actual = base64;
        return Promise.resolve();
      },
    },
    cifrado: cifradoDePrueba,
    ahora: () => new Date('2026-10-29T12:00:00Z'),
  });
  return { ...repositorios, base, logo, respaldo };
}

describe('respaldo', () => {
  let viejo: Awaited<ReturnType<typeof telefono>>;

  beforeEach(async () => {
    viejo = await telefono({ emisor: juana, ambiente: 'produccion' }, 'iVBORw0KGgo=');
    await viejo.comprobantes.guardar(emitido(1, 'homologacion'));
    await viejo.comprobantes.guardar(emitido(2));
    await viejo.comprobantes.guardar(emitido(3));
    await viejo.productos.guardar(pintura);
    await viejo.productos.guardar({ ...pintura, descripcion: 'Pincel', modoDePrecio: 'neto' });
    await viejo.clientes.registrarUso({
      cuit: valor(Cuit.crear('30712345671')),
      condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
      nombre: 'Ferretería Sur',
    });
    await viejo.clientes.registrarUso({
      cuit: valor(Cuit.crear('20123456786')),
      condicion: CondicionIvaReceptor.MONOTRIBUTO,
    });
  });

  const crear = async () => valor(await viejo.respaldo.crear(CONTRASENA));

  it('pide una contraseña de al menos 10 caracteres', async () => {
    expect(await viejo.respaldo.crear('corta')).toEqual({
      ok: false,
      error: { tipo: 'contrasena_corta' },
    });
  });

  it('sin datos del emisor no hay nada que respaldar', async () => {
    const vacio = await telefono();

    expect(await vacio.respaldo.crear(CONTRASENA)).toEqual({
      ok: false,
      error: { tipo: 'sin_configuracion' },
    });
  });

  it('un teléfono nuevo recupera todo', async () => {
    const nuevo = await telefono();

    const restaurado = await nuevo.respaldo.restaurar(await crear(), CONTRASENA);

    expect(restaurado).toEqual({
      ok: true,
      valor: {
        configuracion: true,
        comprobantes: 3,
        descartados: 0,
        clientes: 2,
        productos: 2,
        logo: true,
      },
    });
    expect(await nuevo.configuracion.leer()).toEqual({ emisor: juana, ambiente: 'produccion' });
    expect(await nuevo.comprobantes.todosDelEmisor(juana)).toEqual(
      await viejo.comprobantes.todosDelEmisor(juana),
    );
    const porCuit = (clientes: readonly Cliente[]) =>
      [...clientes].sort((a, b) => a.cuit.valor.localeCompare(b.cuit.valor));
    expect(porCuit(await nuevo.clientes.todos())).toEqual(porCuit(await viejo.clientes.todos()));
    expect(nuevo.logo.actual).toBe('iVBORw0KGgo=');
    // Los ids los pone cada base: se comparan sin ellos.
    const sinId = (productos: readonly { id?: number }[]) =>
      productos.map((producto) => ({ ...producto, id: undefined }));
    expect(sinId(await nuevo.productos.todos())).toEqual(sinId(await viejo.productos.todos()));
  });

  it('en un teléfono con el mismo emisor suma lo que falta sin pisar nada', async () => {
    const otroDomicilio = emisorCon('20111111112', 'Otra calle 9');
    const actual = await telefono({ emisor: otroDomicilio, ambiente: 'produccion' }, 'propio');
    await actual.comprobantes.guardar(emitido(3));
    await actual.comprobantes.guardar(emitido(4));
    await actual.productos.guardar({
      ...pintura,
      descripcion: 'PINTURA LATEX 20 L',
      precio: valor(Dinero.desdeTexto('1')),
    });

    const restaurado = valor(await actual.respaldo.restaurar(await crear(), CONTRASENA));

    expect(restaurado.configuracion).toBe(false);
    expect(restaurado.productos).toBe(1);
    expect((await actual.productos.todos()).map((p) => p.descripcion)).toEqual([
      'PINTURA LATEX 20 L',
      'Pincel',
    ]);
    expect(restaurado.logo).toBe(false);
    expect((await actual.configuracion.leer())?.emisor.datos.domicilio).toBe('Otra calle 9');
    expect(actual.logo.actual).toBe('propio');
    expect(
      (await actual.comprobantes.todosDelEmisor(juana)).map((c) => [c.ambiente, c.numero]),
    ).toEqual([
      ['produccion', 3],
      ['produccion', 4],
      ['homologacion', 1],
      ['produccion', 2],
    ]);
  });

  it('no mezcla los datos de otro emisor', async () => {
    const ajeno = await telefono({ emisor: otra, ambiente: 'produccion' });

    const restaurado = await ajeno.respaldo.restaurar(await crear(), CONTRASENA);

    expect(restaurado).toEqual({
      ok: false,
      error: { tipo: 'otro_emisor', cuit: juana.datos.cuit },
    });
    expect(await ajeno.comprobantes.todosDelEmisor(juana)).toEqual([]);
  });

  it('con otra contraseña no toca nada', async () => {
    const nuevo = await telefono();

    const restaurado = await nuevo.respaldo.restaurar(await crear(), 'otra contraseña larga');

    expect(restaurado.ok).toBe(false);
    expect(await nuevo.configuracion.leer()).toBeUndefined();
  });

  it('rechaza un contenido que no es un respaldo', async () => {
    const nuevo = await telefono();
    const basura = await cifradoDePrueba.cifrar(new TextEncoder().encode('[1, 2]'), CONTRASENA);

    expect(await nuevo.respaldo.restaurar(basura, CONTRASENA)).toEqual({
      ok: false,
      error: { tipo: 'contenido_invalido' },
    });
  });

  it('descarta los comprobantes dañados o de otro emisor y restaura los demás', async () => {
    const contenido = await abrir(await crear());
    const [primero, segundo] = contenido.comprobantes;
    const ajeno = await telefono({ emisor: otra, ambiente: 'produccion' });
    await ajeno.comprobantes.guardar(emitido(9, 'produccion', otra));
    const [comprobanteAjeno] = (await abrir(valor(await ajeno.respaldo.crear(CONTRASENA))))
      .comprobantes;
    const alterado = {
      ...contenido,
      comprobantes: [
        primero,
        { ...segundo, datos: '{"version":99}' },
        { ...segundo, ambiente: 'otro' },
        comprobanteAjeno,
      ],
    };
    const archivo = await cifradoDePrueba.cifrar(
      new TextEncoder().encode(JSON.stringify(alterado)),
      CONTRASENA,
    );
    const nuevo = await telefono();

    const restaurado = valor(await nuevo.respaldo.restaurar(archivo, CONTRASENA));

    expect(restaurado.comprobantes).toBe(1);
    expect(restaurado.descartados).toBe(3);
  });

  it('un logo que no pasa la validación no frena el resto', async () => {
    const conLogoDanado = await telefono({ emisor: juana, ambiente: 'produccion' }, 'dañado');
    const archivo = valor(await conLogoDanado.respaldo.crear(CONTRASENA));
    const nuevo = await telefono();

    const restaurado = valor(await nuevo.respaldo.restaurar(archivo, CONTRASENA));

    expect(restaurado.logo).toBe(false);
    expect(restaurado.configuracion).toBe(true);
  });
});
