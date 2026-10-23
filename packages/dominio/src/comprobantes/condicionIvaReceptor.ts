import type { ClaseComprobante, CondicionEmisor } from './tipoComprobante';

const ADMITE_A: readonly ClaseComprobante[] = ['A', 'C'];
const ADMITE_B: readonly ClaseComprobante[] = ['B', 'C'];

/**
 * Condición frente al IVA del receptor, obligatoria en WSFEv1 desde la RG 5616.
 * Códigos y clases admitidas según FEParamGetCondicionIvaReceptor.
 */
export class CondicionIvaReceptor {
  private constructor(
    readonly codigoArca: number,
    readonly descripcion: string,
    private readonly clasesAdmitidas: readonly ClaseComprobante[],
  ) {}

  static readonly RESPONSABLE_INSCRIPTO = new CondicionIvaReceptor(
    1,
    'IVA Responsable Inscripto',
    ADMITE_A,
  );
  static readonly EXENTO = new CondicionIvaReceptor(4, 'IVA Sujeto Exento', ADMITE_B);
  static readonly CONSUMIDOR_FINAL = new CondicionIvaReceptor(5, 'Consumidor Final', ADMITE_B);
  static readonly MONOTRIBUTO = new CondicionIvaReceptor(6, 'Responsable Monotributo', ADMITE_A);
  static readonly NO_CATEGORIZADO = new CondicionIvaReceptor(7, 'Sujeto No Categorizado', ADMITE_B);
  static readonly PROVEEDOR_DEL_EXTERIOR = new CondicionIvaReceptor(
    8,
    'Proveedor del Exterior',
    ADMITE_B,
  );
  static readonly CLIENTE_DEL_EXTERIOR = new CondicionIvaReceptor(
    9,
    'Cliente del Exterior',
    ADMITE_B,
  );
  static readonly IVA_LIBERADO = new CondicionIvaReceptor(10, 'IVA Liberado Ley 19.640', ADMITE_B);
  static readonly MONOTRIBUTO_SOCIAL = new CondicionIvaReceptor(
    13,
    'Monotributista Social',
    ADMITE_A,
  );
  static readonly IVA_NO_ALCANZADO = new CondicionIvaReceptor(15, 'IVA No Alcanzado', ADMITE_B);
  static readonly MONOTRIBUTO_PROMOVIDO = new CondicionIvaReceptor(
    16,
    'Monotributo Trabajador Independiente Promovido',
    ADMITE_A,
  );

  static readonly TODAS: readonly CondicionIvaReceptor[] = [
    CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
    CondicionIvaReceptor.EXENTO,
    CondicionIvaReceptor.CONSUMIDOR_FINAL,
    CondicionIvaReceptor.MONOTRIBUTO,
    CondicionIvaReceptor.NO_CATEGORIZADO,
    CondicionIvaReceptor.PROVEEDOR_DEL_EXTERIOR,
    CondicionIvaReceptor.CLIENTE_DEL_EXTERIOR,
    CondicionIvaReceptor.IVA_LIBERADO,
    CondicionIvaReceptor.MONOTRIBUTO_SOCIAL,
    CondicionIvaReceptor.IVA_NO_ALCANZADO,
    CondicionIvaReceptor.MONOTRIBUTO_PROMOVIDO,
  ];

  static desdeCodigoArca(codigo: number): CondicionIvaReceptor | undefined {
    return CondicionIvaReceptor.TODAS.find((condicion) => condicion.codigoArca === codigo);
  }

  admiteClase(clase: ClaseComprobante): boolean {
    return this.clasesAdmitidas.includes(clase);
  }
}

/**
 * Clase que corresponde emitir. Un responsable inscripto emite A a quien la admite y B al resto.
 * Monotributo y exento emiten siempre C.
 */
export function claseParaEmitir(
  emisor: CondicionEmisor,
  receptor: CondicionIvaReceptor,
): ClaseComprobante {
  if (emisor !== 'responsable_inscripto') return 'C';
  return receptor.admiteClase('A') ? 'A' : 'B';
}
