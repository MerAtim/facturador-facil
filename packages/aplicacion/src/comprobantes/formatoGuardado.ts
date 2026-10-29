import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  Dni,
  Emisor,
  FechaCalendario,
  TipoComprobante,
  type ComprobanteAsociado,
  type CondicionEmisor,
  type Concepto,
  type IdentificacionReceptor,
  type ItemComprobante,
  type ModoDePrecio,
  type PeriodoDeServicio,
  type Receptor,
} from '@facturador/dominio';

/**
 * El formato de la columna `datos`: solo tipos simples, para que un cambio de clase no lo rompa.
 * Cada versión que se publica se sigue leyendo para siempre.
 *
 * - 1: el comprobante y el receptor.
 * - 2: suma los datos del emisor al momento de emitir, para rehacer el PDF tal como salió.
 * - 3: suma la factura que ajusta una nota de crédito o de débito.
 */
const VERSION = 3;
const VERSIONES_LEGIBLES: readonly number[] = [1, 2, 3];
const MODOS_DE_PRECIO: readonly ModoDePrecio[] = ['final', 'neto'];
const CONCEPTOS: readonly Concepto[] = ['productos', 'servicios', 'productos_y_servicios'];
const CONDICIONES: readonly CondicionEmisor[] = ['responsable_inscripto', 'monotributo', 'exento'];

interface Guardado {
  readonly version: number;
  readonly tipo: number;
  readonly modoDePrecio: string;
  readonly concepto: string;
  readonly fechaDeEmision: string;
  readonly periodoDeServicio?: {
    readonly desde: string;
    readonly hasta: string;
    readonly vencimientoDePago: string;
  };
  readonly items: readonly {
    readonly descripcion: string;
    readonly cantidadEnMilesimas: number;
    readonly precioUnitarioEnCentavos: number;
    readonly alicuota?: number;
  }[];
  readonly receptor: {
    readonly condicion: number;
    readonly cuit?: string;
    readonly dni?: string;
    readonly nombre?: string;
    readonly domicilio?: string;
  };
  /** Desde la versión 2. */
  readonly emisor?: {
    readonly razonSocial: string;
    readonly cuit: string;
    readonly condicion: string;
    readonly domicilio: string;
    readonly inicioDeActividades: string;
    readonly puntoDeVenta: number;
    readonly ingresosBrutos?: string;
  };
  /** Desde la versión 3, solo en las notas. */
  readonly asociado?: {
    readonly tipo: number;
    readonly puntoDeVenta: number;
    readonly numero: number;
    readonly fechaDeEmision: string;
  };
  readonly cae: string;
  readonly vencimientoDelCae: string;
}

export interface Rearmado {
  readonly comprobante: Comprobante;
  readonly receptor: Receptor;
  readonly emisor: Emisor;
}

export function aTextoGuardado({ comprobante, receptor, emisor }: Rearmado): string {
  const { datos, autorizacion } = comprobante;
  const { identificacion, nombre, domicilio } = receptor;
  const { periodoDeServicio: periodo, asociado } = datos;
  const delEmisor = emisor.datos;
  const guardado: Guardado = {
    version: VERSION,
    tipo: datos.tipo.codigoArca,
    modoDePrecio: datos.modoDePrecio,
    concepto: datos.concepto,
    fechaDeEmision: datos.fechaDeEmision.aTextoArca(),
    ...(periodo && {
      periodoDeServicio: {
        desde: periodo.desde.aTextoArca(),
        hasta: periodo.hasta.aTextoArca(),
        vencimientoDePago: periodo.vencimientoDePago.aTextoArca(),
      },
    }),
    items: datos.items.map((item) => ({
      descripcion: item.descripcion,
      cantidadEnMilesimas: item.cantidad.milesimas,
      precioUnitarioEnCentavos: item.precioUnitario.centavos,
      ...(item.alicuota && { alicuota: item.alicuota.codigoArca }),
    })),
    receptor: {
      condicion: receptor.condicion.codigoArca,
      ...(identificacion.tipo === 'cuit' && { cuit: identificacion.cuit.valor }),
      ...(identificacion.tipo === 'dni' && { dni: identificacion.dni.valor }),
      ...(nombre !== undefined && { nombre }),
      ...(domicilio !== undefined && { domicilio }),
    },
    emisor: {
      razonSocial: delEmisor.razonSocial,
      cuit: delEmisor.cuit.valor,
      condicion: delEmisor.condicion,
      domicilio: delEmisor.domicilio,
      inicioDeActividades: delEmisor.inicioDeActividades.aTextoArca(),
      puntoDeVenta: delEmisor.puntoDeVenta,
      ...(delEmisor.ingresosBrutos !== undefined && { ingresosBrutos: delEmisor.ingresosBrutos }),
    },
    ...(asociado && {
      asociado: {
        tipo: asociado.tipo.codigoArca,
        puntoDeVenta: asociado.puntoDeVenta,
        numero: asociado.numero,
        fechaDeEmision: asociado.fechaDeEmision.aTextoArca(),
      },
    }),
    cae: autorizacion?.cae ?? '',
    vencimientoDelCae: autorizacion?.vencimiento.aTextoArca() ?? '',
  };
  return JSON.stringify(guardado);
}

/**
 * Rearma lo guardado con las mismas validaciones del dominio que al emitirlo. Los totales se
 * recalculan con las mismas reglas, así que coinciden con lo que se autorizó. Lo guardado se trata
 * como cualquier entrada: un dato dañado descarta el comprobante.
 *
 * Lo guardado antes de la versión 2 no tiene el emisor: se usa `emisorDeRespaldo`, el actual.
 */
export function desdeTextoGuardado(texto: string, emisorDeRespaldo: Emisor): Rearmado | undefined {
  try {
    const datos: unknown = JSON.parse(texto);
    return esGuardado(datos) ? rearmar(datos, emisorDeRespaldo) : undefined;
  } catch {
    return undefined;
  }
}

function esGuardado(valor: unknown): valor is Guardado {
  if (typeof valor !== 'object' || valor === null) return false;
  const { version, items, receptor } = valor as Record<string, unknown>;
  return (
    typeof version === 'number' &&
    VERSIONES_LEGIBLES.includes(version) &&
    Array.isArray(items) &&
    typeof receptor === 'object' &&
    receptor !== null
  );
}

/** Cada dato se vuelve a validar: lo que no tiene sentido descarta el comprobante entero. */
function rearmar(guardado: Guardado, emisorDeRespaldo: Emisor): Rearmado | undefined {
  const tipo = TipoComprobante.desdeCodigoArca(guardado.tipo);
  const modoDePrecio = MODOS_DE_PRECIO.find((modo) => modo === guardado.modoDePrecio);
  const concepto = CONCEPTOS.find((c) => c === guardado.concepto);
  const fechaDeEmision = fecha(guardado.fechaDeEmision);
  const vencimientoDelCae = fecha(guardado.vencimientoDelCae);
  const receptor = rearmarReceptor(guardado.receptor);
  const emisor = guardado.emisor ? rearmarEmisor(guardado.emisor) : emisorDeRespaldo;
  const items = guardado.items.map(rearmarItem);
  const periodo = guardado.periodoDeServicio;
  const periodoDeServicio = periodo && rearmarPeriodo(periodo);
  const asociado = guardado.asociado && rearmarAsociado(guardado.asociado);

  if (
    !tipo ||
    !modoDePrecio ||
    !concepto ||
    !fechaDeEmision ||
    !vencimientoDelCae ||
    !receptor ||
    !emisor ||
    !items.every((item) => item !== undefined) ||
    (periodo && !periodoDeServicio) ||
    (guardado.asociado && !asociado)
  ) {
    return undefined;
  }

  const creado = Comprobante.crear({
    tipo,
    receptor: receptor.condicion,
    identificacionReceptor: receptor.identificacion,
    modoDePrecio,
    items,
    fechaDeEmision,
    concepto,
    ...(periodoDeServicio && { periodoDeServicio }),
    ...(asociado && { asociado }),
  });
  const autorizado = creado.ok ? creado.valor.autorizar(guardado.cae, vencimientoDelCae) : creado;
  return autorizado.ok ? { comprobante: autorizado.valor, receptor, emisor } : undefined;
}

function rearmarEmisor(guardado: NonNullable<Guardado['emisor']>): Emisor | undefined {
  const cuit = Cuit.crear(guardado.cuit);
  const condicion = CONDICIONES.find((c) => c === guardado.condicion);
  const inicioDeActividades = fecha(guardado.inicioDeActividades);
  if (!cuit.ok || !condicion || !inicioDeActividades) return undefined;
  const emisor = Emisor.crear({
    razonSocial: guardado.razonSocial,
    cuit: cuit.valor,
    condicion,
    domicilio: guardado.domicilio,
    inicioDeActividades,
    puntoDeVenta: guardado.puntoDeVenta,
    ...(guardado.ingresosBrutos !== undefined && { ingresosBrutos: guardado.ingresosBrutos }),
  });
  return emisor.ok ? emisor.valor : undefined;
}

function rearmarPeriodo(
  guardado: NonNullable<Guardado['periodoDeServicio']>,
): PeriodoDeServicio | undefined {
  const desde = fecha(guardado.desde);
  const hasta = fecha(guardado.hasta);
  const vencimientoDePago = fecha(guardado.vencimientoDePago);
  return desde && hasta && vencimientoDePago ? { desde, hasta, vencimientoDePago } : undefined;
}

function rearmarAsociado(
  guardado: NonNullable<Guardado['asociado']>,
): ComprobanteAsociado | undefined {
  const tipo = TipoComprobante.desdeCodigoArca(guardado.tipo);
  const fechaDeEmision = fecha(guardado.fechaDeEmision);
  const { puntoDeVenta, numero } = guardado;
  const enteros = Number.isSafeInteger(puntoDeVenta) && Number.isSafeInteger(numero);
  return tipo && fechaDeEmision && enteros
    ? { tipo, puntoDeVenta, numero, fechaDeEmision }
    : undefined;
}

function rearmarItem(item: Guardado['items'][number]): ItemComprobante | undefined {
  const cantidad = Cantidad.desdeMilesimas(item.cantidadEnMilesimas);
  const precio = Dinero.desdeCentavos(item.precioUnitarioEnCentavos);
  const alicuota =
    item.alicuota === undefined ? undefined : AlicuotaIva.desdeCodigoArca(item.alicuota);
  if (
    typeof item.descripcion !== 'string' ||
    !cantidad.ok ||
    !precio.ok ||
    (item.alicuota !== undefined && !alicuota)
  ) {
    return undefined;
  }
  return {
    descripcion: item.descripcion,
    cantidad: cantidad.valor,
    precioUnitario: precio.valor,
    ...(alicuota && { alicuota }),
  };
}

function rearmarReceptor(guardado: Guardado['receptor']): Receptor | undefined {
  const condicion = CondicionIvaReceptor.desdeCodigoArca(guardado.condicion);
  const identificacion = rearmarIdentificacion(guardado);
  if (!condicion || !identificacion) return undefined;
  return {
    identificacion,
    condicion,
    ...(typeof guardado.nombre === 'string' && { nombre: guardado.nombre }),
    ...(typeof guardado.domicilio === 'string' && { domicilio: guardado.domicilio }),
  };
}

function rearmarIdentificacion(guardado: Guardado['receptor']): IdentificacionReceptor | undefined {
  if (guardado.cuit !== undefined) {
    const cuit = Cuit.crear(guardado.cuit);
    return cuit.ok ? { tipo: 'cuit', cuit: cuit.valor } : undefined;
  }
  if (guardado.dni !== undefined) {
    const dni = Dni.crear(guardado.dni);
    return dni.ok ? { tipo: 'dni', dni: dni.valor } : undefined;
  }
  return { tipo: 'sin_identificar' };
}

function fecha(texto: string): FechaCalendario | undefined {
  const resultado = FechaCalendario.desdeTextoArca(texto);
  return resultado.ok ? resultado.valor : undefined;
}
