import type { CondicionEmisor, Cuit } from '@facturador/dominio';

import type { Ambiente } from '../configuracion/configuracion';

/** En ARCA el sistema del punto de venta depende de la condición frente al IVA. */
export const SISTEMA_DEL_PUNTO_DE_VENTA: Readonly<Record<CondicionEmisor, string>> = {
  monotributo: 'Factura Electrónica - Monotributo - Web Services',
  responsable_inscripto: 'RECE para aplicativo y web services',
  exento: 'RECE para aplicativo y web services',
};

export interface DatosParaElContador {
  readonly ambiente: Ambiente;
  readonly razonSocial: string;
  readonly cuit: Cuit;
  readonly condicion: CondicionEmisor;
  readonly puntoDeVenta: number;
  /** El alias que se sugiere para el certificado en ARCA. */
  readonly alias: string;
}

/**
 * Las instrucciones para que el contador haga la visita a ARCA en lugar del emisor. Van en un
 * mensaje común: el pedido viaja aparte, como archivo, y el contador devuelve el certificado.
 * Nada de esto es secreto: la clave del certificado nunca sale del teléfono.
 */
export function mensajeParaElContador({
  ambiente,
  razonSocial,
  cuit,
  condicion,
  puntoDeVenta,
  alias,
}: DatosParaElContador): string {
  const titular = `${razonSocial}, CUIT ${cuit.formateado()}`;
  const pasos =
    ambiente === 'homologacion'
      ? [
          `1. En "WSASS - Autogestión Certificados Homologación", crear un certificado nuevo con el nombre "${alias}" y pegar el pedido que te mando aparte.`,
          `2. En WSASS, crear una autorización a servicio para "${alias}", CUIT representada ${cuit.valor}, servicio wsfe.`,
          '3. Mandarme el certificado que muestra WSASS.',
        ]
      : [
          `1. En "Administración de puntos de venta y domicilios", crear el punto de venta ${String(puntoDeVenta)} con el sistema "${SISTEMA_DEL_PUNTO_DE_VENTA[condicion]}".`,
          `2. En "Administración de Certificados Digitales", agregar el alias "${alias}" con el pedido que te mando aparte y descargar el certificado.`,
          `3. En el "Administrador de Relaciones de Clave Fiscal", crear una relación con ARCA › WebServices › Facturación Electrónica para el computador fiscal "${alias}".`,
          '4. Mandarme el archivo del certificado.',
        ];
  return [
    `Hola. Necesito conectar mi app de facturación con ARCA (${ambiente === 'homologacion' ? 'homologación' : 'producción'}) para ${titular}. ¿Me ayudás con estos pasos en el sitio de ARCA?`,
    '',
    ...pasos,
    '',
    'El certificado solo funciona en mi teléfono: la clave que lo acompaña se creó ahí y no se puede copiar.',
  ].join('\n');
}
