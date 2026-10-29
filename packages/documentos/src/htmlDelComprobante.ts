import {
  importeDe,
  type CondicionEmisor,
  type Comprobante,
  type Emisor,
  type Receptor,
} from '@facturador/dominio';

import { svgDelQr, urlDelQr } from './qrDeArca';
import { numeroDeComprobante } from './numeroDeComprobante';

export interface DatosDelDocumento {
  readonly comprobante: Comprobante;
  readonly emisor: Emisor;
  readonly receptor: Receptor;
  readonly puntoDeVenta: number;
  readonly numero: number;
  /** Lo emitido en homologación se marca como sin validez fiscal. */
  readonly deHomologacion: boolean;
  /** El logo del emisor: un PNG ya validado y vuelto a codificar por la app, en base64. */
  readonly logo?: string;
}

/** Solo caracteres de base64: lo que va dentro del atributo no puede cerrarlo. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const CONDICION_DEL_EMISOR: Readonly<Record<CondicionEmisor, string>> = {
  responsable_inscripto: 'IVA Responsable Inscripto',
  monotributo: 'Responsable Monotributo',
  exento: 'IVA Sujeto Exento',
};

/**
 * Sin scripts ni recursos externos: el documento solo puede usar sus propios estilos y las imágenes
 * que trae adentro, como el QR.
 */
const POLITICA_DE_CONTENIDO = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

/**
 * El comprobante como HTML para convertirlo en PDF. Todo dato que viene del usuario o de ARCA se
 * escapa antes de insertarse.
 */
export function htmlDelComprobante(documento: DatosDelDocumento): string {
  const { comprobante, emisor, puntoDeVenta, numero, deHomologacion, logo } = documento;
  const { tipo, fechaDeEmision } = comprobante.datos;
  const { autorizacion } = comprobante;
  if (!autorizacion) throw new Error('El documento solo se arma para un comprobante autorizado');

  const numeroCompleto = numeroDeComprobante(puntoDeVenta, numero);
  const qr = svgDelQr(
    urlDelQr({ comprobante, cuitEmisor: emisor.datos.cuit, puntoDeVenta, numero }),
    120,
  );

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLITICA_DE_CONTENIDO}">
<title>${escapar(tipo.descripcion)} ${numeroCompleto}</title>
<style>${ESTILOS}</style>
</head>
<body>
${deHomologacion ? '<p class="prueba">Homologación: comprobante de prueba, sin validez fiscal</p>' : ''}
<header>
  <section class="emisor">
    ${logo !== undefined && BASE64.test(logo) ? `<img class="logo" src="data:image/png;base64,${logo}" alt="">` : ''}
    <h1>${escapar(emisor.datos.razonSocial)}</h1>
    <p>${escapar(emisor.datos.domicilio)}</p>
    <p>${escapar(CONDICION_DEL_EMISOR[emisor.datos.condicion])}</p>
  </section>
  <section class="letra">
    <strong>${escapar(tipo.clase)}</strong>
    <span>Cód. ${String(tipo.codigoArca).padStart(3, '0')}</span>
  </section>
  <section class="numeracion">
    <h2>${escapar(tipo.nombre)}</h2>
    <p>Punto de venta y número: <b class="sin-corte">${numeroCompleto}</b></p>
    <p>Fecha de emisión: ${escapar(fechaDeEmision.formatear())}</p>
    <p>CUIT: ${escapar(emisor.datos.cuit.formateado())}</p>
    ${emisor.datos.ingresosBrutos ? `<p>Ingresos Brutos: ${escapar(emisor.datos.ingresosBrutos)}</p>` : ''}
    <p>Inicio de actividades: ${escapar(emisor.datos.inicioDeActividades.formatear())}</p>
  </section>
</header>
${seccionDelReceptor(documento.receptor)}
${seccionDelAsociado(comprobante)}
${tablaDeItems(comprobante)}
${bloqueDeTotales(comprobante)}
<footer>
  <div class="qr">${qr}</div>
  <div>
    <p>CAE: <b>${escapar(autorizacion.cae)}</b></p>
    <p>Vencimiento del CAE: ${escapar(autorizacion.vencimiento.formatear())}</p>
    <p class="nota">Comprobante autorizado por ARCA</p>
  </div>
</footer>
</body>
</html>
`;
}

/** Los cinco caracteres con significado en HTML, tanto en texto como en atributos. */
export function escapar(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function seccionDelReceptor({ identificacion, condicion, nombre, domicilio }: Receptor): string {
  const documento =
    identificacion.tipo === 'cuit'
      ? `<p>CUIT: ${escapar(identificacion.cuit.formateado())}</p>`
      : identificacion.tipo === 'dni'
        ? `<p>DNI: ${escapar(identificacion.dni.valor)}</p>`
        : '';
  return `<section class="receptor">
  ${nombre ? `<p>Razón social: ${escapar(nombre)}</p>` : ''}
  ${documento}
  ${domicilio ? `<p>Domicilio: ${escapar(domicilio)}</p>` : ''}
  <p>Condición frente al IVA: ${escapar(condicion.descripcion)}</p>
</section>`;
}

/** La factura que ajusta una nota de crédito o de débito. */
function seccionDelAsociado({ datos: { asociado } }: Comprobante): string {
  if (!asociado) return '';
  const numero = numeroDeComprobante(asociado.puntoDeVenta, asociado.numero);
  return `<section class="asociado">
  <p>Comprobante asociado: <b class="sin-corte">${escapar(asociado.tipo.descripcion)} ${numero}</b> del ${escapar(asociado.fechaDeEmision.formatear())}</p>
</section>`;
}

function tablaDeItems(comprobante: Comprobante): string {
  const { tipo, items, modoDePrecio } = comprobante.datos;
  // Las líneas se muestran como se cargaron; el encabezado aclara si incluyen IVA.
  const aclaracion = tipo.informaIva() ? (modoDePrecio === 'final' ? ' con IVA' : ' sin IVA') : '';
  const conAlicuota = tipo.discriminaIva();

  const filas = items
    .map(
      (item) => `<tr>
    <td>${escapar(item.descripcion)}</td>
    <td class="numero">${escapar(item.cantidad.formatear())}</td>
    <td class="numero">${escapar(item.precioUnitario.formatear())}</td>
    ${conAlicuota ? `<td class="numero">${escapar(item.alicuota?.formatear() ?? '')}</td>` : ''}
    <td class="numero">${escapar(importeDe(item).formatear())}</td>
  </tr>`,
    )
    .join('\n');

  return `<table class="items">
  <thead><tr>
    <th>Descripción</th><th class="numero">Cantidad</th><th class="numero">Precio unitario${aclaracion}</th>
    ${conAlicuota ? '<th class="numero">IVA</th>' : ''}<th class="numero">Subtotal${aclaracion}</th>
  </tr></thead>
  <tbody>
  ${filas}
  </tbody>
</table>`;
}

function bloqueDeTotales(comprobante: Comprobante): string {
  const { tipo } = comprobante.datos;
  const { totales } = comprobante;
  const lineas: [string, string][] = [];

  if (tipo.discriminaIva()) {
    for (const { alicuota, neto, iva } of totales.porAlicuota) {
      lineas.push([`Neto gravado al ${alicuota.formatear()}`, neto.formatear()]);
      lineas.push([`IVA ${alicuota.formatear()}`, iva.formatear()]);
    }
  }
  lineas.push(['Total', totales.total.formatear()]);

  // Ley 27.743, Régimen de Transparencia Fiscal al Consumidor: la factura B informa el IVA contenido.
  const transparencia =
    tipo.clase === 'B'
      ? `<p class="nota">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743): IVA contenido ${escapar(totales.iva.formatear())}</p>`
      : '';

  return `<section class="totales">
  <table>${lineas
    .map(
      ([etiqueta, importe]) =>
        `<tr><td>${escapar(etiqueta)}</td><td class="numero">${escapar(importe)}</td></tr>`,
    )
    .join('')}</table>
  ${transparencia}
</section>`;
}

const ESTILOS = `
  @page { size: A4; margin: 16mm; }
  body { font-family: sans-serif; font-size: 11pt; color: #111; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 4pt; }
  h2 { font-size: 15pt; margin: 0 0 4pt; text-transform: uppercase; }
  p { margin: 2pt 0; }
  .prueba { border: 1px solid #b00; color: #b00; text-align: center; padding: 4pt; font-weight: bold; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border: 1px solid #111; padding: 8pt; gap: 8pt; }
  header section { flex: 1; }
  .logo { display: block; max-width: 45mm; max-height: 20mm; margin-bottom: 4pt; }
  .letra { flex: 0 0 auto; text-align: center; border: 1px solid #111; padding: 4pt 10pt; }
  .letra strong { display: block; font-size: 28pt; line-height: 1; }
  .letra span { font-size: 8pt; }
  .receptor, .asociado { border: 1px solid #111; border-top: 0; padding: 8pt; }
  table { width: 100%; border-collapse: collapse; }
  .items { margin-top: 12pt; }
  .items th { border-bottom: 1px solid #111; text-align: left; padding: 4pt; font-size: 9pt; }
  .items td { padding: 4pt; border-bottom: 1px solid #ddd; vertical-align: top; }
  .numero { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totales { margin-top: 12pt; margin-left: auto; width: 50%; }
  .totales td { padding: 3pt 4pt; }
  .totales tr:last-child td { font-weight: bold; font-size: 13pt; border-top: 1px solid #111; }
  .nota { font-size: 8pt; color: #444; }
  .sin-corte { white-space: nowrap; }
  footer { display: flex; align-items: center; gap: 12pt; margin-top: 20pt; border-top: 1px solid #111; padding-top: 8pt; }
`;
