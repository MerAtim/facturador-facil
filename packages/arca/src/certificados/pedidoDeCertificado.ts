import type { Ambiente } from '@facturador/aplicacion';
import type { Cuit } from '@facturador/dominio';

import { crearCsr } from '../criptografia/csr';
import type { Firmador } from '../criptografia/firmador';

/**
 * Las claves que custodia el dispositivo (Keystore o Keychain). La privada nunca sale de ahí
 * (ver ADR 0002): se pide la firma por alias.
 */
export interface AlmacenDeClaves {
  existeClave(alias: string): boolean;
  /** RSA de 2048 bits. Falla si el alias ya tiene una clave. */
  generarClave(alias: string): Promise<void>;
  /** SubjectPublicKeyInfo en DER. */
  clavePublica(alias: string): Promise<Uint8Array>;
  firmar(alias: string, datos: Uint8Array): Promise<Uint8Array>;
}

/** Quien pide el certificado, en un ambiente. Cada ambiente y CUIT tiene su propia clave. */
export interface Titular {
  readonly ambiente: Ambiente;
  readonly cuit: Cuit;
  readonly razonSocial: string;
}

/** Nombre con el que el certificado aparece en ARCA, en "Administración de certificados digitales". */
const NOMBRE_DEL_CERTIFICADO = 'facturadorfacil';

export const aliasDeClave = ({ ambiente, cuit }: Pick<Titular, 'ambiente' | 'cuit'>) =>
  `facturador.${ambiente}.${cuit.valor}`;

export const firmadorDeClave = (claves: AlmacenDeClaves, alias: string): Firmador => ({
  clavePublica: () => claves.clavePublica(alias),
  firmar: (datos) => claves.firmar(alias, datos),
});

const generando = new Map<string, Promise<void>>();

/**
 * El pedido de certificado (CSR) en PEM. La primera vez genera la clave; después reutiliza la
 * misma, así el pedido sigue sirviendo si el usuario lo vuelve a pedir.
 */
export async function crearPedidoDeCertificado(
  titular: Titular,
  claves: AlmacenDeClaves,
): Promise<string> {
  const alias = aliasDeClave(titular);
  await asegurarClave(alias, claves);
  return crearCsr(
    { cuit: titular.cuit, organizacion: titular.razonSocial, nombre: NOMBRE_DEL_CERTIFICADO },
    firmadorDeClave(claves, alias),
  );
}

export const nombreDelArchivoDePedido = ({ ambiente, cuit }: Titular) =>
  `pedido-${cuit.valor}-${ambiente}.csr`;

/** Dos pedidos a la vez no deben generar dos claves: el segundo espera al primero. */
async function asegurarClave(alias: string, claves: AlmacenDeClaves): Promise<void> {
  const enCurso = generando.get(alias);
  if (enCurso) return enCurso;
  if (claves.existeClave(alias)) return;

  const generacion = claves.generarClave(alias).finally(() => generando.delete(alias));
  generando.set(alias, generacion);
  return generacion;
}
