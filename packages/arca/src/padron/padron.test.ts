import { CondicionIvaReceptor, Cuit, exito, fallo } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { RespuestaHttp, SolicitudHttp, Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa } from '../wsaa/wsaa';
import { consultarPadron } from './padron';

const crearCuit = (valor: string) => {
  const resultado = Cuit.crear(valor);
  if (!resultado.ok) throw new Error(`CUIT de prueba inválido: ${valor}`);
  return resultado.valor;
};

const emisor = crearCuit('20123456786');
const consultado = crearCuit('30500010912');

const tickets: ProveedorDeTickets = {
  obtener: () =>
    Promise.resolve(exito({ token: 'T<1>', firma: 'F&2', vencimiento: new Date(2030, 0, 1) })),
  invalidar: () => Promise.resolve(),
};

const sobre = (cuerpo: string) =>
  '<?xml version="1.0" encoding="UTF-8"?><soap:Envelope ' +
  'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
  `${cuerpo}</soap:Body></soap:Envelope>`;

const persona = (contenido: string) =>
  sobre(
    '<ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/"><personaReturn>' +
      `${contenido}<metadata><fechaHora>2026-10-29T10:00:00-03:00</fechaHora></metadata>` +
      '</personaReturn></ns2:getPersona_v2Response>',
  );

interface Generales {
  readonly id?: string;
  readonly razonSocial?: string;
  readonly apellido?: string;
  readonly nombre?: string;
  readonly estado?: string;
  readonly domicilio?: string;
}

const generales = ({
  id = consultado.valor,
  razonSocial,
  apellido,
  nombre,
  estado = 'ACTIVO',
  domicilio = '<domicilioFiscal><direccion>AV CORRIENTES 1234</direccion>' +
    '<localidad>SAN NICOLAS</localidad><descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES' +
    '</descripcionProvincia><tipoDomicilio>FISCAL</tipoDomicilio></domicilioFiscal>',
}: Generales = {}) =>
  '<datosGenerales>' +
  (apellido ? `<apellido>${apellido}</apellido>` : '') +
  (nombre ? `<nombre>${nombre}</nombre>` : '') +
  (razonSocial ? `<razonSocial>${razonSocial}</razonSocial>` : '') +
  `${domicilio}<estadoClave>${estado}</estadoClave><idPersona>${id}</idPersona>` +
  '<tipoPersona>JURIDICA</tipoPersona></datosGenerales>';

const regimenGeneral = (...impuestos: number[]) =>
  '<datosRegimenGeneral>' +
  impuestos.map((id) => `<impuesto><idImpuesto>${String(id)}</idImpuesto></impuesto>`).join('') +
  '</datosRegimenGeneral>';

const falla = (mensaje: string) =>
  sobre(
    '<soap:Fault><faultcode>soap:Server</faultcode>' +
      `<faultstring>${mensaje}</faultstring></soap:Fault>`,
  );

function transporteQueResponde(cuerpo: string, estado = 200) {
  const pedidos: { url: string; solicitud: SolicitudHttp }[] = [];
  const transporte: Transporte = (url, solicitud) => {
    pedidos.push({ url, solicitud });
    return Promise.resolve<RespuestaHttp>({ estado, cuerpo });
  };
  return { transporte, pedidos };
}

const consultar = (cuerpo: string, estado?: number) => {
  const { transporte, pedidos } = transporteQueResponde(cuerpo, estado);
  const resultado = consultarPadron(
    { ambiente: 'homologacion', cuit: emisor, tickets, transporte },
    consultado,
  );
  return { resultado, pedidos };
};

describe('consultarPadron', () => {
  it('pide la persona con el ticket escapado y el emisor como representada', async () => {
    const { resultado, pedidos } = consultar(persona(generales({ razonSocial: 'ACME SA' })));
    await resultado;

    const [pedido] = pedidos;
    expect(pedido?.url).toBe('https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5');
    expect(pedido?.solicitud.encabezados['SOAPAction']).toBe('""');
    expect(pedido?.solicitud.cuerpo).toContain(
      '<a5:getPersona_v2 xmlns:a5="http://a5.soap.ws.server.puc.sr/">' +
        '<token>T&lt;1&gt;</token><sign>F&amp;2</sign>' +
        '<cuitRepresentada>20123456786</cuitRepresentada><idPersona>30500010912</idPersona>' +
        '</a5:getPersona_v2>',
    );
  });

  it('devuelve razón social, domicilio fiscal y responsable inscripto', async () => {
    const { resultado } = consultar(
      persona(generales({ razonSocial: 'ACME SA' }) + regimenGeneral(20, 30)),
    );

    expect(await resultado).toEqual(
      exito({
        nombre: 'ACME SA',
        domicilio: 'AV CORRIENTES 1234, SAN NICOLAS, CIUDAD AUTONOMA BUENOS AIRES',
        condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
        activo: true,
      }),
    );
  });

  it('arma el nombre de una persona humana con apellido y nombre', async () => {
    const { resultado } = consultar(
      persona(
        generales({ apellido: 'PEREZ', nombre: 'JUAN CARLOS' }) +
          '<datosMonotributo><categoriaMonotributo><descripcionCategoria>A LOCACIONES' +
          '</descripcionCategoria></categoriaMonotributo></datosMonotributo>',
      ),
    );

    const valor = await resultado;
    expect(valor.ok && valor.valor.nombre).toBe('PEREZ JUAN CARLOS');
    expect(valor.ok && valor.valor.condicion).toBe(CondicionIvaReceptor.MONOTRIBUTO);
  });

  it('reconoce al exento y no repite la localidad igual a la provincia', async () => {
    const { resultado } = consultar(
      persona(
        generales({
          razonSocial: 'FUNDACION',
          domicilio:
            '<domicilioFiscal><direccion>CALLE 1</direccion><localidad>CORDOBA</localidad>' +
            '<descripcionProvincia>CORDOBA</descripcionProvincia></domicilioFiscal>',
        }) + regimenGeneral(32),
      ),
    );

    const valor = await resultado;
    expect(valor.ok && valor.valor.condicion).toBe(CondicionIvaReceptor.EXENTO);
    expect(valor.ok && valor.valor.domicilio).toBe('CALLE 1, CORDOBA');
  });

  it('deja la condición sin elegir cuando no es clara y avisa la clave inactiva', async () => {
    const { resultado } = consultar(
      persona(
        generales({ razonSocial: 'X', estado: 'INACTIVO', domicilio: '' }) + regimenGeneral(11),
      ),
    );

    expect(await resultado).toEqual(exito({ nombre: 'X', activo: false }));
  });

  it('limpia invisibles y espacios y recorta a lo que admite cada campo', async () => {
    const largo = 'A'.repeat(80);
    const { resultado } = consultar(
      persona(
        generales({
          razonSocial: `  ACME&#x202E;   &#x0;SA ${largo}`,
          domicilio: `<domicilioFiscal><direccion>${'B'.repeat(200)}</direccion></domicilioFiscal>`,
        }),
      ),
    );

    const valor = await resultado;
    expect(valor.ok && valor.valor.nombre).toBe(`ACME SA ${'A'.repeat(52)}`);
    expect(valor.ok && valor.valor.domicilio).toBe('B'.repeat(150));
  });

  it('descarta datos de un CUIT distinto del consultado', async () => {
    const { resultado } = consultar(persona(generales({ id: '20123456786', razonSocial: 'OTRO' })));

    expect(await resultado).toEqual(fallo({ tipo: 'respuesta_inesperada', estado: 200 }));
  });

  it('informa el CUIT inexistente', async () => {
    const { resultado } = consultar(falla('No existe persona con ese Id'));

    expect(await resultado).toEqual(fallo({ tipo: 'cuit_inexistente' }));
  });

  it('informa cuando ARCA no entrega la constancia', async () => {
    const { resultado } = consultar(
      persona('<errorConstancia><error>La CUIT tiene inconsistencias</error></errorConstancia>'),
    );

    expect(await resultado).toEqual(fallo({ tipo: 'sin_constancia' }));
  });

  it('pasa las demás fallas SOAP tal cual', async () => {
    const { resultado } = consultar(falla('Token expirado'));

    expect(await resultado).toEqual(
      fallo({ tipo: 'falla_soap', codigo: 'Server', mensaje: 'Token expirado' }),
    );
  });

  it('rechaza una respuesta sin personaReturn', async () => {
    const { resultado } = consultar(sobre('<ns2:getPersona_v2Response xmlns:ns2="x"/>'));

    expect(await resultado).toEqual(fallo({ tipo: 'respuesta_inesperada', estado: 200 }));
  });

  it('no llama al padrón sin ticket', async () => {
    const error: ErrorWsaa = {
      tipo: 'rechazo_wsaa',
      motivo: 'no_autorizado',
      codigo: 'coe.notAuthorized',
      mensaje: 'Computador no autorizado a acceder al servicio',
    };
    const { transporte, pedidos } = transporteQueResponde('');
    const resultado = await consultarPadron(
      {
        ambiente: 'produccion',
        cuit: emisor,
        tickets: {
          obtener: () => Promise.resolve(fallo(error)),
          invalidar: () => Promise.resolve(),
        },
        transporte,
      },
      consultado,
    );

    expect(resultado).toEqual(fallo(error));
    expect(pedidos).toHaveLength(0);
  });
});
