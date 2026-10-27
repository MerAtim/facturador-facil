import type { AlmacenLocal } from '@facturador/aplicacion';
import { exito, type Cuit, type Resultado } from '@facturador/dominio';

import { URLS, type Ambiente } from '../ambiente';
import type { Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa } from '../wsaa/wsaa';
import { conTicket } from './comun';
import {
  consultarAlicuotasDeIva,
  consultarCondicionesIvaReceptor,
  consultarMonedas,
  consultarPuntosDeVenta,
  consultarTiposDeComprobante,
  type Autorizacion,
  type CondicionIvaReceptorArca,
  type ErrorWsfe,
  type ParametroWsfe,
  type PuntoDeVentaArca,
} from './wsfe';

/** Las tablas de ARCA cambian muy de vez en cuando: alcanza con consultarlas una vez por día. */
const DURACION_MS = 24 * 60 * 60 * 1000;

/** Se cambia si cambia la forma de lo guardado, para no leer datos con el formato viejo. */
const VERSION = 'v1';

export type ErrorParametros = ErrorWsfe | ErrorWsaa;

type Consulta<T> = Promise<Resultado<readonly T[], ErrorParametros>>;

export interface ParametrosWsfe {
  tiposDeComprobante(): Consulta<ParametroWsfe>;
  alicuotasDeIva(): Consulta<ParametroWsfe>;
  monedas(): Consulta<ParametroWsfe>;
  puntosDeVenta(): Consulta<PuntoDeVentaArca>;
  condicionesIvaReceptor(): Consulta<CondicionIvaReceptorArca>;
  /** Descarta lo guardado, por ejemplo después de dar de alta un punto de venta. */
  olvidar(): Promise<void>;
}

export interface ConfiguracionDeParametros {
  readonly ambiente: Ambiente;
  readonly cuit: Cuit;
  readonly tickets: ProveedorDeTickets;
  readonly transporte: Transporte;
  readonly almacen: AlmacenLocal;
  readonly reloj?: () => Date;
}

interface Guardado {
  readonly consultado: string;
  readonly valor: readonly unknown[];
}

/**
 * Consulta las tablas de WSFEv1 y las guarda un día en el almacén local. Si ARCA no responde,
 * devuelve lo último guardado aunque esté vencido: para elegir un tipo de comprobante sirve
 * más un dato de ayer que ninguno.
 */
export function crearParametrosWsfe(config: ConfiguracionDeParametros): ParametrosWsfe {
  const reloj = config.reloj ?? (() => new Date());
  const url = URLS[config.ambiente].wsfe;
  const prefijo = `parametros.${VERSION}.${config.ambiente}.${config.cuit.valor}`;
  const enMemoria = new Map<string, Guardado>();
  const claves: string[] = [];

  const vigente = (guardado: Guardado) => {
    const edad = reloj().getTime() - new Date(guardado.consultado).getTime();
    return edad >= 0 && edad < DURACION_MS;
  };

  function enCache<T>(
    nombre: string,
    consulta: (autorizacion: Autorizacion, transporte: Transporte, url: string) => Consulta<T>,
  ): () => Consulta<T> {
    const clave = `${prefijo}.${nombre}`;
    claves.push(clave);

    return async () => {
      const guardado = enMemoria.get(clave) ?? (await leer(config.almacen, clave));
      // Lo guardado lo escribió este mismo módulo con el formato de VERSION.
      const valorGuardado = guardado?.valor as readonly T[] | undefined;
      if (guardado && vigente(guardado)) {
        enMemoria.set(clave, guardado);
        return exito(valorGuardado ?? []);
      }

      const resultado = await conTicket(config.tickets, config.cuit, (autorizacion) =>
        consulta(autorizacion, config.transporte, url),
      );
      if (!resultado.ok) return valorGuardado ? exito(valorGuardado) : resultado;

      const nuevo: Guardado = { consultado: reloj().toISOString(), valor: resultado.valor };
      enMemoria.set(clave, nuevo);
      await escribir(config.almacen, clave, nuevo);
      return resultado;
    };
  }

  return {
    tiposDeComprobante: enCache('tiposDeComprobante', consultarTiposDeComprobante),
    alicuotasDeIva: enCache('alicuotasDeIva', consultarAlicuotasDeIva),
    monedas: enCache('monedas', consultarMonedas),
    puntosDeVenta: enCache('puntosDeVenta', consultarPuntosDeVenta),
    condicionesIvaReceptor: enCache('condicionesIvaReceptor', consultarCondicionesIvaReceptor),

    async olvidar() {
      enMemoria.clear();
      await Promise.all(claves.map((clave) => config.almacen.borrar(clave)));
    },
  };
}

/** Un dato ilegible o un almacén que falla equivalen a no tener nada guardado. */
async function leer(almacen: AlmacenLocal, clave: string): Promise<Guardado | undefined> {
  try {
    const texto = await almacen.leer(clave);
    if (texto === undefined) return undefined;

    const { consultado, valor } = JSON.parse(texto) as Partial<Guardado>;
    if (typeof consultado !== 'string' || !Array.isArray(valor)) return undefined;
    if (Number.isNaN(new Date(consultado).getTime())) return undefined;
    return { consultado, valor };
  } catch {
    return undefined;
  }
}

/** Sin almacén se pierde solo la persistencia entre reinicios, no la consulta. */
async function escribir(almacen: AlmacenLocal, clave: string, guardado: Guardado) {
  try {
    await almacen.guardar(clave, JSON.stringify(guardado));
  } catch {
    // La copia en memoria sigue sirviendo mientras la app esté abierta.
  }
}
