import {
  clasesQuePuedeEmitir,
  FechaCalendario,
  TipoComprobante,
  type ClaseComprobante,
  type Emisor,
} from '@facturador/dominio';

import type { Ambiente } from '../configuracion/configuracion';
import type { BaseDeDatos, FilaSql } from '../puertos/baseDeDatos';
import { totalesDelPeriodo, type TotalesDelPeriodo } from './totalesDelPeriodo';

/**
 * Un comprobante que se emitió desde otro dispositivo del mismo CUIT, tal como lo tiene ARCA. ARCA
 * no guarda la descripción de los ítems ni el nombre del receptor: alcanza para verlo en la lista y
 * sumarlo a los totales, pero el PDF solo lo puede rehacer el dispositivo que lo emitió.
 */
export interface EmitidoEnOtroDispositivo {
  readonly ambiente: Ambiente;
  readonly tipo: TipoComprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
  readonly fechaDeEmision: FechaCalendario;
  readonly totalEnCentavos: number;
  readonly netoEnCentavos: number;
  readonly ivaEnCentavos: number;
  /** El CUIT o DNI del receptor; `0` si es un consumidor final sin identificar. */
  readonly documentoDelReceptor: string;
  readonly cae: string;
  readonly vencimientoDelCae: FechaCalendario;
}

/** De dónde salen: ARCA. Las fallas se lanzan, la sincronización las trata todas igual. */
export interface FuenteDeEmitidos {
  /** Los puntos de venta del CUIT habilitados para web service. */
  puntosDeVenta(): Promise<readonly number[]>;
  /** El último número autorizado; 0 si todavía no hay ninguno. */
  ultimo(puntoDeVenta: number, tipo: TipoComprobante): Promise<number>;
  leer(
    puntoDeVenta: number,
    tipo: TipoComprobante,
    numero: number,
  ): Promise<Omit<EmitidoEnOtroDispositivo, 'ambiente'> | undefined>;
}

export interface FiltroDeOtrosDispositivos {
  readonly ambiente: Ambiente;
  readonly emisor: Emisor;
  /** Inclusive. */
  readonly desde?: FechaCalendario;
  /** Inclusive. */
  readonly hasta?: FechaCalendario;
  readonly clase?: ClaseComprobante;
}

export interface RepositorioDeOtrosDispositivos {
  /** Guardar dos veces el mismo comprobante no lo duplica. */
  guardar(emisor: Emisor, emitido: EmitidoEnOtroDispositivo): Promise<void>;
  /** El último número que ya se trajo de ese punto de venta y tipo; 0 si ninguno. */
  ultimoNumero(
    ambiente: Ambiente,
    emisor: Emisor,
    puntoDeVenta: number,
    tipo: TipoComprobante,
  ): Promise<number>;
  /** Los más recientes primero. */
  listar(filtro: FiltroDeOtrosDispositivos): Promise<readonly EmitidoEnOtroDispositivo[]>;
  leer(
    ambiente: Ambiente,
    emisor: Emisor,
    clave: {
      readonly tipo: TipoComprobante;
      readonly puntoDeVenta: number;
      readonly numero: number;
    },
  ): Promise<EmitidoEnOtroDispositivo | undefined>;
  totales(filtro: FiltroDeOtrosDispositivos): Promise<TotalesDelPeriodo>;
}

const GUARDAR = `
  INSERT INTO comprobantes_de_otros_dispositivos (
    ambiente, cuit_emisor, tipo, punto_de_venta, numero, fecha, total_en_centavos,
    neto_en_centavos, iva_en_centavos, documento_del_receptor, cae, vencimiento_del_cae
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (ambiente, cuit_emisor, tipo, punto_de_venta, numero) DO NOTHING
`;

const ULTIMO_NUMERO = `
  SELECT MAX(numero) AS numero
  FROM comprobantes_de_otros_dispositivos
  WHERE ambiente = ? AND cuit_emisor = ? AND punto_de_venta = ? AND tipo = ?
`;

// Como en los propios: cada filtro opcional es `? IS NULL OR ...` y la consulta no cambia de texto.
const LISTAR = `
  SELECT tipo, punto_de_venta, numero, fecha, total_en_centavos, neto_en_centavos,
    iva_en_centavos, documento_del_receptor, cae, vencimiento_del_cae
  FROM comprobantes_de_otros_dispositivos
  WHERE ambiente = ? AND cuit_emisor = ?
    AND (? IS NULL OR fecha >= ?)
    AND (? IS NULL OR fecha <= ?)
    AND (? IS NULL OR tipo IN (?, ?, ?))
  ORDER BY fecha DESC, punto_de_venta, numero DESC
`;

const LEER = `
  SELECT tipo, punto_de_venta, numero, fecha, total_en_centavos, neto_en_centavos,
    iva_en_centavos, documento_del_receptor, cae, vencimiento_del_cae
  FROM comprobantes_de_otros_dispositivos
  WHERE ambiente = ? AND cuit_emisor = ? AND tipo = ? AND punto_de_venta = ? AND numero = ?
`;

export function crearRepositorioDeOtrosDispositivos(
  base: BaseDeDatos,
): RepositorioDeOtrosDispositivos {
  const listar = async (filtro: FiltroDeOtrosDispositivos) => {
    const desde = filtro.desde?.aTextoArca() ?? null;
    const hasta = filtro.hasta?.aTextoArca() ?? null;
    const tipos = filtro.clase
      ? TipoComprobante.TODOS.filter((tipo) => tipo.clase === filtro.clase).map(
          (tipo) => tipo.codigoArca,
        )
      : [];
    const filas = await base.consultar(LISTAR, [
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
    ]);
    // Una fila que no se puede leer no tapa a las demás.
    return filas.flatMap((fila) => {
      const leido = desdeFila(fila, filtro.ambiente);
      return leido ? [leido] : [];
    });
  };

  return {
    async guardar(emisor, emitido) {
      await base.ejecutar(GUARDAR, [
        emitido.ambiente,
        emisor.datos.cuit.valor,
        emitido.tipo.codigoArca,
        emitido.puntoDeVenta,
        emitido.numero,
        emitido.fechaDeEmision.aTextoArca(),
        emitido.totalEnCentavos,
        emitido.netoEnCentavos,
        emitido.ivaEnCentavos,
        emitido.documentoDelReceptor,
        emitido.cae,
        emitido.vencimientoDelCae.aTextoArca(),
      ]);
    },

    async ultimoNumero(ambiente, emisor, puntoDeVenta, tipo) {
      const [fila] = await base.consultar(ULTIMO_NUMERO, [
        ambiente,
        emisor.datos.cuit.valor,
        puntoDeVenta,
        tipo.codigoArca,
      ]);
      const numero = fila?.['numero'];
      return typeof numero === 'number' ? numero : 0;
    },

    listar,

    async leer(ambiente, emisor, { tipo, puntoDeVenta, numero }) {
      const [fila] = await base.consultar(LEER, [
        ambiente,
        emisor.datos.cuit.valor,
        tipo.codigoArca,
        puntoDeVenta,
        numero,
      ]);
      return fila && desdeFila(fila, ambiente);
    },

    async totales(filtro) {
      const lista = await listar(filtro);
      const signo = (tipo: TipoComprobante) => (tipo.naturaleza === 'nota_de_credito' ? -1 : 1);
      return lista.reduce<TotalesDelPeriodo>(
        (suma, { tipo, totalEnCentavos, netoEnCentavos, ivaEnCentavos }) => ({
          cantidad: suma.cantidad + 1,
          totalEnCentavos: suma.totalEnCentavos + signo(tipo) * totalEnCentavos,
          netoEnCentavos: suma.netoEnCentavos + signo(tipo) * netoEnCentavos,
          ivaEnCentavos: suma.ivaEnCentavos + signo(tipo) * ivaEnCentavos,
        }),
        totalesDelPeriodo([]),
      );
    },
  };
}

function desdeFila(fila: FilaSql, ambiente: Ambiente): EmitidoEnOtroDispositivo | undefined {
  const tipo = TipoComprobante.TODOS.find((t) => t.codigoArca === fila['tipo']);
  const leerFecha = (valor: unknown) =>
    typeof valor === 'string' ? FechaCalendario.desdeTextoArca(valor) : undefined;
  const fecha = leerFecha(fila['fecha']);
  const vencimiento = leerFecha(fila['vencimiento_del_cae']);
  const entero = (valor: unknown) => (typeof valor === 'number' ? valor : undefined);
  const puntoDeVenta = entero(fila['punto_de_venta']);
  const numero = entero(fila['numero']);
  const total = entero(fila['total_en_centavos']);
  const neto = entero(fila['neto_en_centavos']);
  const iva = entero(fila['iva_en_centavos']);
  const documento = fila['documento_del_receptor'];
  const cae = fila['cae'];
  if (
    !tipo ||
    !fecha?.ok ||
    !vencimiento?.ok ||
    puntoDeVenta === undefined ||
    numero === undefined ||
    total === undefined ||
    neto === undefined ||
    iva === undefined ||
    typeof documento !== 'string' ||
    typeof cae !== 'string'
  ) {
    return undefined;
  }
  return {
    ambiente,
    tipo,
    puntoDeVenta,
    numero,
    fechaDeEmision: fecha.valor,
    totalEnCentavos: total,
    netoEnCentavos: neto,
    ivaEnCentavos: iva,
    documentoDelReceptor: documento,
    cae,
    vencimientoDelCae: vencimiento.valor,
  };
}

/** Cuántos comprobantes se traen como mucho en una pasada, para no demorar la pantalla. */
export const MAXIMO_POR_PASADA = 50;

/**
 * Trae de ARCA los comprobantes nuevos de los otros puntos de venta del CUIT: desde el último que
 * ya se tiene de cada uno. El punto de venta de este dispositivo no se consulta, sus comprobantes
 * ya están completos en el teléfono. Devuelve cuántos trajo.
 */
export async function traerDeOtrosDispositivos({
  fuente,
  repositorio,
  ambiente,
  emisor,
  maximo = MAXIMO_POR_PASADA,
}: {
  readonly fuente: FuenteDeEmitidos;
  readonly repositorio: RepositorioDeOtrosDispositivos;
  readonly ambiente: Ambiente;
  readonly emisor: Emisor;
  readonly maximo?: number;
}): Promise<number> {
  const propio = emisor.datos.puntoDeVenta;
  const clases = clasesQuePuedeEmitir(emisor.datos.condicion);
  const tipos = TipoComprobante.TODOS.filter((tipo) => clases.includes(tipo.clase));
  const otros = (await fuente.puntosDeVenta()).filter((numero) => numero !== propio);

  let traidos = 0;
  for (const puntoDeVenta of otros) {
    for (const tipo of tipos) {
      const ultimoEnArca = await fuente.ultimo(puntoDeVenta, tipo);
      const ultimoGuardado = await repositorio.ultimoNumero(ambiente, emisor, puntoDeVenta, tipo);
      for (let numero = ultimoGuardado + 1; numero <= ultimoEnArca; numero += 1) {
        if (traidos >= maximo) return traidos;
        const emitido = await fuente.leer(puntoDeVenta, tipo, numero);
        if (!emitido) continue;
        await repositorio.guardar(emisor, { ...emitido, ambiente });
        traidos += 1;
      }
    }
  }
  return traidos;
}
