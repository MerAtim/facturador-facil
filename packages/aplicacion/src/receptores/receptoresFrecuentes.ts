import { CondicionIvaReceptor, Cuit, LARGO_MAXIMO_DOMICILIO } from '@facturador/dominio';

import type { AlmacenSeguro } from '../puertos/almacenSeguro';

/** Un receptor que se identifica con CUIT, el único que vale la pena recordar. */
export interface ReceptorConCuit {
  readonly cuit: Cuit;
  readonly condicion: CondicionIvaReceptor;
  readonly nombre?: string;
  readonly domicilio?: string;
}

/**
 * Los receptores a los que más se factura, para elegirlos con un toque. Son datos personales de
 * los clientes: van cifrados en el AlmacenSeguro y se guardan pocos, lo que entra cómodo ahí.
 *
 * Perder la lista no hace daño, así que un almacén que falla nunca interrumpe la carga.
 */
export interface ReceptoresFrecuentes {
  /** Primero los más usados; entre los que se usaron igual, el más reciente. */
  listar(): Promise<readonly ReceptorConCuit[]>;
  /** Suma un uso. Actualiza la condición, el nombre y el domicilio si cambiaron. */
  registrarUso(receptor: ReceptorConCuit): Promise<void>;
}

const CLAVE = 'receptores.frecuentes';
export const MAXIMO_DE_RECEPTORES_FRECUENTES = 8;
const LARGO_MAXIMO_DEL_NOMBRE = 60;

interface Registro {
  readonly cuit: string;
  readonly condicion: number;
  readonly nombre?: string;
  readonly domicilio?: string;
  readonly usos: number;
  readonly ultimoUso: number;
}

export function crearReceptoresFrecuentes(
  almacen: AlmacenSeguro,
  ahora: () => number = Date.now,
): ReceptoresFrecuentes {
  // Cada uso lee, modifica y guarda la lista: en fila, para que dos usos seguidos no se pisen.
  let fila: Promise<unknown> = Promise.resolve();

  const leer = async (): Promise<readonly Registro[]> => {
    const guardado = await almacen.leer(CLAVE).catch(() => undefined);
    return guardado === undefined ? [] : interpretar(guardado);
  };

  return {
    async listar() {
      const registros = await leer();
      return [...registros]
        .sort((a, b) => b.usos - a.usos || b.ultimoUso - a.ultimoUso)
        .flatMap((registro) => {
          const receptor = aReceptor(registro);
          return receptor ? [receptor] : [];
        });
    },

    registrarUso(receptor) {
      const tarea = fila.then(async () => {
        const registros = await leer();
        const anterior = registros.find((registro) => registro.cuit === receptor.cuit.valor);
        const actualizado: Registro = {
          cuit: receptor.cuit.valor,
          condicion: receptor.condicion.codigoArca,
          ...textosLimpios(receptor),
          usos: (anterior?.usos ?? 0) + 1,
          ultimoUso: ahora(),
        };

        // Si no entran todos, sale el que se usó hace más tiempo.
        const lista = [actualizado, ...registros.filter((registro) => registro !== anterior)]
          .sort((a, b) => b.ultimoUso - a.ultimoUso)
          .slice(0, MAXIMO_DE_RECEPTORES_FRECUENTES);

        await almacen.guardar(CLAVE, JSON.stringify(lista)).catch(() => undefined);
      });
      fila = tarea.catch(() => undefined);
      return tarea;
    },
  };
}

/** Sin caracteres de control: el nombre y el domicilio se muestran en pantalla y en el PDF. */
function limpiar(texto: string | undefined, largo: number): string | undefined {
  const limpio = texto
    ?.replace(/\p{Cc}/gu, ' ')
    .trim()
    .slice(0, largo);
  return limpio === '' ? undefined : limpio;
}

function textosLimpios(datos: { readonly nombre?: string; readonly domicilio?: string }) {
  const nombre = limpiar(datos.nombre, LARGO_MAXIMO_DEL_NOMBRE);
  const domicilio = limpiar(datos.domicilio, LARGO_MAXIMO_DOMICILIO);
  return { ...(nombre ? { nombre } : {}), ...(domicilio ? { domicilio } : {}) };
}

/** Lo guardado se valida como cualquier entrada: un registro dañado se descarta, no rompe la lista. */
function interpretar(texto: string): readonly Registro[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  return datos.filter(esRegistro).slice(0, MAXIMO_DE_RECEPTORES_FRECUENTES);
}

function esRegistro(valor: unknown): valor is Registro {
  if (typeof valor !== 'object' || valor === null) return false;
  const { cuit, condicion, nombre, domicilio, usos, ultimoUso } = valor as Record<string, unknown>;
  return (
    typeof cuit === 'string' &&
    typeof condicion === 'number' &&
    (nombre === undefined || typeof nombre === 'string') &&
    (domicilio === undefined || typeof domicilio === 'string') &&
    Number.isSafeInteger(usos) &&
    Number.isSafeInteger(ultimoUso)
  );
}

function aReceptor(registro: Registro): ReceptorConCuit | undefined {
  const cuit = Cuit.crear(registro.cuit);
  const condicion = CondicionIvaReceptor.desdeCodigoArca(registro.condicion);
  if (!cuit.ok || !condicion) return undefined;

  return { cuit: cuit.valor, condicion, ...textosLimpios(registro) };
}
