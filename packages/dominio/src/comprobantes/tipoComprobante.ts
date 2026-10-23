export type CondicionEmisor = 'responsable_inscripto' | 'monotributo' | 'exento';

export type ClaseComprobante = 'A' | 'B' | 'C';

export type Naturaleza = 'factura' | 'nota_de_debito' | 'nota_de_credito';

/** Tipos de comprobante de WSFEv1. El código es el que define ARCA en FEParamGetTiposCbte. */
export class TipoComprobante {
  private constructor(
    readonly codigoArca: number,
    readonly clase: ClaseComprobante,
    readonly naturaleza: Naturaleza,
  ) {}

  static readonly FACTURA_A = new TipoComprobante(1, 'A', 'factura');
  static readonly NOTA_DE_DEBITO_A = new TipoComprobante(2, 'A', 'nota_de_debito');
  static readonly NOTA_DE_CREDITO_A = new TipoComprobante(3, 'A', 'nota_de_credito');
  static readonly FACTURA_B = new TipoComprobante(6, 'B', 'factura');
  static readonly NOTA_DE_DEBITO_B = new TipoComprobante(7, 'B', 'nota_de_debito');
  static readonly NOTA_DE_CREDITO_B = new TipoComprobante(8, 'B', 'nota_de_credito');
  static readonly FACTURA_C = new TipoComprobante(11, 'C', 'factura');
  static readonly NOTA_DE_DEBITO_C = new TipoComprobante(12, 'C', 'nota_de_debito');
  static readonly NOTA_DE_CREDITO_C = new TipoComprobante(13, 'C', 'nota_de_credito');

  static readonly TODOS: readonly TipoComprobante[] = [
    TipoComprobante.FACTURA_A,
    TipoComprobante.NOTA_DE_DEBITO_A,
    TipoComprobante.NOTA_DE_CREDITO_A,
    TipoComprobante.FACTURA_B,
    TipoComprobante.NOTA_DE_DEBITO_B,
    TipoComprobante.NOTA_DE_CREDITO_B,
    TipoComprobante.FACTURA_C,
    TipoComprobante.NOTA_DE_DEBITO_C,
    TipoComprobante.NOTA_DE_CREDITO_C,
  ];

  static desdeCodigoArca(codigo: number): TipoComprobante | undefined {
    return TipoComprobante.TODOS.find((tipo) => tipo.codigoArca === codigo);
  }

  static de(clase: ClaseComprobante, naturaleza: Naturaleza): TipoComprobante {
    const tipo = TipoComprobante.TODOS.find(
      (t) => t.clase === clase && t.naturaleza === naturaleza,
    );
    if (!tipo) throw new Error(`No existe el tipo ${naturaleza} ${clase}`);
    return tipo;
  }

  /** Solo la clase A muestra el IVA discriminado en el comprobante impreso. */
  discriminaIva(): boolean {
    return this.clase === 'A';
  }

  /** A y B informan neto e IVA a ARCA, aunque la B no los muestre al cliente. La C no lleva IVA. */
  informaIva(): boolean {
    return this.clase !== 'C';
  }
}

export function clasesQuePuedeEmitir(condicion: CondicionEmisor): readonly ClaseComprobante[] {
  switch (condicion) {
    case 'responsable_inscripto':
      return ['A', 'B'];
    case 'monotributo':
    case 'exento':
      return ['C'];
  }
}
