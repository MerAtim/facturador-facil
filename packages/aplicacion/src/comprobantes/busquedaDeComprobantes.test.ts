import { describe, expect, it } from 'vitest';

import { interpretarBusqueda, LARGO_MAXIMO_DE_LA_BUSQUEDA } from './busquedaDeComprobantes';

describe('interpretarBusqueda', () => {
  it('sin texto no busca nada', () => {
    expect(interpretarBusqueda('')).toBeUndefined();
    expect(interpretarBusqueda('   ')).toBeUndefined();
  });

  it('un texto se busca solo en el nombre', () => {
    expect(interpretarBusqueda(' Ferretería ')).toEqual({ nombre: '%Ferretería%' });
  });

  it('escapa los comodines de LIKE y la barra', () => {
    expect(interpretarBusqueda(String.raw`50%_a\b`)?.nombre).toBe(String.raw`%50\%\_a\\b%`);
  });

  it('un número puede ser el número del comprobante, un documento o un importe', () => {
    expect(interpretarBusqueda('1234')).toEqual({
      nombre: '%1234%',
      documento: '%1234%',
      numero: 1234,
      totalEnCentavos: 123400,
    });
  });

  it('un CUIT con guiones se busca sin ellos', () => {
    expect(interpretarBusqueda('30-71234567-1')?.documento).toBe('%30712345671%');
  });

  it('pocos dígitos no se buscan en el documento', () => {
    expect(interpretarBusqueda('12')?.documento).toBeUndefined();
  });

  it('reconoce punto de venta y número', () => {
    expect(interpretarBusqueda('00003-00000012')?.puntoDeVentaYNumero).toEqual({
      puntoDeVenta: 3,
      numero: 12,
    });
  });

  it('reconoce un importe con decimales, pero no uno en cero', () => {
    expect(interpretarBusqueda('1.210,50')?.totalEnCentavos).toBe(121050);
    expect(interpretarBusqueda('0')?.totalEnCentavos).toBeUndefined();
  });

  it('un número demasiado grande no es un número de comprobante', () => {
    expect(interpretarBusqueda('123456789')?.numero).toBeUndefined();
  });

  it('recorta un texto demasiado largo', () => {
    const largo = 'a'.repeat(LARGO_MAXIMO_DE_LA_BUSQUEDA + 20);

    expect(interpretarBusqueda(largo)?.nombre).toHaveLength(LARGO_MAXIMO_DE_LA_BUSQUEDA + 2);
  });
});
