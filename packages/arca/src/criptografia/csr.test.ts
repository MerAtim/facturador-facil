import { verify } from 'node:crypto';

import { Cuit } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { desdePem } from './codificacion';
import { crearCsr } from './csr';
import { hijos, leer } from './der';
import { crearFirmadorDePrueba } from './paraPruebas';

const cuit = Cuit.crear('20123456786');
if (!cuit.ok) throw new Error('CUIT de prueba inválido');

describe('crearCsr', () => {
  it('arma una solicitud PKCS#10 firmada con la clave del firmador', async () => {
    const { firmador, publicKey } = crearFirmadorDePrueba();

    const pem = await crearCsr(
      { cuit: cuit.valor, organizacion: 'Pérez SRL', nombre: 'facturador' },
      firmador,
    );
    const [informacion, , firma] = hijos(leer(desdePem('CERTIFICATE REQUEST', pem)));

    expect(pem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n/);
    expect(informacion && firma).toBeTruthy();
    expect(
      verify(
        'sha256',
        informacion?.bytes ?? new Uint8Array(),
        publicKey,
        firma?.contenido.subarray(1) ?? new Uint8Array(),
      ),
    ).toBe(true);
  });

  it('incluye en el sujeto los datos que pide ARCA', async () => {
    const { firmador } = crearFirmadorDePrueba();

    const pem = await crearCsr(
      { cuit: cuit.valor, organizacion: 'Pérez SRL', nombre: 'facturador' },
      firmador,
    );
    const texto = new TextDecoder().decode(desdePem('CERTIFICATE REQUEST', pem));

    expect(texto).toContain('AR');
    expect(texto).toContain('Pérez SRL');
    expect(texto).toContain('facturador');
    expect(texto).toContain('CUIT 20123456786');
  });
});
