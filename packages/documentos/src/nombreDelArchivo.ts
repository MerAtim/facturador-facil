import type { ClaseComprobante } from '@facturador/dominio';

const LARGO_MAXIMO_DEL_NOMBRE = 40;

/**
 * Nombre descriptivo para el PDF: `factura-B-00002-00000015-ferreteria-sur.pdf`. El nombre del
 * receptor lo escribió el usuario, así que se reduce a letras, números y guiones: sin separadores de
 * ruta ni nada que el sistema de archivos interprete.
 */
export function nombreDelArchivo(datos: {
  readonly clase: ClaseComprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
  readonly receptor?: string | undefined;
}): string {
  const numero = `${String(datos.puntoDeVenta).padStart(5, '0')}-${String(datos.numero).padStart(8, '0')}`;
  const receptor = datos.receptor ? sanear(datos.receptor) : '';
  return `factura-${datos.clase}-${numero}${receptor ? `-${receptor}` : ''}.pdf`;
}

function sanear(texto: string): string {
  // Los separadores ya quedan colapsados en un solo guion: alcanza con sacarlo de las puntas.
  const guiones = texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, LARGO_MAXIMO_DEL_NOMBRE);
  const desde = guiones.startsWith('-') ? 1 : 0;
  const hasta = guiones.endsWith('-') ? guiones.length - 1 : guiones.length;
  return guiones.slice(desde, Math.max(desde, hasta));
}
