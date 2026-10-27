import { describe, expect, it } from 'vitest';

import { coloresClaros, coloresOscuros, SEMILLA } from './colores';
import { coloresDe, esquemaDelSistema } from './esquema';
import { espacio, radio, tipografia } from './tokens';

/** Luminancia relativa según WCAG 2.2. */
function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((inicio) => parseInt(hex.slice(inicio, inicio + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = canales.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((clara ?? 0) + 0.05) / ((oscura ?? 0) + 0.05);
}

type Colores = typeof coloresClaros;
type ColorPlano = Exclude<keyof Colores, 'elevation'>;

/** Texto sobre fondo: WCAG pide 4,5 a 1 para texto normal. */
const PARES_DE_TEXTO: readonly [ColorPlano, ColorPlano][] = [
  ['onPrimary', 'primary'],
  ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondary', 'secondary'],
  ['onSecondaryContainer', 'secondaryContainer'],
  ['onTertiary', 'tertiary'],
  ['onTertiaryContainer', 'tertiaryContainer'],
  ['onError', 'error'],
  ['onErrorContainer', 'errorContainer'],
  ['onBackground', 'background'],
  ['onSurface', 'surface'],
  ['onSurfaceVariant', 'surface'],
  ['onSurfaceVariant', 'surfaceVariant'],
  ['inverseOnSurface', 'inverseSurface'],
  ['primary', 'surface'],
  ['error', 'surface'],
];

describe.each([
  ['claro', coloresClaros],
  ['oscuro', coloresOscuros],
] as const)('colores del tema %s', (_, colores) => {
  it.each(PARES_DE_TEXTO)('%s sobre %s se lee con contraste suficiente', (texto, fondo) => {
    expect(contraste(colores[texto], colores[fondo])).toBeGreaterThanOrEqual(4.5);
  });

  it('el borde de los campos se distingue del fondo', () => {
    // WCAG pide 3 a 1 para los componentes de la interfaz, como el borde de un campo.
    expect(contraste(colores.outline, colores.surface)).toBeGreaterThanOrEqual(3);
  });

  it('define todos los niveles de elevación', () => {
    expect(Object.keys(colores.elevation)).toEqual([
      'level0',
      'level1',
      'level2',
      'level3',
      'level4',
      'level5',
    ]);
  });
});

describe('colores de marca', () => {
  it('el primario del tema claro es la semilla', () => {
    expect(coloresClaros.primary.toLowerCase()).toBe(SEMILLA.toLowerCase());
  });

  it('el tema oscuro tiene fondo oscuro y texto claro', () => {
    expect(luminancia(coloresOscuros.background)).toBeLessThan(0.05);
    expect(luminancia(coloresOscuros.onBackground)).toBeGreaterThan(0.7);
  });
});

describe('esquemaDelSistema', () => {
  it.each([
    ['dark', 'oscuro'],
    ['light', 'claro'],
    [null, 'claro'],
    [undefined, 'claro'],
  ] as const)('con la preferencia %s usa el esquema %s', (preferencia, esquema) => {
    expect(esquemaDelSistema(preferencia)).toBe(esquema);
  });

  it('cada esquema tiene sus colores', () => {
    expect(coloresDe('claro')).toBe(coloresClaros);
    expect(coloresDe('oscuro')).toBe(coloresOscuros);
  });
});

describe('tokens', () => {
  it('el espaciado sigue la grilla de 4 y crece', () => {
    const valores = Object.values(espacio);
    expect(valores.every((valor) => valor % 4 === 0)).toBe(true);
    expect([...valores].sort((a, b) => a - b)).toEqual(valores);
  });

  it('los radios crecen', () => {
    const valores = Object.values(radio);
    expect([...valores].sort((a, b) => a - b)).toEqual(valores);
  });

  it('solo los importes usan cifras tabulares', () => {
    const tabulares = Object.entries(tipografia)
      .filter(([, estilo]) => estilo.cifrasTabulares)
      .map(([variante]) => variante);
    expect(tabulares).toEqual(['importe', 'importeDestacado']);
  });
});
