import {
  TipoComprobante,
  type ClaseComprobante,
  type Comprobante,
  type Emisor,
  type FechaCalendario,
  type IdentificacionReceptor,
  type Receptor,
} from '@facturador/dominio';

import type { Ambiente } from '../configuracion/configuracion';
import type { BaseDeDatos, FilaSql, ValorSql } from '../puertos/baseDeDatos';
import { interpretarBusqueda } from './busquedaDeComprobantes';
import { aTextoGuardado, desdeTextoGuardado } from './formatoGuardado';

/** Un comprobante que ARCA autorizó, con lo necesario para mostrarlo o rehacer su PDF. */
export interface ComprobanteEmitido {
  readonly ambiente: Ambiente;
  /** Los datos del emisor al momento de emitir: el PDF sale igual aunque después cambien. */
  readonly emisor: Emisor;
  readonly puntoDeVenta: number;
  readonly numero: number;
  /** Ya autorizado: tiene el CAE. */
  readonly comprobante: Comprobante;
  readonly receptor: Receptor;
}

export interface FiltroDeComprobantes {
  readonly ambiente: Ambiente;
  /** El emisor actual: se listan sus comprobantes, y sus datos completan los más viejos. */
  readonly emisor: Emisor;
  readonly limite: number;
  /** Parte del nombre, CUIT o DNI del receptor, el número o el importe total. */
  readonly busqueda?: string;
  /** Inclusive. */
  readonly desde?: FechaCalendario;
  /** Inclusive. */
  readonly hasta?: FechaCalendario;
  readonly clase?: ClaseComprobante;
}

export interface ClaveDeComprobante {
  readonly ambiente: Ambiente;
  readonly emisor: Emisor;
  readonly tipo: TipoComprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
}

/**
 * Los comprobantes emitidos. Una factura autorizada es un registro fiscal: se guarda apenas ARCA
 * la autoriza, en la base cifrada del teléfono.
 */
export interface RepositorioDeComprobantes {
  /** Guardar dos veces el mismo comprobante no lo duplica: el reintento de una emisión es seguro. */
  guardar(emitido: ComprobanteEmitido): Promise<void>;
  /** Los más recientes primero. */
  listar(filtro: FiltroDeComprobantes): Promise<readonly ComprobanteEmitido[]>;
  leer(clave: ClaveDeComprobante): Promise<ComprobanteEmitido | undefined>;
}

const GUARDAR = `
  INSERT INTO comprobantes (
    ambiente, cuit_emisor, tipo, punto_de_venta, numero, fecha, total_en_centavos, receptor,
    receptor_documento, cae, datos, guardado_en
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (ambiente, cuit_emisor, tipo, punto_de_venta, numero) DO NOTHING
`;

// Cada filtro opcional es `? IS NULL OR ...`: sin ese filtro se pasa null y la condición no cuenta.
// Así la consulta es siempre el mismo texto y los datos van solo como parámetros.
const LISTAR = `
  SELECT punto_de_venta, numero, datos
  FROM comprobantes
  WHERE ambiente = ? AND cuit_emisor = ?
    AND (? IS NULL OR fecha >= ?)
    AND (? IS NULL OR fecha <= ?)
    AND (? IS NULL OR tipo IN (?, ?, ?))
    AND (
      ? IS NULL
      OR receptor LIKE ? ESCAPE '\\'
      OR receptor_documento LIKE ? ESCAPE '\\'
      OR numero = ?
      OR (punto_de_venta = ? AND numero = ?)
      OR total_en_centavos = ?
    )
  ORDER BY fecha DESC, id DESC
  LIMIT ?
`;

const LEER = `
  SELECT punto_de_venta, numero, datos
  FROM comprobantes
  WHERE ambiente = ? AND cuit_emisor = ? AND tipo = ? AND punto_de_venta = ? AND numero = ?
`;

export function crearRepositorioDeComprobantes(
  base: BaseDeDatos,
  ahora: () => number = Date.now,
): RepositorioDeComprobantes {
  const rearmar = (filas: readonly FilaSql[], ambiente: Ambiente, emisorActual: Emisor) =>
    // Una fila que no se puede leer no tapa a las demás.
    filas.flatMap((fila) => {
      const emitido = desdeFila(fila, ambiente, emisorActual);
      return emitido ? [emitido] : [];
    });

  return {
    async guardar(emitido) {
      const { comprobante, receptor } = emitido;
      const { autorizacion } = comprobante;
      if (!autorizacion) throw new Error('Solo se guardan comprobantes autorizados.');

      await base.ejecutar(GUARDAR, [
        emitido.ambiente,
        emitido.emisor.datos.cuit.valor,
        comprobante.datos.tipo.codigoArca,
        emitido.puntoDeVenta,
        emitido.numero,
        comprobante.datos.fechaDeEmision.aTextoArca(),
        comprobante.totales.total.centavos,
        receptor.nombre ?? null,
        documentoDe(receptor.identificacion) ?? null,
        autorizacion.cae,
        aTextoGuardado(emitido),
        ahora(),
      ]);
    },

    async listar(filtro) {
      const { ambiente, emisor } = filtro;
      return rearmar(await base.consultar(LISTAR, parametrosDeListar(filtro)), ambiente, emisor);
    },

    async leer({ ambiente, emisor, tipo, puntoDeVenta, numero }) {
      const filas = await base.consultar(LEER, [
        ambiente,
        emisor.datos.cuit.valor,
        tipo.codigoArca,
        puntoDeVenta,
        numero,
      ]);
      return rearmar(filas, ambiente, emisor)[0];
    },
  };
}

function parametrosDeListar(filtro: FiltroDeComprobantes): ValorSql[] {
  const desde = filtro.desde?.aTextoArca() ?? null;
  const hasta = filtro.hasta?.aTextoArca() ?? null;
  const tipos = filtro.clase
    ? TipoComprobante.TODOS.filter((tipo) => tipo.clase === filtro.clase).map(
        (tipo) => tipo.codigoArca,
      )
    : [];
  const busqueda = filtro.busqueda === undefined ? undefined : interpretarBusqueda(filtro.busqueda);
  const conNumero = busqueda?.puntoDeVentaYNumero;
  return [
    filtro.ambiente,
    filtro.emisor.datos.cuit.valor,
    desde,
    desde,
    hasta,
    hasta,
    filtro.clase ?? null,
    tipos[0] ?? null,
    tipos[1] ?? null,
    tipos[2] ?? null,
    busqueda ? 1 : null,
    busqueda?.nombre ?? null,
    busqueda?.documento ?? null,
    busqueda?.numero ?? null,
    conNumero?.puntoDeVenta ?? null,
    conNumero?.numero ?? null,
    busqueda?.totalEnCentavos ?? null,
    filtro.limite,
  ];
}

function desdeFila(
  fila: FilaSql,
  ambiente: Ambiente,
  emisorActual: Emisor,
): ComprobanteEmitido | undefined {
  const { punto_de_venta, numero, datos } = fila;
  if (typeof punto_de_venta !== 'number' || typeof numero !== 'number') return undefined;
  const rearmado = typeof datos === 'string' ? desdeTextoGuardado(datos, emisorActual) : undefined;
  return rearmado && { ambiente, puntoDeVenta: punto_de_venta, numero, ...rearmado };
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
