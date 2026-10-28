import type { PasoDeAlta } from '@facturador/aplicacion';

import type { ErrorSoap } from './soap/soap';
import type { ErrorAutorizacion } from './wsfe/autorizadorWsfe';
import type { ErrorDeArca } from './wsfe/comun';
import type { ErrorParametros } from './wsfe/parametrosWsfe';
import type {
  FallaDeVerificacion,
  MotivoPuntoDeVentaNoHabilitado,
} from './wsfe/verificacionDelAlta';
import type { MotivoRechazoWsaa } from './wsaa/wsaa';

/** Lo que la pantalla puede ofrecer para salir del error. */
export type AccionSugerida =
  | 'reintentar'
  | 'reintentar_mas_tarde'
  | 'corregir_comprobante'
  | 'revisar_certificado'
  | 'revisar_punto_de_venta'
  | 'ajustar_reloj'
  | 'registrar_anterior'
  | 'contactar_soporte';

export interface MensajeDeError {
  readonly titulo: string;
  /** Un texto por motivo: un rechazo puede tener varios. */
  readonly detalles: readonly string[];
  readonly accion: AccionSugerida;
  /** Qué hacer, dicho para el usuario. */
  readonly sugerencia: string;
  /** Códigos originales de ARCA, para buscarlos o pasárselos a soporte. */
  readonly codigos: readonly string[];
}

interface Explicacion {
  readonly texto: string;
  readonly accion?: AccionSugerida;
}

/**
 * Códigos de WSFEv1 frecuentes. ARCA reutiliza un código para varias validaciones parecidas,
 * así que el texto describe la familia. Los textos se basan en respuestas reales de homologación.
 */
const CODIGOS_WSFE: Readonly<Record<number, Explicacion>> = {
  500: { texto: 'ARCA tuvo un problema interno.', accion: 'reintentar_mas_tarde' },
  501: { texto: 'ARCA tuvo un problema interno.', accion: 'reintentar_mas_tarde' },
  502: { texto: 'ARCA tuvo un problema interno.', accion: 'reintentar_mas_tarde' },
  600: { texto: 'ARCA no aceptó el acceso de la app.', accion: 'reintentar_mas_tarde' },
  601: {
    texto: 'El certificado no está autorizado a facturar con esta CUIT.',
    accion: 'revisar_certificado',
  },
  10013: { texto: 'Las facturas A necesitan el CUIT del receptor.' },
  10015: {
    texto:
      'Falta el documento del receptor o no es válido. A partir de cierto monto, ARCA exige ' +
      'identificar también al consumidor final.',
  },
  10016: {
    texto:
      'El número o la fecha no corresponden. La fecha no puede ser anterior a la del último ' +
      'comprobante emitido ni alejarse más de 5 días de hoy, o 10 si incluye servicios.',
  },
  10017: {
    texto: 'El CUIT del receptor no figura activo en el padrón de ARCA. Conviene verificarlo.',
  },
};

const SUGERENCIAS: Readonly<Record<AccionSugerida, string>> = {
  reintentar: 'Revisá la conexión y volvé a intentar.',
  reintentar_mas_tarde: 'Volvé a intentar en unos minutos.',
  corregir_comprobante: 'Corregí el comprobante y volvé a emitirlo.',
  revisar_certificado:
    'Revisá en el sitio de ARCA que el certificado esté vigente y asociado a la factura electrónica.',
  revisar_punto_de_venta:
    'Habilitá el punto de venta en ARCA para web service o cambiá el número en tus datos de emisor.',
  ajustar_reloj: 'Activá la fecha y hora automáticas del teléfono y volvé a intentar.',
  registrar_anterior: 'Guardá el comprobante anterior antes de emitir uno nuevo.',
  contactar_soporte: 'Si vuelve a pasar, escribinos con los códigos que figuran abajo.',
};

const MOTIVOS_WSAA: Readonly<Record<MotivoRechazoWsaa, Explicacion>> = {
  ticket_vigente: {
    texto: 'ARCA todavía tiene vigente un acceso anterior de esta app.',
    accion: 'reintentar_mas_tarde',
  },
  no_autorizado: {
    texto: 'El certificado no tiene permiso para la factura electrónica.',
    accion: 'revisar_certificado',
  },
  certificado_vencido: { texto: 'El certificado de ARCA venció.', accion: 'revisar_certificado' },
  certificado_no_confiable: {
    texto: 'ARCA no reconoce el certificado.',
    accion: 'revisar_certificado',
  },
  certificado_invalido: {
    texto: 'El certificado no es válido para ARCA.',
    accion: 'revisar_certificado',
  },
  firma_invalida: {
    texto: 'ARCA no pudo verificar la firma del pedido de acceso.',
    accion: 'revisar_certificado',
  },
  reloj_desfasado: {
    texto: 'La fecha u hora del teléfono no coincide con la de ARCA.',
    accion: 'ajustar_reloj',
  },
  no_disponible: {
    texto: 'El servicio de acceso de ARCA no está disponible.',
    accion: 'reintentar_mas_tarde',
  },
  desconocido: {
    texto: 'ARCA rechazó el pedido de acceso.',
    accion: 'contactar_soporte',
  },
};

/**
 * Traduce un error de la integración con ARCA a un mensaje para el usuario. Nunca incluye
 * trazas técnicas: los códigos van aparte, para soporte.
 */
export function explicarError(error: ErrorAutorizacion | ErrorParametros): MensajeDeError {
  switch (error.tipo) {
    case 'sin_conexion':
    case 'respuesta_inesperada':
    case 'xml_invalido':
    case 'falla_soap':
      return explicarFallaDeComunicacion(error);
    case 'ticket_ilegible':
      return mensaje(
        'No se pudo conectar con ARCA',
        'ARCA respondió algo que no esperábamos.',
        'reintentar_mas_tarde',
      );
    case 'rechazo_wsaa': {
      const { texto, accion = 'contactar_soporte' } = MOTIVOS_WSAA[error.motivo];
      return mensaje('ARCA no dio acceso a la app', texto, accion, [error.codigo]);
    }
    case 'rechazo_wsfe':
      return explicarCodigos('ARCA rechazó el pedido', error.errores, 'reintentar_mas_tarde');
    case 'comprobante_rechazado':
      return explicarCodigos(
        'ARCA rechazó el comprobante',
        [...error.observaciones, ...error.errores],
        'corregir_comprobante',
      );
    case 'comprobante_no_soportado':
      return error.motivo === 'ya_autorizado'
        ? mensaje(
            'El comprobante ya tiene CAE',
            'Este comprobante ya fue autorizado por ARCA.',
            'contactar_soporte',
          )
        : mensaje(
            'Falta el comprobante asociado',
            'Las notas de crédito y débito tienen que indicar la factura que ajustan.',
            'corregir_comprobante',
          );
    case 'resultado_incierto':
      return mensaje(
        'No sabemos si ARCA autorizó el comprobante',
        `Se envió el comprobante ${numeroCompleto(error.puntoDeVenta, error.numero)} pero no ` +
          'llegó la respuesta. No se va a emitir otro hasta confirmarlo, así no se duplica.',
        'reintentar',
      );
    case 'comprobante_anterior_autorizado': {
      const { anterior } = error;
      return mensaje(
        'El comprobante anterior sí se emitió',
        `ARCA autorizó el comprobante ${numeroCompleto(anterior.puntoDeVenta, anterior.numero)} ` +
          `del ${anterior.fechaDeEmision.formatear()} con el CAE ${anterior.cae}, aunque en su ` +
          'momento no llegó la respuesta.',
        'registrar_anterior',
      );
    }
    case 'almacen_no_disponible':
      return mensaje(
        'No se pudo guardar en el teléfono',
        'Para no duplicar comprobantes, la app guarda cada envío antes de hacerlo y ahora no puede.',
        'contactar_soporte',
      );
  }
}

/** Para ofrecer volver al paso de la guía donde se resuelve. */
export interface MensajeDeVerificacion extends MensajeDeError {
  readonly revisar?: PasoDeAlta;
}

const POR_QUE_NO_SIRVE: Readonly<Record<MotivoPuntoDeVentaNoHabilitado, string>> = {
  bloqueado: 'está bloqueado en ARCA',
  dado_de_baja: 'está dado de baja en ARCA',
  solo_caea: 'es para CAEA anticipado, y la app pide el CAE en el momento de emitir',
};

/** Qué impidió verificar el alta y en qué paso de la guía se arregla. */
export function explicarVerificacion(
  falla: FallaDeVerificacion,
  puntoDeVenta: number,
): MensajeDeVerificacion {
  const numero = String(puntoDeVenta);
  switch (falla.tipo) {
    case 'servicio_caido':
      return mensaje(
        'ARCA está con problemas',
        'Alguno de los servidores de la factura electrónica informa que no está funcionando.',
        'reintentar_mas_tarde',
      );
    case 'punto_de_venta_inexistente': {
      const detalle =
        falla.habilitados.length > 0
          ? `Los que tenés habilitados son: ${falla.habilitados.join(', ')}.`
          : 'Todavía no tenés ningún punto de venta habilitado para web service.';
      return {
        ...mensaje(
          `El punto de venta ${numero} no está habilitado para web service`,
          detalle,
          'revisar_punto_de_venta',
        ),
        revisar: 'punto_de_venta',
      };
    }
    case 'punto_de_venta_no_habilitado':
      return {
        ...mensaje(
          `El punto de venta ${numero} no sirve para facturar desde la app`,
          `El punto de venta ${POR_QUE_NO_SIRVE[falla.motivo]}.`,
          'revisar_punto_de_venta',
        ),
        revisar: 'punto_de_venta',
      };
    case 'error': {
      const explicado = explicarError(falla.error);
      const revisar = falla.etapa === 'acceso' ? pasoParaElAcceso(falla.error) : undefined;
      return revisar ? { ...explicado, revisar } : explicado;
    }
  }
}

/** Sin permiso falta la autorización; un certificado que ARCA no acepta hay que pedirlo de nuevo. */
function pasoParaElAcceso(error: ErrorAutorizacion | ErrorParametros): PasoDeAlta | undefined {
  if (error.tipo === 'rechazo_wsfe') return 'autorizacion';
  if (error.tipo !== 'rechazo_wsaa') return undefined;
  switch (error.motivo) {
    case 'no_autorizado':
      return 'autorizacion';
    case 'certificado_vencido':
    case 'certificado_no_confiable':
    case 'certificado_invalido':
    case 'firma_invalida':
      return 'certificado';
    case 'ticket_vigente':
    case 'reloj_desfasado':
    case 'no_disponible':
    case 'desconocido':
      return undefined;
  }
}

/** Para las observaciones de un comprobante aprobado: no impiden usarlo, pero conviene mostrarlas. */
export function explicarObservaciones(observaciones: readonly ErrorDeArca[]): readonly string[] {
  return observaciones.map(explicarCodigo);
}

function explicarFallaDeComunicacion(error: ErrorSoap): MensajeDeError {
  return error.tipo === 'sin_conexion'
    ? mensaje('Sin conexión con ARCA', 'No se pudo llegar a los servidores de ARCA.', 'reintentar')
    : mensaje(
        'No se pudo conectar con ARCA',
        'ARCA respondió algo que no esperábamos. Suele pasar cuando el servicio está con problemas.',
        'reintentar_mas_tarde',
      );
}

function explicarCodigos(
  titulo: string,
  errores: readonly ErrorDeArca[],
  accionPorDefecto: AccionSugerida,
): MensajeDeError {
  const accion =
    errores.map(({ codigo }) => CODIGOS_WSFE[codigo]?.accion).find(Boolean) ?? accionPorDefecto;
  return {
    titulo,
    detalles: errores.length > 0 ? errores.map(explicarCodigo) : ['ARCA no indicó el motivo.'],
    accion,
    sugerencia: SUGERENCIAS[accion],
    codigos: errores.map(({ codigo }) => String(codigo)),
  };
}

/** Un código conocido usa el catálogo; uno desconocido, el texto de ARCA sin la traza técnica. */
function explicarCodigo({ codigo, mensaje: texto }: ErrorDeArca): string {
  const conocido = CODIGOS_WSFE[codigo];
  if (conocido) return conocido.texto;
  const limpio = sinTraza(texto);
  return limpio === ''
    ? `ARCA informó el código ${String(codigo)}.`
    : `${limpio} (código ${String(codigo)})`;
}

const LONGITUD_MAXIMA = 200;
const LONGITUD_LEIDA = 1000;

const SIGNOS_DE_CIERRE = new Set([' ', '.', ':', ',', ';', '-']);

/** Quita espacios y signos sueltos del final, donde quedó cortada la traza. */
function sinCierre(texto: string): string {
  let fin = texto.length;
  while (fin > 0 && SIGNOS_DE_CIERRE.has(texto.charAt(fin - 1))) fin--;
  return texto.slice(0, fin).trim();
}

/** ARCA a veces agrega la excepción interna al mensaje: se corta ahí. */
function sinTraza(texto: string): string {
  // El texto viene de afuera: se acota antes de pasarlo por expresiones regulares.
  const [antes = ''] = texto.slice(0, LONGITUD_LEIDA).split(/excepci[oó]n|exception/i);
  const limpio = sinCierre(antes.replace(/\s+/g, ' '));
  if (limpio === '') return '';
  const conPunto = /[.!?)]$/.test(limpio) ? limpio : `${limpio}.`;
  return conPunto.length > LONGITUD_MAXIMA
    ? `${conPunto.slice(0, LONGITUD_MAXIMA - 1)}…`
    : conPunto;
}

/** Formato de los comprobantes impresos: punto de venta de 5 dígitos y número de 8. */
export const numeroCompleto = (puntoDeVenta: number, numero: number) =>
  `${String(puntoDeVenta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`;

function mensaje(
  titulo: string,
  detalle: string,
  accion: AccionSugerida,
  codigos: readonly string[] = [],
): MensajeDeError {
  return { titulo, detalles: [detalle], accion, sugerencia: SUGERENCIAS[accion], codigos };
}
