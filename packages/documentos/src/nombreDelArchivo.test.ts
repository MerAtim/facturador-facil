import { describe, expect, it } from 'vitest';

import { nombreDelArchivo } from './nombreDelArchivo';

describe('nombreDelArchivo', () => {
  it('lleva la clase y el número completo', () => {
    expect(nombreDelArchivo({ clase: 'B', puntoDeVenta: 2, numero: 15 })).toBe(
      'factura-B-00002-00000015.pdf',
    );
  });

  it('suma el nombre del receptor sin tildes ni espacios', () => {
    expect(
      nombreDelArchivo({ clase: 'A', puntoDeVenta: 1, numero: 7, receptor: 'Ferretería Sur S.A.' }),
    ).toBe('factura-A-00001-00000007-ferreteria-sur-s-a.pdf');
  });

  it.each([
    ['../../etc/passwd', 'etc-passwd'],
    ['C:\\Windows\\system32', 'c-windows-system32'],
    ['nombre\u0000oculto', 'nombre-oculto'],
    ['/', ''],
  ])('sanea "%s" para que no salga de la carpeta', (receptor, saneado) => {
    const nombre = nombreDelArchivo({ clase: 'C', puntoDeVenta: 1, numero: 1, receptor });

    expect(nombre).toBe(`factura-C-00001-00000001${saneado ? `-${saneado}` : ''}.pdf`);
    expect(nombre).not.toMatch(/[/\\]|\.\./);
  });

  it('acorta los nombres largos', () => {
    const nombre = nombreDelArchivo({
      clase: 'C',
      puntoDeVenta: 1,
      numero: 1,
      receptor: 'x'.repeat(200),
    });

    expect(nombre).toBe(`factura-C-00001-00000001-${'x'.repeat(40)}.pdf`);
  });
});
