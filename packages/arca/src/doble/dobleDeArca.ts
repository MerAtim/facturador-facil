import { FechaCalendario } from '@facturador/dominio';

import { URLS } from '../ambiente';
import type { RespuestaHttp, Transporte } from '../soap/transporte';
import { buscar, escaparXml, leerXml, type ElementoXml } from '../soap/xml';
import { ESPACIO_DE_NOMBRES } from '../wsfe/comun';

/** Lo que dura un ticket de WSAA real. */
const DURACION_DEL_TICKET_MS = 12 * 60 * 60 * 1000;
const DIAS_DE_VIGENCIA_DEL_CAE = 10;
const SIN_RESULTADOS = 602;

interface Autorizado {
  readonly puntoDeVenta: number;
  readonly tipo: number;
  readonly numero: number;
  readonly detalle: ElementoXml;
  readonly cae: string;
  readonly vencimiento: string;
}

/**
 * ARCA de homologación simulado, para las pruebas de punta a punta: da tickets a cualquier firma,
 * numera correlativo por punto de venta y tipo, y autoriza todo comprobante. Responde con la misma
 * forma que los servicios reales, así la app lo usa sin saberlo.
 *
 * Nunca forma parte de un build que se publica: ver apps/mobile/src/composicion.ts.
 */
export function crearDobleDeArca({ ahora = () => new Date() } = {}): Transporte {
  const autorizados: Autorizado[] = [];
  const { wsaa, wsfe } = URLS.homologacion;

  const ultimo = (puntoDeVenta: number, tipo: number) =>
    autorizados
      .filter((a) => a.puntoDeVenta === puntoDeVenta && a.tipo === tipo)
      .reduce((mayor, a) => Math.max(mayor, a.numero), 0);

  const wsfePorMetodo: Readonly<Record<string, (pedido: ElementoXml) => string>> = {
    FEDummy: () => '<AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>',
    // Homologación no suele informar puntos de venta.
    FEParamGetPtosVenta: () => sinResultados('FEParamGetPtosVenta'),
    FECompUltimoAutorizado(pedido) {
      const puntoDeVenta = entero(pedido, 'PtoVta');
      const tipo = entero(pedido, 'CbteTipo');
      return (
        campo('PtoVta', puntoDeVenta) +
        campo('CbteTipo', tipo) +
        campo('CbteNro', ultimo(puntoDeVenta, tipo))
      );
    },
    FECAESolicitar(pedido) {
      const cabecera = buscar(pedido, 'FeCAEReq', 'FeCabReq');
      const detalle = buscar(pedido, 'FeCAEReq', 'FeDetReq', 'FECAEDetRequest');
      if (!cabecera || !detalle) throw new Error('FECAESolicitar sin cabecera o detalle');

      const puntoDeVenta = entero(cabecera, 'PtoVta');
      const tipo = entero(cabecera, 'CbteTipo');
      const numero = entero(detalle, 'CbteDesde');
      const cabeceraDeRespuesta =
        campo('PtoVta', puntoDeVenta) + campo('CbteTipo', tipo) + campo('Resultado', 'A');

      if (numero !== ultimo(puntoDeVenta, tipo) + 1) {
        return (
          `<FeCabResp>${cabeceraDeRespuesta.replace('>A<', '>R<')}</FeCabResp>` +
          '<FeDetResp><FECAEDetResponse>' +
          campo('CbteDesde', numero) +
          campo('CbteHasta', numero) +
          campo('Resultado', 'R') +
          '<Observaciones><Obs><Code>10016</Code><Msg>El número no es el próximo a autorizar</Msg></Obs></Observaciones>' +
          '</FECAEDetResponse></FeDetResp>'
        );
      }

      const autorizado: Autorizado = {
        puntoDeVenta,
        tipo,
        numero,
        detalle,
        cae: String(70_000_000_000_000 + autorizados.length + 1),
        vencimiento: FechaCalendario.enArgentina(ahora())
          .sumarDias(DIAS_DE_VIGENCIA_DEL_CAE)
          .aTextoArca(),
      };
      autorizados.push(autorizado);
      return (
        `<FeCabResp>${cabeceraDeRespuesta}</FeCabResp>` +
        '<FeDetResp><FECAEDetResponse>' +
        campo('CbteDesde', numero) +
        campo('CbteHasta', numero) +
        campo('Resultado', 'A') +
        campo('CAE', autorizado.cae) +
        campo('CAEFchVto', autorizado.vencimiento) +
        '</FECAEDetResponse></FeDetResp>'
      );
    },
    FECompConsultar(pedido) {
      const consulta = buscar(pedido, 'FeCompConsReq');
      if (!consulta) throw new Error('FECompConsultar sin consulta');
      const encontrado = autorizados.find(
        (a) =>
          a.puntoDeVenta === entero(consulta, 'PtoVta') &&
          a.tipo === entero(consulta, 'CbteTipo') &&
          a.numero === entero(consulta, 'CbteNro'),
      );
      if (!encontrado) return sinResultados('FECompConsultar');

      const { detalle } = encontrado;
      const copiar = (nombre: string) => campo(nombre, buscar(detalle, nombre)?.texto ?? '');
      return (
        '<ResultGet>' +
        campo('PtoVta', encontrado.puntoDeVenta) +
        campo('CbteTipo', encontrado.tipo) +
        ['Concepto', 'DocTipo', 'DocNro', 'CbteDesde', 'CbteHasta', 'CbteFch', 'ImpTotal']
          .map(copiar)
          .join('') +
        campo('Resultado', 'A') +
        campo('CodAutorizacion', encontrado.cae) +
        campo('FchVto', encontrado.vencimiento) +
        '</ResultGet>'
      );
    },
  };

  function ticket(): string {
    const vencimiento = new Date(ahora().getTime() + DURACION_DEL_TICKET_MS).toISOString();
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0">' +
      `<header><expirationTime>${vencimiento}</expirationTime></header>` +
      '<credentials><token>VE9LRU4=</token><sign>RklSTUE=</sign></credentials>' +
      '</loginTicketResponse>';
    return sobre(
      '<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
        `<loginCmsReturn>${escaparXml(xml)}</loginCmsReturn></loginCmsResponse>`,
    );
  }

  return (url, { cuerpo }) => {
    const pedido = leerXml(cuerpo);
    if (!pedido.ok) return Promise.resolve(error(400));
    const metodo = buscar(pedido.valor, 'Body')?.hijos[0];
    if (!metodo) return Promise.resolve(error(400));

    if (url === wsaa && metodo.nombre === 'loginCms') return Promise.resolve(ok(ticket()));

    const responder = url === wsfe ? wsfePorMetodo[metodo.nombre] : undefined;
    if (!responder) return Promise.resolve(error(404));
    const resultado = responder(metodo);
    return Promise.resolve(
      ok(
        sobre(
          `<${metodo.nombre}Response xmlns="${ESPACIO_DE_NOMBRES}">` +
            `<${metodo.nombre}Result>${resultado}</${metodo.nombre}Result>` +
            `</${metodo.nombre}Response>`,
        ),
      ),
    );
  };
}

const sobre = (cuerpo: string) =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;

const ok = (cuerpo: string): RespuestaHttp => ({ estado: 200, cuerpo });
const error = (estado: number): RespuestaHttp => ({ estado, cuerpo: '' });

const campo = (nombre: string, valor: string | number) =>
  `<${nombre}>${escaparXml(String(valor))}</${nombre}>`;

const sinResultados = (metodo: string) =>
  `<Errors><Err><Code>${String(SIN_RESULTADOS)}</Code><Msg>Sin Resultados: - Metodo ${metodo}</Msg></Err></Errors>`;

function entero(elemento: ElementoXml, nombre: string): number {
  return Number(buscar(elemento, nombre)?.texto ?? Number.NaN);
}
