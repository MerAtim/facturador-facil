import { CondicionIvaReceptor, Cuit, Dni, TipoComprobante } from '@facturador/dominio';
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';

import { autorizado, emisor, item, sinAutorizar, valor } from './paraPruebas';
import { datosDelQr, svgDelQr, urlDelQr } from './qrDeArca';

const cuitEmisor = emisor.datos.cuit;

/** Lo que va en el parámetro `p` de la URL, decodificado. */
function decodificar(url: string): unknown {
  const parametro = new URL(url).searchParams.get('p') ?? '';
  return JSON.parse(atob(parametro));
}

describe('urlDelQr', () => {
  it('usa la dirección de ARCA y los datos en base64 con el formato de la especificación', () => {
    const url = urlDelQr({ comprobante: autorizado(), cuitEmisor, puntoDeVenta: 2, numero: 15 });

    expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true);
    expect(decodificar(url)).toEqual({
      ver: 1,
      fecha: '2026-10-27',
      cuit: 27333333339,
      ptoVta: 2,
      tipoCmp: 6,
      nroCmp: 15,
      importe: 1210,
      moneda: 'PES',
      ctz: 1,
      tipoCodAut: 'E',
      codAut: 76123456789012,
    });
  });

  it('incluye el CUIT del receptor cuando lo tiene', () => {
    const comprobante = autorizado({
      tipo: TipoComprobante.FACTURA_A,
      receptor: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
      identificacionReceptor: { tipo: 'cuit', cuit: valor(Cuit.crear('30712345671')) },
    });

    expect(datosDelQr({ comprobante, cuitEmisor, puntoDeVenta: 2, numero: 1 })).toMatchObject({
      tipoCmp: 1,
      tipoDocRec: 80,
      nroDocRec: 30712345671,
    });
  });

  it('incluye el DNI del consumidor final identificado', () => {
    const comprobante = autorizado({
      identificacionReceptor: { tipo: 'dni', dni: valor(Dni.crear('30.123.456')) },
    });

    expect(datosDelQr({ comprobante, cuitEmisor, puntoDeVenta: 2, numero: 1 })).toMatchObject({
      tipoDocRec: 96,
      nroDocRec: 30123456,
    });
  });

  it('el importe lleva los centavos', () => {
    const comprobante = autorizado({ items: [item('Flete', '1.234,56')] });

    expect(datosDelQr({ comprobante, cuitEmisor, puntoDeVenta: 1, numero: 1 }).importe).toBe(
      1234.56,
    );
  });

  it('no arma el QR de un comprobante sin autorizar', () => {
    expect(() =>
      datosDelQr({ comprobante: sinAutorizar(), cuitEmisor, puntoDeVenta: 1, numero: 1 }),
    ).toThrow('autorizado');
  });
});

/**
 * Convierte el SVG de vuelta en píxeles (cada módulo, un cuadrado de `escala` píxeles) para
 * leerlo con un lector de QR, como haría la cámara del cliente.
 */
function leerQr(svg: string): string | undefined {
  const lado = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  const trazo = /<path d="([^"]*)"/.exec(svg)?.[1] ?? '';
  const escala = 4;
  const ancho = lado * escala;
  const pixeles = new Uint8ClampedArray(ancho * ancho * 4).fill(255);

  for (const [, columna, fila] of trazo.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    for (let y = 0; y < escala; y++) {
      for (let x = 0; x < escala; x++) {
        const inicio = ((Number(fila) * escala + y) * ancho + Number(columna) * escala + x) * 4;
        pixeles.fill(0, inicio, inicio + 3);
      }
    }
  }
  return jsQR(pixeles, ancho, ancho)?.data;
}

describe('svgDelQr', () => {
  it('lo que se dibuja se lee como la URL de ARCA', () => {
    const url = urlDelQr({ comprobante: autorizado(), cuitEmisor, puntoDeVenta: 2, numero: 15 });

    expect(leerQr(svgDelQr(url, 120))).toBe(url);
  });

  it('dibuja el QR solo con números, sin texto del contenido', () => {
    const svg = svgDelQr('https://www.afip.gob.ar/fe/qr/?p=<script>', 120);

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"')).toBe(
      true,
    );
    expect(svg).not.toContain('script');
    const trazo = /<path d="([^"]*)"/.exec(svg)?.[1] ?? '';
    expect(trazo).toMatch(/^[Mhvz0-9 -]+$/);
    expect(trazo.length).toBeGreaterThan(0);
  });
});
