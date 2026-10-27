// Solo para tests: comprobantes autorizados y emisores de ejemplo.
import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  Emisor,
  FechaCalendario,
  TipoComprobante,
  type DatosComprobante,
  type ItemComprobante,
} from '@facturador/dominio';

export const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

export const emisor = valor(
  Emisor.crear({
    razonSocial: 'Juana Pérez',
    cuit: valor(Cuit.crear('27333333339')),
    condicion: 'responsable_inscripto',
    domicilio: 'Av. Siempreviva 742, Rosario',
    inicioDeActividades: valor(FechaCalendario.crear(1998, 3, 1)),
    puntoDeVenta: 2,
  }),
);

export const item = (
  descripcion: string,
  precio: string,
  alicuota = AlicuotaIva.VEINTIUNO,
): ItemComprobante => ({
  descripcion,
  cantidad: Cantidad.UNO,
  precioUnitario: valor(Dinero.desdeTexto(precio)),
  alicuota,
});

export function sinAutorizar(datos: Partial<DatosComprobante> = {}): Comprobante {
  return valor(
    Comprobante.crear({
      tipo: TipoComprobante.FACTURA_B,
      receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
      identificacionReceptor: { tipo: 'sin_identificar' },
      modoDePrecio: 'final',
      items: [item('Tornillos', '1.210')],
      fechaDeEmision: valor(FechaCalendario.crear(2026, 10, 27)),
      concepto: 'productos',
      ...datos,
    }),
  );
}

export function autorizado(datos: Partial<DatosComprobante> = {}): Comprobante {
  return valor(
    sinAutorizar(datos).autorizar('76123456789012', valor(FechaCalendario.crear(2026, 11, 6))),
  );
}
