import { describe, expect, it } from 'vitest';

import { unidadDe } from '../comprobantes/comprobante';
import { Cantidad } from './cantidad';
import { Dinero } from './dinero';
import { UnidadDeMedida } from './unidadDeMedida';

const cantidad = (texto: string): Cantidad => {
  const resultado = Cantidad.desdeTexto(texto);
  if (!resultado.ok) throw new Error(`Cantidad de prueba inválida: ${texto}`);
  return resultado.valor;
};

describe('UnidadDeMedida', () => {
  it.each([
    [UnidadDeMedida.KILOGRAMOS, '2,5', '2,5 kg'],
    [UnidadDeMedida.LITROS, '1', '1 L'],
    [UnidadDeMedida.METROS_CUADRADOS, '12', '12 m²'],
    [UnidadDeMedida.UNIDADES, '1', '1 unidad'],
    [UnidadDeMedida.UNIDADES, '3', '3 unidades'],
    [UnidadDeMedida.HORAS, '1,5', '1,5 horas'],
    [UnidadDeMedida.SERVICIOS, '1', '1 servicio'],
  ])('%o con %s se escribe %s', (unidad, texto, escrito) => {
    expect(unidad.formatear(cantidad(texto))).toBe(escrito);
  });

  it('se recupera por su clave, única aunque el código de ARCA se repita', () => {
    const claves = UnidadDeMedida.TODAS.map((unidad) => unidad.clave);

    expect(new Set(claves).size).toBe(claves.length);
    for (const unidad of UnidadDeMedida.TODAS) {
      expect(UnidadDeMedida.desdeClave(unidad.clave)).toBe(unidad);
    }
    expect(UnidadDeMedida.desdeClave('toneladas')).toBeUndefined();
  });

  it('usa los códigos de la tabla de ARCA', () => {
    expect(UnidadDeMedida.UNIDADES.codigoArca).toBe(7);
    expect(UnidadDeMedida.KILOGRAMOS.codigoArca).toBe(1);
    expect(UnidadDeMedida.HORAS.codigoArca).toBe(98);
  });

  it('un ítem sin unidad cuenta unidades', () => {
    const item = { descripcion: 'Tornillo', cantidad: Cantidad.UNO, precioUnitario: Dinero.CERO };

    expect(unidadDe(item)).toBe(UnidadDeMedida.UNIDADES);
    expect(unidadDe({ ...item, unidad: UnidadDeMedida.LITROS })).toBe(UnidadDeMedida.LITROS);
  });
});
