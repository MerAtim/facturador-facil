import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  Dni,
  FechaCalendario,
  TipoComprobante,
  type Concepto,
  type IdentificacionReceptor,
  type ItemComprobante,
  type ModoDePrecio,
  type PeriodoDeServicio,
  type Receptor,
} from '@facturador/dominio';

import type { Ambiente } from '../configuracion/configuracion';
import type { BaseDeDatos, FilaSql } from '../puertos/baseDeDatos';

/** Un comprobante que ARCA autorizó, con lo necesario para mostrarlo o rehacer su PDF. */
export interface ComprobanteEmitido {
  readonly ambiente: Ambiente;
  readonly cuitEmisor: Cuit;
  readonly puntoDeVenta: number;
  readonly numero: number;
  /** Ya autorizado: tiene el CAE. */
  readonly comprobante: Comprobante;
  readonly receptor: Receptor;
}

/**
 * Los comprobantes emitidos. Una factura autorizada es un registro fiscal: se guarda apenas ARCA
 * la autoriza, en la base cifrada del teléfono.
 */
export interface RepositorioDeComprobantes {
  /** Guardar dos veces el mismo comprobante no lo duplica: el reintento de una emisión es seguro. */
  guardar(emitido: ComprobanteEmitido): Promise<void>;
  /** Los más recientes primero, del emisor y ambiente indicados. */
  listar(filtro: {
    readonly ambiente: Ambiente;
    readonly cuitEmisor: Cuit;
    readonly limite: number;
  }): Promise<readonly ComprobanteEmitido[]>;
}

const VERSION = 1;
const MODOS_DE_PRECIO: readonly ModoDePrecio[] = ['final', 'neto'];
const CONCEPTOS: readonly Concepto[] = ['productos', 'servicios', 'productos_y_servicios'];

const GUARDAR = `
  INSERT INTO comprobantes (
    ambiente, cuit_emisor, tipo, punto_de_venta, numero, fecha, total_en_centavos, receptor, cae,
    datos, guardado_en
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (ambiente, cuit_emisor, tipo, punto_de_venta, numero) DO NOTHING
`;

const LISTAR = `
  SELECT punto_de_venta, numero, datos
  FROM comprobantes
  WHERE ambiente = ? AND cuit_emisor = ?
  ORDER BY fecha DESC, id DESC
  LIMIT ?
`;

/** Lo que va en la columna `datos`. Solo tipos simples, para que un cambio de clase no lo rompa. */
interface Guardado {
  readonly version: number;
  readonly tipo: number;
  readonly modoDePrecio: string;
  readonly concepto: string;
  readonly fechaDeEmision: string;
  readonly periodoDeServicio?: {
    readonly desde: string;
    readonly hasta: string;
    readonly vencimientoDePago: string;
  };
  readonly items: readonly {
    readonly descripcion: string;
    readonly cantidadEnMilesimas: number;
    readonly precioUnitarioEnCentavos: number;
    readonly alicuota?: number;
  }[];
  readonly receptor: {
    readonly condicion: number;
    readonly cuit?: string;
    readonly dni?: string;
    readonly nombre?: string;
    readonly domicilio?: string;
  };
  readonly cae: string;
  readonly vencimientoDelCae: string;
}

export function crearRepositorioDeComprobantes(
  base: BaseDeDatos,
  ahora: () => number = Date.now,
): RepositorioDeComprobantes {
  return {
    async guardar(emitido) {
      const { comprobante, receptor } = emitido;
      const { autorizacion } = comprobante;
      if (!autorizacion) throw new Error('Solo se guardan comprobantes autorizados.');

      await base.ejecutar(GUARDAR, [
        emitido.ambiente,
        emitido.cuitEmisor.valor,
        comprobante.datos.tipo.codigoArca,
        emitido.puntoDeVenta,
        emitido.numero,
        comprobante.datos.fechaDeEmision.aTextoArca(),
        comprobante.totales.total.centavos,
        receptor.nombre ?? documentoDe(receptor.identificacion) ?? null,
        autorizacion.cae,
        JSON.stringify(aGuardado(comprobante, receptor)),
        ahora(),
      ]);
    },

    async listar({ ambiente, cuitEmisor, limite }) {
      const filas = await base.consultar(LISTAR, [ambiente, cuitEmisor.valor, limite]);
      // Una fila que no se puede leer no tapa a las demás.
      return filas.flatMap((fila) => {
        const rearmado = desdeFila(fila);
        return rearmado ? [{ ambiente, cuitEmisor, ...rearmado }] : [];
      });
    },
  };
}

function documentoDe(identificacion: IdentificacionReceptor): string | undefined {
  switch (identificacion.tipo) {
    case 'cuit':
      return identificacion.cuit.valor;
    case 'dni':
      return identificacion.dni.valor;
    case 'sin_identificar':
      return undefined;
  }
}

function aGuardado(comprobante: Comprobante, receptor: Receptor): Guardado {
  const { datos, autorizacion } = comprobante;
  const { identificacion, nombre, domicilio } = receptor;
  const periodo = datos.periodoDeServicio;
  return {
    version: VERSION,
    tipo: datos.tipo.codigoArca,
    modoDePrecio: datos.modoDePrecio,
    concepto: datos.concepto,
    fechaDeEmision: datos.fechaDeEmision.aTextoArca(),
    ...(periodo && {
      periodoDeServicio: {
        desde: periodo.desde.aTextoArca(),
        hasta: periodo.hasta.aTextoArca(),
        vencimientoDePago: periodo.vencimientoDePago.aTextoArca(),
      },
    }),
    items: datos.items.map((item) => ({
      descripcion: item.descripcion,
      cantidadEnMilesimas: item.cantidad.milesimas,
      precioUnitarioEnCentavos: item.precioUnitario.centavos,
      ...(item.alicuota && { alicuota: item.alicuota.codigoArca }),
    })),
    receptor: {
      condicion: receptor.condicion.codigoArca,
      ...(identificacion.tipo === 'cuit' && { cuit: identificacion.cuit.valor }),
      ...(identificacion.tipo === 'dni' && { dni: identificacion.dni.valor }),
      ...(nombre !== undefined && { nombre }),
      ...(domicilio !== undefined && { domicilio }),
    },
    cae: autorizacion?.cae ?? '',
    vencimientoDelCae: autorizacion?.vencimiento.aTextoArca() ?? '',
  };
}

/**
 * Rearma el comprobante con las mismas validaciones del dominio que al emitirlo. Los totales se
 * recalculan con las mismas reglas, así que coinciden con lo que se autorizó.
 */
function desdeFila(fila: FilaSql): Omit<ComprobanteEmitido, 'ambiente' | 'cuitEmisor'> | undefined {
  const { punto_de_venta, numero, datos } = fila;
  if (typeof punto_de_venta !== 'number' || typeof numero !== 'number') return undefined;
  const rearmado = typeof datos === 'string' ? rearmarTexto(datos) : undefined;
  return rearmado && { puntoDeVenta: punto_de_venta, numero, ...rearmado };
}

/** Lo guardado se trata como cualquier entrada: un dato dañado descarta el comprobante, no la lista. */
function rearmarTexto(
  texto: string,
): Pick<ComprobanteEmitido, 'comprobante' | 'receptor'> | undefined {
  try {
    const datos: unknown = JSON.parse(texto);
    return esGuardado(datos) ? rearmar(datos) : undefined;
  } catch {
    return undefined;
  }
}

function esGuardado(valor: unknown): valor is Guardado {
  if (typeof valor !== 'object' || valor === null) return false;
  const { version, items, receptor } = valor as Record<string, unknown>;
  return (
    version === VERSION && Array.isArray(items) && typeof receptor === 'object' && receptor !== null
  );
}

/** Cada dato se vuelve a validar: lo que no tiene sentido descarta el comprobante entero. */
function rearmar(
  guardado: Guardado,
): Pick<ComprobanteEmitido, 'comprobante' | 'receptor'> | undefined {
  const tipo = TipoComprobante.desdeCodigoArca(guardado.tipo);
  const modoDePrecio = MODOS_DE_PRECIO.find((modo) => modo === guardado.modoDePrecio);
  const concepto = CONCEPTOS.find((c) => c === guardado.concepto);
  const fechaDeEmision = fecha(guardado.fechaDeEmision);
  const vencimientoDelCae = fecha(guardado.vencimientoDelCae);
  const receptor = rearmarReceptor(guardado.receptor);
  const items = guardado.items.map(rearmarItem);
  const periodo = guardado.periodoDeServicio;
  const periodoDeServicio = periodo && rearmarPeriodo(periodo);

  if (
    !tipo ||
    !modoDePrecio ||
    !concepto ||
    !fechaDeEmision ||
    !vencimientoDelCae ||
    !receptor ||
    !items.every((item) => item !== undefined) ||
    (periodo && !periodoDeServicio)
  ) {
    return undefined;
  }

  const creado = Comprobante.crear({
    tipo,
    receptor: receptor.condicion,
    identificacionReceptor: receptor.identificacion,
    modoDePrecio,
    items,
    fechaDeEmision,
    concepto,
    ...(periodoDeServicio && { periodoDeServicio }),
  });
  const autorizado = creado.ok ? creado.valor.autorizar(guardado.cae, vencimientoDelCae) : creado;
  return autorizado.ok ? { comprobante: autorizado.valor, receptor } : undefined;
}

function rearmarPeriodo(
  guardado: NonNullable<Guardado['periodoDeServicio']>,
): PeriodoDeServicio | undefined {
  const desde = fecha(guardado.desde);
  const hasta = fecha(guardado.hasta);
  const vencimientoDePago = fecha(guardado.vencimientoDePago);
  return desde && hasta && vencimientoDePago ? { desde, hasta, vencimientoDePago } : undefined;
}

function rearmarItem(item: Guardado['items'][number]): ItemComprobante | undefined {
  const cantidad = Cantidad.desdeMilesimas(item.cantidadEnMilesimas);
  const precio = Dinero.desdeCentavos(item.precioUnitarioEnCentavos);
  const alicuota =
    item.alicuota === undefined ? undefined : AlicuotaIva.desdeCodigoArca(item.alicuota);
  if (
    typeof item.descripcion !== 'string' ||
    !cantidad.ok ||
    !precio.ok ||
    (item.alicuota !== undefined && !alicuota)
  ) {
    return undefined;
  }
  return {
    descripcion: item.descripcion,
    cantidad: cantidad.valor,
    precioUnitario: precio.valor,
    ...(alicuota && { alicuota }),
  };
}

function rearmarReceptor(guardado: Guardado['receptor']): Receptor | undefined {
  const condicion = CondicionIvaReceptor.desdeCodigoArca(guardado.condicion);
  const identificacion = rearmarIdentificacion(guardado);
  if (!condicion || !identificacion) return undefined;
  return {
    identificacion,
    condicion,
    ...(typeof guardado.nombre === 'string' && { nombre: guardado.nombre }),
    ...(typeof guardado.domicilio === 'string' && { domicilio: guardado.domicilio }),
  };
}

function rearmarIdentificacion(guardado: Guardado['receptor']): IdentificacionReceptor | undefined {
  if (guardado.cuit !== undefined) {
    const cuit = Cuit.crear(guardado.cuit);
    return cuit.ok ? { tipo: 'cuit', cuit: cuit.valor } : undefined;
  }
  if (guardado.dni !== undefined) {
    const dni = Dni.crear(guardado.dni);
    return dni.ok ? { tipo: 'dni', dni: dni.valor } : undefined;
  }
  return { tipo: 'sin_identificar' };
}

function fecha(texto: string): FechaCalendario | undefined {
  const resultado = FechaCalendario.desdeTextoArca(texto);
  return resultado.ok ? resultado.valor : undefined;
}
