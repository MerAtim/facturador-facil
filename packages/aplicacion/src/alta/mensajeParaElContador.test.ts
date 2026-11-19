import { Cuit } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { mensajeParaElContador, type DatosParaElContador } from './mensajeParaElContador';

const cuit = (() => {
  const resultado = Cuit.crear('20123456786');
  if (!resultado.ok) throw new Error('CUIT de prueba inválido');
  return resultado.valor;
})();

const datos = (cambios: Partial<DatosParaElContador> = {}): DatosParaElContador => ({
  ambiente: 'produccion',
  razonSocial: 'Prueba SA',
  cuit,
  condicion: 'monotributo',
  puntoDeVenta: 7,
  alias: 'facturadorfacil',
  ...cambios,
});

describe('mensajeParaElContador', () => {
  it('en producción pide el punto de venta, el certificado y la autorización, en ese orden', () => {
    const mensaje = mensajeParaElContador(datos());

    const puntoDeVenta = mensaje.indexOf('punto de venta 7');
    const certificado = mensaje.indexOf('Administración de Certificados Digitales');
    const relacion = mensaje.indexOf('Administrador de Relaciones');
    expect(puntoDeVenta).toBeGreaterThan(-1);
    expect(certificado).toBeGreaterThan(puntoDeVenta);
    expect(relacion).toBeGreaterThan(certificado);
  });

  it('identifica al titular y usa el sistema que corresponde a su condición', () => {
    const mensaje = mensajeParaElContador(datos());

    expect(mensaje).toContain('Prueba SA, CUIT 20-12345678-6');
    expect(mensaje).toContain('Factura Electrónica - Monotributo - Web Services');
    expect(mensajeParaElContador(datos({ condicion: 'responsable_inscripto' }))).toContain(
      'RECE para aplicativo y web services',
    );
  });

  it('usa el mismo alias para el certificado y para la relación', () => {
    const mensaje = mensajeParaElContador(datos({ alias: 'mialias' }));

    expect(mensaje).toContain('agregar el alias "mialias"');
    expect(mensaje).toContain('computador fiscal "mialias"');
  });

  it('en homologación va por WSASS y no pide punto de venta', () => {
    const mensaje = mensajeParaElContador(datos({ ambiente: 'homologacion' }));

    expect(mensaje).toContain('WSASS');
    expect(mensaje).toContain('CUIT representada 20123456786');
    expect(mensaje).not.toContain('punto de venta');
  });

  it('aclara que el certificado solo sirve en el teléfono del emisor', () => {
    expect(mensajeParaElContador(datos())).toContain('solo funciona en mi teléfono');
  });
});
