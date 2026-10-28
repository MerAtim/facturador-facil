import { readFileSync } from 'node:fs';

import {
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  FechaCalendario,
  SIN_IDENTIFICAR,
  TipoComprobante,
  type Resultado,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import {
  explicarError,
  explicarObservaciones,
  explicarVerificacion,
  type MensajeDeError,
} from './mensajesDeError';
import type { ErrorAutorizacion } from './wsfe/autorizadorWsfe';
import { solicitarCae } from './wsfe/cae';

const grabacion = (nombre: string) =>
  readFileSync(new URL(`./wsfe/grabaciones/${nombre}.xml`, import.meta.url), 'utf8');

const valor = <T>(resultado: Resultado<T, unknown>): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const fecha = (anio: number, mes: number, dia: number) =>
  valor(FechaCalendario.crear(anio, mes, dia));

const facturaC = valor(
  Comprobante.crear({
    tipo: TipoComprobante.FACTURA_C,
    receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
    identificacionReceptor: SIN_IDENTIFICAR,
    modoDePrecio: 'final',
    items: [
      {
        descripcion: 'Producto',
        cantidad: Cantidad.UNO,
        precioUnitario: valor(Dinero.desdeTexto('1.000')),
      },
    ],
    fechaDeEmision: fecha(2026, 10, 27),
    concepto: 'productos',
  }),
);

/** El error que produce la integración con una respuesta real de ARCA. */
async function errorDe(nombreDeGrabacion: string, cambiar = (xml: string) => xml) {
  const resultado = await solicitarCae(
    {
      ticket: { token: 'T', firma: 'F', vencimiento: new Date('2030-01-01') },
      cuit: valor(Cuit.crear('20123456786')),
    },
    { comprobante: facturaC, puntoDeVenta: 1, numero: 1 },
    () => Promise.resolve({ estado: 200, cuerpo: cambiar(grabacion(nombreDeGrabacion)) }),
    'https://wsfe',
  );
  if (resultado.ok) throw new Error('se esperaba un error');
  return resultado.error;
}

const sinTrazas = (mensaje: MensajeDeError) =>
  [mensaje.titulo, mensaje.sugerencia, ...mensaje.detalles].every(
    (texto) => !/excepci|exception|stack|undefined|\[object/i.test(texto),
  );

describe('explicarError', () => {
  it('explica cada motivo de un rechazo real de ARCA', async () => {
    const mensaje = explicarError(await errorDe('caeRechazadoConObservaciones'));

    expect(mensaje).toEqual({
      titulo: 'ARCA rechazó el comprobante',
      detalles: [
        'Las facturas A necesitan el CUIT del receptor.',
        expect.stringContaining('Falta el documento del receptor') as string,
      ],
      accion: 'corregir_comprobante',
      sugerencia: 'Corregí el comprobante y volvé a emitirlo.',
      codigos: ['10013', '10015'],
    });
  });

  it('explica el número o la fecha fuera de secuencia', async () => {
    const mensaje = explicarError(await errorDe('caeRechazado'));

    expect(mensaje.detalles).toEqual([
      expect.stringContaining('anterior a la del último') as string,
    ]);
    expect(mensaje.codigos).toEqual(['10016']);
  });

  it('muestra el texto y el código de ARCA si el código no está en el catálogo', async () => {
    const mensaje = explicarError(
      await errorDe('caeRechazado', (xml) => xml.replace('<Code>10016<', '<Code>10999<')),
    );

    expect(mensaje.detalles).toEqual([
      'El numero o fecha del comprobante no se corresponde con el proximo a autorizar. ' +
        'Consultar metodo FECompUltimoAutorizado. (código 10999)',
    ]);
    expect(mensaje.codigos).toEqual(['10999']);
  });

  it('corta la traza técnica que ARCA agrega a algunos mensajes', async () => {
    const mensaje = explicarError(
      await errorDe('caeTokenInvalido', (xml) => xml.replace('<Code>600<', '<Code>699<')),
    );

    expect(mensaje.detalles).toEqual(['ValidacionDeToken: No valido token. (código 699)']);
    expect(sinTrazas(mensaje)).toBe(true);
  });

  it('usa la acción del catálogo para un rechazo del pedido', async () => {
    const mensaje = explicarError(await errorDe('caeTokenInvalido'));

    expect(mensaje).toMatchObject({
      titulo: 'ARCA rechazó el pedido',
      detalles: ['ARCA no aceptó el acceso de la app.'],
      accion: 'reintentar_mas_tarde',
      codigos: ['600'],
    });
  });

  it('acorta un mensaje desconocido muy largo', () => {
    const mensaje = explicarError({
      tipo: 'rechazo_wsfe',
      errores: [{ codigo: 1, mensaje: 'a'.repeat(500) }],
    });

    expect(mensaje.detalles[0]?.length).toBeLessThan(220);
    expect(mensaje.detalles[0]).toMatch(/… \(código 1\)$/);
  });

  it('procesa rápido un mensaje armado para trabar expresiones regulares', () => {
    const inicio = performance.now();

    const mensaje = explicarError({
      tipo: 'rechazo_wsfe',
      errores: [{ codigo: 1, mensaje: `Error${'\t'.repeat(100_000)}x` }],
    });

    expect(performance.now() - inicio).toBeLessThan(100);
    expect(mensaje.detalles).toEqual(['Error. (código 1)']);
  });

  it('muestra solo el código si ARCA no dio un texto útil', () => {
    const mensaje = explicarError({
      tipo: 'comprobante_rechazado',
      observaciones: [{ codigo: 12345, mensaje: 'Excepcion: NullReference' }],
      errores: [],
    });

    expect(mensaje.detalles).toEqual(['ARCA informó el código 12345.']);
  });

  it('avisa si ARCA rechazó sin decir por qué', () => {
    const mensaje = explicarError({
      tipo: 'comprobante_rechazado',
      observaciones: [],
      errores: [],
    });

    expect(mensaje.detalles).toEqual(['ARCA no indicó el motivo.']);
    expect(mensaje.accion).toBe('corregir_comprobante');
  });

  it('explica el resultado incierto con el número del comprobante', () => {
    const mensaje = explicarError({
      tipo: 'resultado_incierto',
      puntoDeVenta: 1,
      numero: 5,
      causa: { tipo: 'sin_conexion' },
    });

    expect(mensaje.titulo).toBe('No sabemos si ARCA autorizó el comprobante');
    expect(mensaje.detalles[0]).toContain('00001-00000005');
    expect(mensaje.accion).toBe('reintentar');
  });

  it('da los datos del comprobante anterior que sí se autorizó', () => {
    const mensaje = explicarError({
      tipo: 'comprobante_anterior_autorizado',
      anterior: {
        puntoDeVenta: 1,
        codigoDeTipo: 11,
        numero: 5,
        fechaDeEmision: fecha(2026, 10, 27),
        totalEnCentavos: 100_000,
        codigoDeDocumento: 99,
        numeroDeDocumento: '0',
        cae: '86431024113634',
        vencimiento: fecha(2026, 11, 6),
        observaciones: [],
      },
    });

    expect(mensaje.detalles[0]).toBe(
      'ARCA autorizó el comprobante 00001-00000005 del 27/10/2026 con el CAE 86431024113634, ' +
        'aunque en su momento no llegó la respuesta.',
    );
    expect(mensaje.accion).toBe('registrar_anterior');
  });

  it.each([
    ['ajustar_reloj', 'reloj_desfasado'],
    ['revisar_certificado', 'certificado_vencido'],
    ['revisar_certificado', 'no_autorizado'],
    ['reintentar_mas_tarde', 'no_disponible'],
    ['contactar_soporte', 'desconocido'],
  ] as const)('sugiere %s ante un rechazo de WSAA por %s', (accion, motivo) => {
    const mensaje = explicarError({
      tipo: 'rechazo_wsaa',
      motivo,
      codigo: 'cms.cert.expired',
      mensaje: 'detalle técnico de WSAA',
    });

    expect(mensaje.accion).toBe(accion);
    expect(mensaje.codigos).toEqual(['cms.cert.expired']);
    expect(mensaje.detalles.join()).not.toContain('detalle técnico');
  });

  const errores: ErrorAutorizacion[] = [
    { tipo: 'sin_conexion' },
    { tipo: 'respuesta_inesperada', estado: 502 },
    { tipo: 'xml_invalido', motivo: 'mal_formado' },
    { tipo: 'falla_soap', codigo: 'Server', mensaje: 'System.NullReferenceException at Foo.Bar()' },
    { tipo: 'ticket_ilegible' },
    { tipo: 'comprobante_no_soportado', motivo: 'ya_autorizado' },
    { tipo: 'comprobante_no_soportado', motivo: 'requiere_comprobante_asociado' },
    { tipo: 'almacen_no_disponible' },
    {
      tipo: 'rechazo_wsaa',
      motivo: 'ticket_vigente',
      codigo: 'coe.alreadyAuthenticated',
      mensaje: '',
    },
  ];

  it.each(errores)('explica $tipo sin trazas técnicas', (error) => {
    const mensaje = explicarError(error);

    expect(mensaje.titulo).not.toBe('');
    expect(mensaje.detalles.length).toBeGreaterThan(0);
    expect(mensaje.sugerencia).not.toBe('');
    expect(sinTrazas(mensaje)).toBe(true);
  });

  it('distingue la falta de conexión de una respuesta rota', () => {
    expect(explicarError({ tipo: 'sin_conexion' }).accion).toBe('reintentar');
    expect(explicarError({ tipo: 'respuesta_inesperada', estado: 502 }).accion).toBe(
      'reintentar_mas_tarde',
    );
  });
});

describe('explicarObservaciones', () => {
  it('explica las observaciones de una aprobación', () => {
    expect(
      explicarObservaciones([
        { codigo: 10017, mensaje: 'DocNro no se encuentra registrado en los padrones' },
        { codigo: 10999, mensaje: 'Observación nueva de ARCA' },
      ]),
    ).toEqual([
      'El CUIT del receptor no figura activo en el padrón de ARCA. Conviene verificarlo.',
      'Observación nueva de ARCA. (código 10999)',
    ]);
  });
});

describe('explicarVerificacion', () => {
  it('sin conexión no manda a ningún paso', () => {
    const mensaje = explicarVerificacion(
      { etapa: 'conexion', tipo: 'error', error: { tipo: 'sin_conexion' } },
      3,
    );

    expect(mensaje.titulo).toBe('Sin conexión con ARCA');
    expect(mensaje).not.toHaveProperty('revisar');
  });

  it('con servidores caídos, sugiere volver a intentar más tarde', () => {
    const mensaje = explicarVerificacion(
      {
        etapa: 'conexion',
        tipo: 'servicio_caido',
        servidores: { aplicacion: 'OK', baseDeDatos: 'ERROR', autenticacion: 'OK' },
      },
      3,
    );

    expect(mensaje.accion).toBe('reintentar_mas_tarde');
  });

  it.each([
    ['no_autorizado', 'autorizacion'],
    ['certificado_no_confiable', 'certificado'],
    ['certificado_vencido', 'certificado'],
    ['firma_invalida', 'certificado'],
    ['reloj_desfasado', undefined],
  ] as const)('si WSAA rechaza por %s, manda al paso %s', (motivo, paso) => {
    const mensaje = explicarVerificacion(
      {
        etapa: 'acceso',
        tipo: 'error',
        error: { tipo: 'rechazo_wsaa', motivo, codigo: 'x', mensaje: '' },
      },
      3,
    );

    expect(mensaje.revisar).toBe(paso);
  });

  it('si WSFEv1 rechaza el acceso a la CUIT, manda a la autorización', () => {
    const mensaje = explicarVerificacion(
      {
        etapa: 'acceso',
        tipo: 'error',
        error: { tipo: 'rechazo_wsfe', errores: [{ codigo: 601, mensaje: 'CUIT no autorizada' }] },
      },
      3,
    );

    expect(mensaje.revisar).toBe('autorizacion');
    expect(mensaje.detalles).toEqual([
      'El certificado no está autorizado a facturar con esta CUIT.',
    ]);
  });

  it('un error al consultar los puntos de venta no manda a ningún paso', () => {
    const mensaje = explicarVerificacion(
      { etapa: 'punto_de_venta', tipo: 'error', error: { tipo: 'sin_conexion' } },
      3,
    );

    expect(mensaje).not.toHaveProperty('revisar');
  });

  it('un punto de venta que no está sugiere los habilitados', () => {
    const mensaje = explicarVerificacion(
      { etapa: 'punto_de_venta', tipo: 'punto_de_venta_inexistente', habilitados: [2, 5] },
      3,
    );

    expect(mensaje).toMatchObject({
      titulo: 'El punto de venta 3 no está habilitado para web service',
      detalles: ['Los que tenés habilitados son: 2, 5.'],
      accion: 'revisar_punto_de_venta',
      revisar: 'punto_de_venta',
    });
  });

  it('sin puntos de venta habilitados, lo dice', () => {
    const mensaje = explicarVerificacion(
      { etapa: 'punto_de_venta', tipo: 'punto_de_venta_inexistente', habilitados: [] },
      3,
    );

    expect(mensaje.detalles).toEqual([
      'Todavía no tenés ningún punto de venta habilitado para web service.',
    ]);
  });

  it('explica por qué un punto de venta existente no sirve', () => {
    const mensaje = explicarVerificacion(
      { etapa: 'punto_de_venta', tipo: 'punto_de_venta_no_habilitado', motivo: 'solo_caea' },
      7,
    );

    expect(mensaje.titulo).toBe('El punto de venta 7 no sirve para facturar desde la app');
    expect(mensaje.detalles[0]).toContain('CAEA');
    expect(mensaje.revisar).toBe('punto_de_venta');
  });
});
