import { readFileSync } from 'node:fs';

import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  Dni,
  FechaCalendario,
  SIN_IDENTIFICAR,
  TipoComprobante,
  type DatosComprobante,
  type Resultado,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { Transporte } from '../soap/transporte';
import { consultarComprobante, consultarUltimoAutorizado, solicitarCae } from './cae';

const grabacion = (nombre: string) =>
  readFileSync(new URL(`./grabaciones/${nombre}.xml`, import.meta.url), 'utf8');

const valor = <T>(resultado: Resultado<T, unknown>): T => {
  if (!resultado.ok) throw new Error(`Dato de prueba inválido: ${JSON.stringify(resultado.error)}`);
  return resultado.valor;
};

const pesos = (texto: string) => valor(Dinero.desdeTexto(texto));
const fecha = (anio: number, mes: number, dia: number) =>
  valor(FechaCalendario.crear(anio, mes, dia));

const cuit = valor(Cuit.crear('20123456786'));
const autorizacion = {
  ticket: { token: 'TOKEN', firma: 'FIRMA', vencimiento: new Date('2026-10-27T12:00:00Z') },
  cuit,
};

// Los mismos comprobantes que se autorizaron en homologación el 2026-10-27.
const hoy = fecha(2026, 10, 27);

const facturaC: DatosComprobante = {
  tipo: TipoComprobante.FACTURA_C,
  receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
  identificacionReceptor: SIN_IDENTIFICAR,
  modoDePrecio: 'final',
  items: [{ descripcion: 'Producto', cantidad: Cantidad.UNO, precioUnitario: pesos('1.000') }],
  fechaDeEmision: hoy,
  concepto: 'productos',
};

const facturaB: DatosComprobante = {
  tipo: TipoComprobante.FACTURA_B,
  receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
  identificacionReceptor: { tipo: 'dni', dni: valor(Dni.crear('30123456')) },
  modoDePrecio: 'final',
  items: [
    {
      descripcion: 'Producto',
      cantidad: valor(Cantidad.desdeTexto('2')),
      precioUnitario: pesos('1.210'),
      alicuota: AlicuotaIva.VEINTIUNO,
    },
    {
      descripcion: 'Libro',
      cantidad: Cantidad.UNO,
      precioUnitario: pesos('552,50'),
      alicuota: AlicuotaIva.DIEZ_Y_MEDIO,
    },
  ],
  fechaDeEmision: hoy,
  concepto: 'productos',
};

const facturaA: DatosComprobante = {
  tipo: TipoComprobante.FACTURA_A,
  receptor: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  identificacionReceptor: { tipo: 'cuit', cuit },
  modoDePrecio: 'neto',
  items: [
    {
      descripcion: 'Consultoría',
      cantidad: valor(Cantidad.desdeTexto('10')),
      precioUnitario: pesos('15.000'),
      alicuota: AlicuotaIva.VEINTIUNO,
    },
  ],
  fechaDeEmision: hoy,
  concepto: 'servicios',
  periodoDeServicio: {
    desde: fecha(2026, 9, 27),
    hasta: hoy,
    vencimientoDePago: fecha(2026, 11, 6),
  },
};

const crear = (datos: DatosComprobante) => valor(Comprobante.crear(datos));

/** Devuelve siempre la misma respuesta y guarda la última solicitud. */
function responder(cuerpo: string) {
  const enviado = { accion: '', cuerpo: '' };
  const transporte: Transporte = (_, solicitud) => {
    enviado.accion = solicitud.encabezados['SOAPAction'] ?? '';
    enviado.cuerpo = solicitud.cuerpo;
    return Promise.resolve({ estado: 200, cuerpo });
  };
  return { transporte, enviado };
}

const solicitar = (datos: DatosComprobante, cuerpo: string, numero = 1) => {
  const { transporte, enviado } = responder(cuerpo);
  const resultado = solicitarCae(
    autorizacion,
    { comprobante: crear(datos), puntoDeVenta: 1, numero },
    transporte,
    'https://wsfe',
  );
  return { resultado, enviado };
};

describe('consultarUltimoAutorizado', () => {
  it('pide el último número del punto de venta y tipo', async () => {
    const { transporte, enviado } = responder(grabacion('ultimoAutorizado'));

    const resultado = await consultarUltimoAutorizado(
      autorizacion,
      1,
      TipoComprobante.FACTURA_C,
      transporte,
      'https://wsfe',
    );

    expect(enviado.accion).toBe('"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"');
    expect(enviado.cuerpo).toContain(
      '</Auth><PtoVta>1</PtoVta><CbteTipo>11</CbteTipo></FECompUltimoAutorizado>',
    );
    expect(resultado).toEqual({ ok: true, valor: 1 });
  });

  it('devuelve 0 si todavía no se autorizó ninguno', async () => {
    const resultado = await consultarUltimoAutorizado(
      autorizacion,
      1,
      TipoComprobante.FACTURA_C,
      responder(grabacion('ultimoAutorizadoSinComprobantes')).transporte,
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: true, valor: 0 });
  });

  it('informa los errores de ARCA', async () => {
    const resultado = await consultarUltimoAutorizado(
      autorizacion,
      1,
      TipoComprobante.FACTURA_C,
      responder(grabacion('ultimoAutorizadoTokenInvalido')).transporte,
      'https://wsfe',
    );

    expect(resultado.ok || resultado.error).toMatchObject({
      tipo: 'rechazo_wsfe',
      errores: [{ codigo: 600 }],
    });
  });

  it.each([
    ['otro punto de venta', 2, TipoComprobante.FACTURA_C],
    ['otro tipo', 1, TipoComprobante.FACTURA_B],
  ])('rechaza la respuesta de %s', async (_, puntoDeVenta, tipo) => {
    const resultado = await consultarUltimoAutorizado(
      autorizacion,
      puntoDeVenta,
      tipo,
      responder(grabacion('ultimoAutorizado')).transporte,
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: false, error: { tipo: 'respuesta_inesperada', estado: 200 } });
  });

  it('rechaza un número que no es entero', async () => {
    const resultado = await consultarUltimoAutorizado(
      autorizacion,
      1,
      TipoComprobante.FACTURA_C,
      responder(grabacion('ultimoAutorizado').replace('<CbteNro>1<', '<CbteNro>uno<')).transporte,
      'https://wsfe',
    );

    expect(resultado.ok).toBe(false);
  });

  it('no acepta un punto de venta fuera de rango', async () => {
    const { transporte } = responder(grabacion('ultimoAutorizado'));

    await expect(
      consultarUltimoAutorizado(autorizacion, 0, TipoComprobante.FACTURA_C, transporte, ''),
    ).rejects.toThrow(RangeError);
  });
});

describe('solicitarCae', () => {
  it('arma la factura C con los campos en el orden del esquema', async () => {
    const { resultado, enviado } = solicitar(facturaC, grabacion('caeFacturaC'));
    await resultado;

    expect(enviado.accion).toBe('"http://ar.gov.afip.dif.FEV1/FECAESolicitar"');
    expect(enviado.cuerpo).toContain(
      '</Auth><FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>1</PtoVta><CbteTipo>11</CbteTipo>' +
        '</FeCabReq><FeDetReq><FECAEDetRequest><Concepto>1</Concepto><DocTipo>99</DocTipo>' +
        '<DocNro>0</DocNro><CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta><CbteFch>20261027</CbteFch>' +
        '<ImpTotal>1000.00</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>1000.00</ImpNeto>' +
        '<ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>0.00</ImpIVA><MonId>PES</MonId>' +
        '<MonCotiz>1</MonCotiz><CondicionIVAReceptorId>5</CondicionIVAReceptorId>' +
        '</FECAEDetRequest></FeDetReq></FeCAEReq></FECAESolicitar>',
    );
  });

  it('informa el IVA por alícuota y el documento del receptor', async () => {
    const { resultado, enviado } = solicitar(facturaB, grabacion('caeFacturaB'));
    await resultado;

    expect(enviado.cuerpo).toContain('<DocTipo>96</DocTipo><DocNro>30123456</DocNro>');
    expect(enviado.cuerpo).toContain(
      '<ImpTotal>2972.50</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>2500.00</ImpNeto>' +
        '<ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>472.50</ImpIVA>',
    );
    expect(enviado.cuerpo).toContain(
      '<CondicionIVAReceptorId>5</CondicionIVAReceptorId><Iva>' +
        '<AlicIva><Id>5</Id><BaseImp>2000.00</BaseImp><Importe>420.00</Importe></AlicIva>' +
        '<AlicIva><Id>4</Id><BaseImp>500.00</BaseImp><Importe>52.50</Importe></AlicIva></Iva>' +
        '</FECAEDetRequest>',
    );
  });

  it('informa el período de servicio entre el IVA y la moneda', async () => {
    const { resultado, enviado } = solicitar(facturaA, grabacion('caeConObservaciones'));
    await resultado;

    expect(enviado.cuerpo).toContain(
      '<Concepto>2</Concepto><DocTipo>80</DocTipo><DocNro>20123456786</DocNro>',
    );
    expect(enviado.cuerpo).toContain(
      '<ImpIVA>31500.00</ImpIVA><FchServDesde>20260927</FchServDesde>' +
        '<FchServHasta>20261027</FchServHasta><FchVtoPago>20261106</FchVtoPago><MonId>PES</MonId>',
    );
    expect(enviado.cuerpo).toContain('<CondicionIVAReceptorId>1</CondicionIVAReceptorId>');
  });

  it('escapa los valores que inserta en el XML', async () => {
    const { transporte, enviado } = responder(grabacion('caeFacturaC'));

    await solicitarCae(
      { ...autorizacion, ticket: { ...autorizacion.ticket, firma: '</Sign><Cuit>1</Cuit>' } },
      { comprobante: crear(facturaC), puntoDeVenta: 1, numero: 1 },
      transporte,
      'https://wsfe',
    );

    expect(enviado.cuerpo).toContain('<Sign>&lt;/Sign&gt;&lt;Cuit&gt;1&lt;/Cuit&gt;</Sign>');
  });

  it('registra el CAE en el comprobante aprobado', async () => {
    const resultado = await solicitar(facturaC, grabacion('caeFacturaC')).resultado;

    if (!resultado.ok) throw new Error('se esperaba la aprobación');
    const { comprobante, puntoDeVenta, numero, observaciones } = resultado.valor;
    expect(comprobante.autorizacion?.cae).toBe('86431024057662');
    expect(comprobante.autorizacion?.vencimiento.esIgualA(fecha(2026, 11, 6))).toBe(true);
    expect({ puntoDeVenta, numero, observaciones }).toEqual({
      puntoDeVenta: 1,
      numero: 1,
      observaciones: [],
    });
  });

  it('devuelve las observaciones de una aprobación', async () => {
    const resultado = await solicitar(facturaA, grabacion('caeConObservaciones')).resultado;

    expect(resultado.ok && resultado.valor.comprobante.estaAutorizado()).toBe(true);
    expect(resultado.ok && resultado.valor.observaciones).toEqual([
      { codigo: 10017, mensaje: expect.stringContaining('no se encuentra registrado') as string },
    ]);
  });

  it('informa el rechazo con sus errores', async () => {
    const resultado = await solicitar(facturaC, grabacion('caeRechazado'), 99_999_999).resultado;

    expect(resultado).toEqual({
      ok: false,
      error: {
        tipo: 'comprobante_rechazado',
        observaciones: [],
        errores: [
          { codigo: 10016, mensaje: expect.stringContaining('proximo a autorizar') as string },
        ],
      },
    });
  });

  it('informa las observaciones de un rechazo', async () => {
    const respuesta = grabacion('caeRechazado').replace(
      '<CAE />',
      '<Observaciones><Obs><Code>10015</Code><Msg>Documento invalido</Msg></Obs></Observaciones><CAE />',
    );

    const resultado = await solicitar(facturaC, respuesta, 99_999_999).resultado;

    expect(resultado.ok || resultado.error).toMatchObject({
      tipo: 'comprobante_rechazado',
      observaciones: [{ codigo: 10015, mensaje: 'Documento invalido' }],
    });
  });

  it('informa el rechazo de la solicitud entera, como el del token', async () => {
    const resultado = await solicitar(facturaC, grabacion('caeTokenInvalido')).resultado;

    expect(resultado.ok || resultado.error).toMatchObject({
      tipo: 'rechazo_wsfe',
      errores: [{ codigo: 600 }],
    });
  });

  it.each([
    ['otro número', (xml: string) => xml.replace('<CbteDesde>1<', '<CbteDesde>2<')],
    ['un rango de números', (xml: string) => xml.replace('<CbteHasta>1<', '<CbteHasta>2<')],
    ['otro tipo', (xml: string) => xml.replace('<CbteTipo>11<', '<CbteTipo>6<')],
    ['otro punto de venta', (xml: string) => xml.replace('<PtoVta>1<', '<PtoVta>2<')],
    ['un CAE inválido', (xml: string) => xml.replace('86431024057662', '8643')],
    ['un vencimiento inválido', (xml: string) => xml.replace('20261106', '20261306')],
    ['un resultado parcial', (xml: string) => xml.replaceAll('<Resultado>A<', '<Resultado>P<')],
    ['ni detalle ni errores', (xml: string) => xml.replace(/<FeDetResp>.*<\/FeDetResp>/, '')],
  ])('rechaza una aprobación con %s', async (_, cambiar) => {
    const resultado = await solicitar(facturaC, cambiar(grabacion('caeFacturaC'))).resultado;

    expect(resultado).toEqual({ ok: false, error: { tipo: 'respuesta_inesperada', estado: 200 } });
  });

  it('propaga los errores de transporte', async () => {
    const resultado = await solicitarCae(
      autorizacion,
      { comprobante: crear(facturaC), puntoDeVenta: 1, numero: 1 },
      () => Promise.reject(new Error('sin red')),
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
  });

  it('no envía un comprobante ya autorizado', async () => {
    const { transporte, enviado } = responder(grabacion('caeFacturaC'));
    const autorizado = valor(crear(facturaC).autorizar('86431024057662', fecha(2026, 11, 6)));

    const resultado = await solicitarCae(
      autorizacion,
      { comprobante: autorizado, puntoDeVenta: 1, numero: 2 },
      transporte,
      'https://wsfe',
    );

    expect(resultado).toEqual({
      ok: false,
      error: { tipo: 'comprobante_no_soportado', motivo: 'ya_autorizado' },
    });
    expect(enviado.cuerpo).toBe('');
  });

  it('no envía notas de crédito sin el comprobante asociado', async () => {
    const resultado = await solicitar(
      { ...facturaC, tipo: TipoComprobante.NOTA_DE_CREDITO_C },
      grabacion('caeFacturaC'),
    ).resultado;

    expect(resultado).toEqual({
      ok: false,
      error: { tipo: 'comprobante_no_soportado', motivo: 'requiere_comprobante_asociado' },
    });
  });

  it.each([0, 100_000_000, 1.5])('no acepta el número %s', async (numero) => {
    await expect(solicitar(facturaC, grabacion('caeFacturaC'), numero).resultado).rejects.toThrow(
      RangeError,
    );
  });
});

describe('consultarComprobante', () => {
  const consultar = (cuerpo: string, numero = 1, tipo = TipoComprobante.FACTURA_B) => {
    const { transporte, enviado } = responder(cuerpo);
    const resultado = consultarComprobante(
      autorizacion,
      1,
      tipo,
      numero,
      transporte,
      'https://wsfe',
    );
    return { resultado, enviado };
  };

  it('pide el comprobante por tipo, número y punto de venta', async () => {
    const { resultado, enviado } = consultar(grabacion('consultaFacturaB'));
    await resultado;

    expect(enviado.accion).toBe('"http://ar.gov.afip.dif.FEV1/FECompConsultar"');
    expect(enviado.cuerpo).toContain(
      '</Auth><FeCompConsReq><CbteTipo>6</CbteTipo><CbteNro>1</CbteNro><PtoVta>1</PtoVta>' +
        '</FeCompConsReq></FECompConsultar>',
    );
  });

  it('lee lo que ARCA registró, con los importes en formato double', async () => {
    const resultado = await consultar(grabacion('consultaFacturaB')).resultado;

    if (!resultado.ok || !resultado.valor) throw new Error('se esperaba el comprobante');
    const { fechaDeEmision, vencimiento, ...resto } = resultado.valor;
    expect(resto).toEqual({
      puntoDeVenta: 1,
      codigoDeTipo: 6,
      numero: 1,
      totalEnCentavos: 297_250,
      codigoDeDocumento: 96,
      numeroDeDocumento: '30123456',
      cae: '86431024057719',
      observaciones: [],
    });
    expect(fechaDeEmision.aTextoArca()).toBe('20261027');
    expect(vencimiento.aTextoArca()).toBe('20261106');
  });

  it('lee las observaciones', async () => {
    const resultado = await consultar(
      grabacion('consultaConObservaciones'),
      1,
      TipoComprobante.FACTURA_A,
    ).resultado;

    expect(resultado.ok && resultado.valor?.observaciones.map(({ codigo }) => codigo)).toEqual([
      10017,
    ]);
  });

  it('devuelve undefined si ARCA no tiene el comprobante', async () => {
    const resultado = await consultar(grabacion('consultaSinResultados'), 999).resultado;

    expect(resultado).toEqual({ ok: true, valor: undefined });
  });

  it('informa los demás errores de ARCA', async () => {
    const resultado = await consultar(
      grabacion('consultaSinResultados').replace('<Code>602<', '<Code>600<'),
    ).resultado;

    expect(resultado.ok || resultado.error.tipo).toBe('rechazo_wsfe');
  });

  it.each([
    ['otro número', (xml: string) => xml.replace('<CbteDesde>1<', '<CbteDesde>2<')],
    ['otro tipo', (xml: string) => xml.replace('<CbteTipo>6<', '<CbteTipo>11<')],
    [
      'un resultado que no es aprobado',
      (xml: string) => xml.replace('<Resultado>A<', '<Resultado>R<'),
    ],
    ['un importe ilegible', (xml: string) => xml.replace('<ImpTotal>2972.5<', '<ImpTotal>2972,5<')],
    ['un importe con tres decimales', (xml: string) => xml.replace('2972.5<', '2972.505<')],
    ['un CAE inválido', (xml: string) => xml.replace('86431024057719', 'NULL')],
    ['una fecha inválida', (xml: string) => xml.replace('<CbteFch>20261027<', '<CbteFch>NULL<')],
    ['ningún comprobante', (xml: string) => xml.replace(/<ResultGet>.*<\/ResultGet>/, '')],
  ])('rechaza una respuesta con %s', async (_, cambiar) => {
    const resultado = await consultar(cambiar(grabacion('consultaFacturaB'))).resultado;

    expect(resultado).toEqual({ ok: false, error: { tipo: 'respuesta_inesperada', estado: 200 } });
  });

  it('propaga los errores de transporte', async () => {
    const resultado = await consultarComprobante(
      autorizacion,
      1,
      TipoComprobante.FACTURA_B,
      1,
      () => Promise.reject(new Error('sin red')),
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
  });
});
