/**
 * Alícuotas de IVA aceptadas por WSFEv1. El código es el que define ARCA en FEParamGetTiposIva.
 * El porcentaje se guarda en puntos básicos (2100 = 21 %) para operar siempre con enteros.
 */
export class AlicuotaIva {
  private constructor(
    readonly codigoArca: number,
    readonly puntosBasicos: number,
  ) {}

  static readonly CERO = new AlicuotaIva(3, 0);
  static readonly DOS_Y_MEDIO = new AlicuotaIva(9, 250);
  static readonly CINCO = new AlicuotaIva(8, 500);
  static readonly DIEZ_Y_MEDIO = new AlicuotaIva(4, 1050);
  static readonly VEINTIUNO = new AlicuotaIva(5, 2100);
  static readonly VEINTISIETE = new AlicuotaIva(6, 2700);

  static readonly TODAS: readonly AlicuotaIva[] = [
    AlicuotaIva.CERO,
    AlicuotaIva.DOS_Y_MEDIO,
    AlicuotaIva.CINCO,
    AlicuotaIva.DIEZ_Y_MEDIO,
    AlicuotaIva.VEINTIUNO,
    AlicuotaIva.VEINTISIETE,
  ];

  static desdeCodigoArca(codigo: number): AlicuotaIva | undefined {
    return AlicuotaIva.TODAS.find((alicuota) => alicuota.codigoArca === codigo);
  }

  /** Para mostrar: `21 %`, `10,5 %` */
  formatear(): string {
    return `${String(this.puntosBasicos / 100).replace('.', ',')} %`;
  }
}
