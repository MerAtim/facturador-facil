import type { Cuit } from '@facturador/dominio';

import type { Ambiente } from '../configuracion/configuracion';
import type { AlmacenLocal } from '../puertos/almacenLocal';

/**
 * Lo necesario para facturar por web service, en el orden en que se hace. La autorización y el
 * punto de venta se hacen en el sitio de ARCA: la app no los ve hasta verificar.
 */
export type PasoDeAlta =
  'datos' | 'certificado' | 'autorizacion' | 'punto_de_venta' | 'verificacion';

/** Homologación no valida el punto de venta: se puede facturar con cualquier número. */
const PASOS: Readonly<Record<Ambiente, readonly PasoDeAlta[]>> = {
  homologacion: ['datos', 'certificado', 'autorizacion', 'verificacion'],
  produccion: ['datos', 'certificado', 'autorizacion', 'punto_de_venta', 'verificacion'],
};

/** Los pasos que el usuario marca como hechos en ARCA, que la app no puede ver por su cuenta. */
export type PasoEnArca = Extract<PasoDeAlta, 'autorizacion' | 'punto_de_venta'>;

export interface ProgresoDeAlta {
  readonly autorizacion: boolean;
  readonly puntoDeVenta: boolean;
  /** El punto de venta con el que la verificación salió bien. */
  readonly verificadoCon?: number;
}

export const PROGRESO_INICIAL: ProgresoDeAlta = { autorizacion: false, puntoDeVenta: false };

export interface SituacionDeAlta {
  readonly ambiente: Ambiente;
  /** El punto de venta de los datos del emisor. Sin valor, todavía no los cargó. */
  readonly puntoDeVenta?: number;
  readonly conCertificado: boolean;
  readonly progreso: ProgresoDeAlta;
}

export interface EstadoDePaso {
  readonly paso: PasoDeAlta;
  readonly hecho: boolean;
}

export interface EstadoDeAlta {
  readonly pasos: readonly EstadoDePaso[];
  /** El primer paso sin hacer, donde se retoma. Sin valor, ya se puede facturar. */
  readonly actual?: PasoDeAlta;
}

/**
 * Cada paso depende de los anteriores, así que se retoma en el primero sin hacer aunque haya
 * marcado alguno posterior. Una verificación exitosa prueba también los pasos hechos en ARCA, pero
 * deja de valer si cambia el punto de venta.
 */
export function estadoDeAlta({
  ambiente,
  puntoDeVenta,
  conCertificado,
  progreso,
}: SituacionDeAlta): EstadoDeAlta {
  const verificada =
    conCertificado && puntoDeVenta !== undefined && progreso.verificadoCon === puntoDeVenta;
  const hechos: Readonly<Record<PasoDeAlta, boolean>> = {
    datos: puntoDeVenta !== undefined,
    certificado: conCertificado,
    autorizacion: progreso.autorizacion || verificada,
    punto_de_venta: progreso.puntoDeVenta || verificada,
    verificacion: verificada,
  };
  const pasos = PASOS[ambiente].map((paso) => ({ paso, hecho: hechos[paso] }));
  const actual = pasos.find(({ hecho }) => !hecho)?.paso;
  return actual ? { pasos, actual } : { pasos };
}

export interface TitularDelAlta {
  readonly ambiente: Ambiente;
  readonly cuit: Cuit;
}

/**
 * Recuerda el avance de cada emisor y ambiente para retomar la guía donde quedó. No guarda nada
 * sensible, así que va en el almacén local; si se pierde, alcanza con marcar de nuevo los pasos.
 */
export interface RegistroDeAlta {
  leer(titular: TitularDelAlta): Promise<ProgresoDeAlta>;
  marcar(titular: TitularDelAlta, paso: PasoEnArca, hecho: boolean): Promise<void>;
  registrarVerificacion(titular: TitularDelAlta, puntoDeVenta: number): Promise<void>;
  /** Al cambiar el certificado, la verificación hecha con el anterior ya no vale. */
  olvidarVerificacion(titular: TitularDelAlta): Promise<void>;
}

/** Se cambia si cambia la forma de lo guardado, para no leer datos con el formato viejo. */
const VERSION = 'v1';

export function crearRegistroDeAlta(almacen: AlmacenLocal): RegistroDeAlta {
  const clave = ({ ambiente, cuit }: TitularDelAlta) => `alta.${VERSION}.${ambiente}.${cuit.valor}`;

  const leer = async (titular: TitularDelAlta): Promise<ProgresoDeAlta> => {
    const guardado = await almacen.leer(clave(titular)).catch(() => undefined);
    return guardado === undefined ? PROGRESO_INICIAL : interpretar(guardado);
  };

  // Las escrituras van en fila: dos marcas seguidas no se pisan.
  let fila: Promise<unknown> = Promise.resolve();
  const actualizar = (
    titular: TitularDelAlta,
    cambio: (progreso: ProgresoDeAlta) => ProgresoDeAlta,
  ) => {
    const tarea = fila.then(async () => {
      const nuevo = cambio(await leer(titular));
      await almacen.guardar(clave(titular), JSON.stringify(nuevo)).catch(() => undefined);
    });
    fila = tarea.catch(() => undefined);
    return tarea;
  };

  return {
    leer,
    marcar: (titular, paso, hecho) =>
      actualizar(titular, (progreso) =>
        paso === 'autorizacion'
          ? { ...progreso, autorizacion: hecho }
          : { ...progreso, puntoDeVenta: hecho },
      ),
    registrarVerificacion: (titular, puntoDeVenta) =>
      actualizar(titular, (progreso) => ({ ...progreso, verificadoCon: puntoDeVenta })),
    olvidarVerificacion: (titular) =>
      actualizar(titular, ({ autorizacion, puntoDeVenta }) => ({ autorizacion, puntoDeVenta })),
  };
}

/** Un dato ilegible equivale a no haber avanzado: se pierde poco y no se inventa un paso hecho. */
function interpretar(texto: string): ProgresoDeAlta {
  try {
    const guardado: unknown = JSON.parse(texto);
    if (typeof guardado !== 'object' || guardado === null) return PROGRESO_INICIAL;
    const { autorizacion, puntoDeVenta, verificadoCon } = guardado as Record<string, unknown>;
    return {
      autorizacion: autorizacion === true,
      puntoDeVenta: puntoDeVenta === true,
      ...(Number.isInteger(verificadoCon) && { verificadoCon: verificadoCon as number }),
    };
  } catch {
    return PROGRESO_INICIAL;
  }
}
