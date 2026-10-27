import { Cuit, Emisor, FechaCalendario, type CondicionEmisor } from '@facturador/dominio';

import type { AlmacenSeguro } from '../puertos/almacenSeguro';

/** Homologación es el ambiente de prueba de ARCA: lo que se emite ahí no tiene validez fiscal. */
export type Ambiente = 'homologacion' | 'produccion';

export interface Configuracion {
  readonly emisor: Emisor;
  readonly ambiente: Ambiente;
}

/**
 * Los datos del emisor y el ambiente en el que factura. Van cifrados en el AlmacenSeguro: son
 * datos personales y, a diferencia de una caché, perderlos obliga a cargarlos de nuevo.
 */
export interface RepositorioDeConfiguracion {
  /** Sin configuración guardada, o si lo guardado ya no es válido, devuelve undefined. */
  leer(): Promise<Configuracion | undefined>;
  guardar(configuracion: Configuracion): Promise<void>;
}

const CLAVE = 'configuracion.emisor';
const VERSION = 1;
const CONDICIONES: readonly CondicionEmisor[] = ['responsable_inscripto', 'monotributo', 'exento'];
const AMBIENTES: readonly Ambiente[] = ['homologacion', 'produccion'];

interface Guardado {
  readonly version: number;
  readonly ambiente: string;
  readonly razonSocial: string;
  readonly cuit: string;
  readonly condicion: string;
  readonly domicilio: string;
  readonly inicioDeActividades: string;
  readonly puntoDeVenta: number;
}

export function crearRepositorioDeConfiguracion(
  almacen: AlmacenSeguro,
): RepositorioDeConfiguracion {
  return {
    async leer() {
      const texto = await almacen.leer(CLAVE);
      return texto === undefined ? undefined : interpretar(texto);
    },

    async guardar({ emisor, ambiente }) {
      const { datos } = emisor;
      const guardado: Guardado = {
        version: VERSION,
        ambiente,
        razonSocial: datos.razonSocial,
        cuit: datos.cuit.valor,
        condicion: datos.condicion,
        domicilio: datos.domicilio,
        inicioDeActividades: datos.inicioDeActividades.aTextoArca(),
        puntoDeVenta: datos.puntoDeVenta,
      };
      await almacen.guardar(CLAVE, JSON.stringify(guardado));
    },
  };
}

/** Lo guardado pasa por las mismas validaciones que lo que se carga en pantalla. */
function interpretar(texto: string): Configuracion | undefined {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return undefined;
  }
  if (!esGuardado(datos) || datos.version !== VERSION) return undefined;

  const ambiente = AMBIENTES.find((a) => a === datos.ambiente);
  const condicion = CONDICIONES.find((c) => c === datos.condicion);
  const cuit = Cuit.crear(datos.cuit);
  const inicio = FechaCalendario.desdeTextoArca(datos.inicioDeActividades);
  if (!ambiente || !condicion || !cuit.ok || !inicio.ok) return undefined;

  const emisor = Emisor.crear({
    razonSocial: datos.razonSocial,
    cuit: cuit.valor,
    condicion,
    domicilio: datos.domicilio,
    inicioDeActividades: inicio.valor,
    puntoDeVenta: datos.puntoDeVenta,
  });
  return emisor.ok ? { emisor: emisor.valor, ambiente } : undefined;
}

function esGuardado(valor: unknown): valor is Guardado {
  if (typeof valor !== 'object' || valor === null) return false;
  const { version, puntoDeVenta, ...textos } = valor as Record<string, unknown>;
  const { ambiente, razonSocial, cuit, condicion, domicilio, inicioDeActividades } = textos;
  return (
    typeof version === 'number' &&
    typeof puntoDeVenta === 'number' &&
    [ambiente, razonSocial, cuit, condicion, domicilio, inicioDeActividades].every(
      (campo) => typeof campo === 'string',
    )
  );
}
