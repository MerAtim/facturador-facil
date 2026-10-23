import { describe, expect, it } from 'vitest';

import { Dinero } from '../importes/dinero';
import { AlicuotaIva } from './alicuotaIva';
import { calcularDesdePrecioFinal, calcularDesdePrecioNeto } from './calculoIva';

const pesos = (texto: string): Dinero => {
  const resultado = Dinero.desdeTexto(texto);
  if (!resultado.ok) throw new Error(`Importe de prueba inválido: ${texto}`);
  return resultado.valor;
};

const centavos = (dinero: Dinero) => dinero.centavos;

describe('calcularDesdePrecioFinal', () => {
  it.each([
    ['1.210', AlicuotaIva.VEINTIUNO, '1.000', '210'],
    ['100', AlicuotaIva.VEINTIUNO, '82,64', '17,36'],
    ['1.105', AlicuotaIva.DIEZ_Y_MEDIO, '1.000', '105'],
    ['127', AlicuotaIva.VEINTISIETE, '100', '27'],
    ['105', AlicuotaIva.CINCO, '100', '5'],
    ['102,5', AlicuotaIva.DOS_Y_MEDIO, '100', '2,5'],
    ['500', AlicuotaIva.CERO, '500', '0'],
    ['0', AlicuotaIva.VEINTIUNO, '0', '0'],
    ['0,01', AlicuotaIva.VEINTIUNO, '0,01', '0'],
  ])('%s con %o da neto %s e IVA %s', (final, alicuota, neto, iva) => {
    const importes = calcularDesdePrecioFinal(pesos(final), alicuota);

    expect(centavos(importes.neto)).toBe(centavos(pesos(neto)));
    expect(centavos(importes.iva)).toBe(centavos(pesos(iva)));
    expect(centavos(importes.total)).toBe(centavos(pesos(final)));
  });

  it.each(AlicuotaIva.TODAS.map((alicuota) => [alicuota.formatear(), alicuota] as const))(
    'con %s el total coincide con el precio final y el IVA no se desvía más de un centavo',
    (_, alicuota) => {
      for (let precio = 0; precio <= 500_000; precio += 13) {
        const final = Dinero.desdeCentavos(precio);
        if (!final.ok) throw new Error('Precio de prueba inválido');

        const { neto, iva, total } = calcularDesdePrecioFinal(final.valor, alicuota);
        const ivaSegunArca = neto.multiplicarPorFraccion(alicuota.puntosBasicos, 10_000);

        expect(total.centavos).toBe(precio);
        expect(neto.centavos + iva.centavos).toBe(precio);
        expect(Math.abs(iva.centavos - ivaSegunArca.centavos)).toBeLessThanOrEqual(1);
      }
    },
  );
});

describe('calcularDesdePrecioNeto', () => {
  it.each([
    ['1.000', AlicuotaIva.VEINTIUNO, '210', '1.210'],
    ['1.000', AlicuotaIva.DIEZ_Y_MEDIO, '105', '1.105'],
    ['100', AlicuotaIva.CERO, '0', '100'],
    ['33,33', AlicuotaIva.VEINTIUNO, '7', '40,33'],
  ])('%s con %o da IVA %s y total %s', (neto, alicuota, iva, total) => {
    const importes = calcularDesdePrecioNeto(pesos(neto), alicuota);

    expect(centavos(importes.iva)).toBe(centavos(pesos(iva)));
    expect(centavos(importes.total)).toBe(centavos(pesos(total)));
  });

  it('partir del neto redondeado puede no reproducir el precio final, por eso existe el otro cálculo', () => {
    const desdeFinal = calcularDesdePrecioFinal(pesos('100'), AlicuotaIva.VEINTIUNO);
    const desdeNeto = calcularDesdePrecioNeto(desdeFinal.neto, AlicuotaIva.VEINTIUNO);

    expect(desdeNeto.total.formatear()).toBe('$ 99,99');
  });
});

describe('AlicuotaIva', () => {
  it.each([
    [3, '0 %'],
    [9, '2,5 %'],
    [8, '5 %'],
    [4, '10,5 %'],
    [5, '21 %'],
    [6, '27 %'],
  ])('el código %i de ARCA corresponde a %s', (codigo, texto) => {
    expect(AlicuotaIva.desdeCodigoArca(codigo)?.formatear()).toBe(texto);
  });

  it('no reconoce códigos inexistentes', () => {
    expect(AlicuotaIva.desdeCodigoArca(1)).toBeUndefined();
  });
});
