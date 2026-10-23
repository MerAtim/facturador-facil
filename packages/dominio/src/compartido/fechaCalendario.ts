import { exito, fallo, type Resultado } from './resultado';

export interface FechaInvalida {
  readonly tipo: 'fecha_invalida';
}

const MS_POR_DIA = 86_400_000;
const FORMATO_ARCA = /^(\d{4})(\d{2})(\d{2})$/;

/**
 * Argentina usa UTC−3 todo el año. Si volviera el horario de verano, este es el único lugar a cambiar.
 * Se usa un desplazamiento fijo y no la zona horaria del teléfono, que puede estar mal configurada.
 */
const DESPLAZAMIENTO_ARGENTINA_MS = -3 * 3_600_000;

/**
 * Día del calendario, sin hora ni zona horaria. Las fechas fiscales (emisión, servicio, vencimientos)
 * son días, no instantes: modelarlas así evita que una conversión a UTC las corra un día.
 */
export class FechaCalendario {
  private constructor(
    readonly anio: number,
    readonly mes: number,
    readonly dia: number,
  ) {}

  static crear(anio: number, mes: number, dia: number): Resultado<FechaCalendario, FechaInvalida> {
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    const existe =
      Number.isInteger(anio) &&
      anio >= 2000 &&
      anio <= 9999 &&
      fecha.getUTCFullYear() === anio &&
      fecha.getUTCMonth() === mes - 1 &&
      fecha.getUTCDate() === dia;

    return existe ? exito(new FechaCalendario(anio, mes, dia)) : fallo({ tipo: 'fecha_invalida' });
  }

  /** El día que corresponde a un instante en Argentina, sin importar la zona del dispositivo. */
  static enArgentina(instante: Date): FechaCalendario {
    const local = new Date(instante.getTime() + DESPLAZAMIENTO_ARGENTINA_MS);
    return new FechaCalendario(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  }

  /** Formato de WSFEv1: `AAAAMMDD`. */
  static desdeTextoArca(texto: string): Resultado<FechaCalendario, FechaInvalida> {
    const partes = FORMATO_ARCA.exec(texto);
    if (!partes) return fallo({ tipo: 'fecha_invalida' });
    return FechaCalendario.crear(Number(partes[1]), Number(partes[2]), Number(partes[3]));
  }

  aTextoArca(): string {
    return `${String(this.anio)}${dosDigitos(this.mes)}${dosDigitos(this.dia)}`;
  }

  /** Para mostrar: `dd/mm/aaaa` */
  formatear(): string {
    return `${dosDigitos(this.dia)}/${dosDigitos(this.mes)}/${String(this.anio)}`;
  }

  sumarDias(dias: number): FechaCalendario {
    const fecha = new Date(this.comoMilisegundosUtc() + dias * MS_POR_DIA);
    return new FechaCalendario(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
  }

  /** Días desde esta fecha hasta `otra`. Negativo si `otra` es anterior. */
  diasHasta(otra: FechaCalendario): number {
    return Math.round((otra.comoMilisegundosUtc() - this.comoMilisegundosUtc()) / MS_POR_DIA);
  }

  esAnteriorA(otra: FechaCalendario): boolean {
    return this.diasHasta(otra) > 0;
  }

  esIgualA(otra: FechaCalendario): boolean {
    return this.diasHasta(otra) === 0;
  }

  private comoMilisegundosUtc(): number {
    return Date.UTC(this.anio, this.mes - 1, this.dia);
  }
}

const dosDigitos = (valor: number) => String(valor).padStart(2, '0');
