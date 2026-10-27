import type { AlmacenSeguro } from '@facturador/aplicacion';

import { aBase64, desdeBase64 } from '../criptografia/codificacion';
import { leerCertificado } from './certificado';
import type { Titular } from './pedidoDeCertificado';

export interface CertificadoGuardado {
  readonly der: Uint8Array;
  readonly vigenteHasta: Date;
}

/**
 * El certificado de ARCA de cada ambiente y CUIT. No es secreto, pero va en el AlmacenSeguro
 * junto a lo demás que identifica al emisor y no se pierde si el sistema vacía la caché.
 */
export interface AlmacenDeCertificados {
  leer(titular: Pick<Titular, 'ambiente' | 'cuit'>): Promise<CertificadoGuardado | undefined>;
  guardar(titular: Pick<Titular, 'ambiente' | 'cuit'>, der: Uint8Array): Promise<void>;
}

const clave = ({ ambiente, cuit }: Pick<Titular, 'ambiente' | 'cuit'>) =>
  `certificado.${ambiente}.${cuit.valor}`;

export function crearAlmacenDeCertificados(almacen: AlmacenSeguro): AlmacenDeCertificados {
  return {
    async leer(titular) {
      const guardado = await almacen.leer(clave(titular));
      if (guardado === undefined) return undefined;
      try {
        const der = desdeBase64(guardado);
        const datos = leerCertificado(der);
        return datos ? { der, vigenteHasta: datos.vigenteHasta } : undefined;
      } catch {
        return undefined;
      }
    },
    guardar: (titular, der) => almacen.guardar(clave(titular), aBase64(der)),
  };
}
