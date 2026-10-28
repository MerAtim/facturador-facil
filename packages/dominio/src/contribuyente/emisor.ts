import type { FechaCalendario } from '../compartido/fechaCalendario';
import { exito, fallo, type Resultado } from '../compartido/resultado';
import type { CondicionEmisor } from '../comprobantes/tipoComprobante';
import type { Cuit } from './cuit';

export interface DatosEmisor {
  readonly razonSocial: string;
  readonly cuit: Cuit;
  readonly condicion: CondicionEmisor;
  readonly domicilio: string;
  readonly inicioDeActividades: FechaCalendario;
  /** El que se usa salvo que se elija otro. Se habilita en ARCA para facturar por web service. */
  readonly puntoDeVenta: number;
  /**
   * Inscripción en Ingresos Brutos, como la escribe el emisor: un número, "Exento" o
   * "Convenio Multilateral 901-123456-7". La exigen las provincias, no ARCA; es opcional para que
   * una configuración guardada antes de pedirla siga siendo válida.
   */
  readonly ingresosBrutos?: string;
}

export type MotivoEmisorInvalido =
  | 'razon_social_vacia'
  | 'razon_social_larga'
  | 'domicilio_vacio'
  | 'domicilio_largo'
  | 'punto_de_venta_invalido'
  | 'ingresos_brutos_invalido';

export interface EmisorInvalido {
  readonly tipo: 'emisor_invalido';
  readonly motivos: readonly MotivoEmisorInvalido[];
}

export const LARGO_MAXIMO_RAZON_SOCIAL = 100;
export const LARGO_MAXIMO_DOMICILIO = 150;
export const LARGO_MAXIMO_INGRESOS_BRUTOS = 40;
const FORMATO_INGRESOS_BRUTOS = /^[\p{L}\d .\-/]+$/u;
const PUNTO_DE_VENTA_MAXIMO = 99_999;

/** Quien emite los comprobantes. Sus datos se imprimen en cada uno. */
export class Emisor {
  private constructor(readonly datos: DatosEmisor) {}

  /** Valida todo junto, para mostrar de una vez cada campo que hay que corregir. */
  static crear(datos: DatosEmisor): Resultado<Emisor, EmisorInvalido> {
    const motivos = validarDatosDelEmisor(datos);
    if (motivos.length > 0) return fallo({ tipo: 'emisor_invalido', motivos });
    return exito(
      new Emisor({
        ...datos,
        razonSocial: limpiar(datos.razonSocial),
        domicilio: limpiar(datos.domicilio),
        ...(datos.ingresosBrutos === undefined
          ? {}
          : { ingresosBrutos: limpiar(datos.ingresosBrutos) }),
      }),
    );
  }
}

/**
 * Los problemas de los datos escritos a mano. Sirve para marcarlos en pantalla aunque el CUIT o la
 * fecha todavía no sean válidos.
 */
export function validarDatosDelEmisor(
  datos: Pick<DatosEmisor, 'razonSocial' | 'domicilio' | 'puntoDeVenta' | 'ingresosBrutos'>,
): readonly MotivoEmisorInvalido[] {
  const razonSocial = limpiar(datos.razonSocial);
  const domicilio = limpiar(datos.domicilio);
  const motivos: MotivoEmisorInvalido[] = [];

  if (razonSocial === '') motivos.push('razon_social_vacia');
  if (razonSocial.length > LARGO_MAXIMO_RAZON_SOCIAL) motivos.push('razon_social_larga');
  if (domicilio === '') motivos.push('domicilio_vacio');
  if (domicilio.length > LARGO_MAXIMO_DOMICILIO) motivos.push('domicilio_largo');
  if (
    !Number.isInteger(datos.puntoDeVenta) ||
    datos.puntoDeVenta < 1 ||
    datos.puntoDeVenta > PUNTO_DE_VENTA_MAXIMO
  ) {
    motivos.push('punto_de_venta_invalido');
  }
  if (datos.ingresosBrutos !== undefined) {
    const ingresosBrutos = limpiar(datos.ingresosBrutos);
    if (
      ingresosBrutos.length > LARGO_MAXIMO_INGRESOS_BRUTOS ||
      !FORMATO_INGRESOS_BRUTOS.test(ingresosBrutos)
    ) {
      motivos.push('ingresos_brutos_invalido');
    }
  }
  return motivos;
}

/** Sin espacios de más ni caracteres de control: estos textos van al PDF y a la pantalla. */
function limpiar(texto: string): string {
  return texto
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
