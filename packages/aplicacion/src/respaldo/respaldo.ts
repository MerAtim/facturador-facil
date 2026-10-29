import {
  CondicionIvaReceptor,
  Cuit,
  exito,
  fallo,
  type Emisor,
  type Resultado,
} from '@facturador/dominio';

import type { RepositorioDeComprobantes } from '../comprobantes/comprobantesEmitidos';
import { aTextoGuardado, desdeTextoGuardado } from '../comprobantes/formatoGuardado';
import {
  configuracionATexto,
  configuracionDesdeTexto,
  type Ambiente,
  type RepositorioDeConfiguracion,
} from '../configuracion/configuracion';
import type { Cliente, RepositorioDeClientes } from '../clientes/clientes';

export const LARGO_MINIMO_DE_LA_CONTRASENA = 10;

export type MotivoRespaldoIlegible =
  | 'demasiado_grande'
  | 'no_es_un_respaldo'
  | 'version_desconocida'
  | 'costo_no_admitido'
  /** El cifrado no deja distinguir una contraseña equivocada de un archivo modificado. */
  | 'contrasena_incorrecta_o_archivo_danado';

export interface RespaldoIlegible {
  readonly tipo: 'respaldo_ilegible';
  readonly motivo: MotivoRespaldoIlegible;
}

/** Cifra el respaldo con una contraseña. El descifrado verifica la integridad antes de devolver. */
export interface CifradoDeRespaldos {
  cifrar(contenido: Uint8Array, contrasena: string): Promise<Uint8Array>;
  descifrar(
    archivo: Uint8Array,
    contrasena: string,
  ): Promise<Resultado<Uint8Array, RespaldoIlegible>>;
}

/** El logo del emisor como PNG en base64. Guardarlo lo vuelve a validar. */
export interface LogoDelRespaldo {
  leer(): Promise<string | undefined>;
  guardar(base64: string): Promise<void>;
}

export interface DependenciasDelRespaldo {
  readonly configuracion: RepositorioDeConfiguracion;
  readonly clientes: RepositorioDeClientes;
  readonly comprobantes: RepositorioDeComprobantes;
  readonly logo: LogoDelRespaldo;
  readonly cifrado: CifradoDeRespaldos;
  readonly ahora: () => Date;
}

export type ProblemaAlRespaldar =
  { readonly tipo: 'sin_configuracion' } | { readonly tipo: 'contrasena_corta' };

export type ProblemaAlRestaurar =
  | RespaldoIlegible
  | { readonly tipo: 'contenido_invalido' }
  /** El teléfono ya factura con otro CUIT: mezclar los datos de dos emisores no tiene sentido. */
  | { readonly tipo: 'otro_emisor'; readonly cuit: Cuit };

export interface Restaurado {
  /** Si el teléfono no tenía datos del emisor y se tomaron los del respaldo. */
  readonly configuracion: boolean;
  /** Los comprobantes del respaldo que quedaron guardados, nuevos o ya presentes. */
  readonly comprobantes: number;
  /** Los que no pasaron las validaciones y no se guardaron. */
  readonly descartados: number;
  /** Los clientes del respaldo que no estaban en el teléfono. */
  readonly clientes: number;
  readonly logo: boolean;
}

export interface Respaldo {
  crear(contrasena: string): Promise<Resultado<Uint8Array, ProblemaAlRespaldar>>;
  restaurar(
    archivo: Uint8Array,
    contrasena: string,
  ): Promise<Resultado<Restaurado, ProblemaAlRestaurar>>;
}

/**
 * El contenido descifrado. Solo tipos simples, en los mismos formatos que se guardan en el
 * teléfono, así restaurar pasa por las mismas validaciones que leer lo guardado.
 *
 * No incluye la clave privada, que no sale nunca del teléfono, ni el certificado, que sin ella no
 * sirve: en el teléfono nuevo se pide otro.
 */
interface Contenido {
  readonly formato: 1;
  readonly creadoEn: string;
  readonly cuit: string;
  readonly configuracion: string;
  readonly receptores: readonly {
    readonly cuit: string;
    readonly condicion: number;
    readonly nombre?: string;
    readonly domicilio?: string;
  }[];
  readonly comprobantes: readonly {
    readonly ambiente: string;
    readonly puntoDeVenta: number;
    readonly numero: number;
    readonly datos: string;
  }[];
  readonly logo?: string;
}

const AMBIENTES: readonly Ambiente[] = ['homologacion', 'produccion'];

export function crearRespaldo(dependencias: DependenciasDelRespaldo): Respaldo {
  const { configuracion, clientes, comprobantes, logo, cifrado, ahora } = dependencias;

  return {
    async crear(contrasena) {
      if (contrasena.length < LARGO_MINIMO_DE_LA_CONTRASENA) {
        return fallo({ tipo: 'contrasena_corta' });
      }
      const actual = await configuracion.leer();
      if (!actual) return fallo({ tipo: 'sin_configuracion' });

      const { emisor } = actual;
      const [emitidos, todosLosClientes, base64] = await Promise.all([
        comprobantes.todosDelEmisor(emisor),
        clientes.todos(),
        logo.leer().catch(() => undefined),
      ]);
      const contenido: Contenido = {
        formato: 1,
        creadoEn: ahora().toISOString(),
        cuit: emisor.datos.cuit.valor,
        configuracion: configuracionATexto(actual),
        receptores: todosLosClientes.map(({ cuit, condicion, nombre, domicilio }) => ({
          cuit: cuit.valor,
          condicion: condicion.codigoArca,
          ...(nombre !== undefined && { nombre }),
          ...(domicilio !== undefined && { domicilio }),
        })),
        // Se reescriben en el formato actual: lo guardado antes de la versión 2 suma el emisor.
        comprobantes: emitidos.map((emitido) => ({
          ambiente: emitido.ambiente,
          puntoDeVenta: emitido.puntoDeVenta,
          numero: emitido.numero,
          datos: aTextoGuardado(emitido),
        })),
        ...(base64 !== undefined && { logo: base64 }),
      };
      const texto = new TextEncoder().encode(JSON.stringify(contenido));
      return exito(await cifrado.cifrar(texto, contrasena));
    },

    async restaurar(archivo, contrasena) {
      const descifrado = await cifrado.descifrar(archivo, contrasena);
      if (!descifrado.ok) return descifrado;
      const contenido = interpretar(descifrado.valor);
      const cuit = contenido && Cuit.crear(contenido.cuit);
      const delRespaldo = contenido && configuracionDesdeTexto(contenido.configuracion);
      if (!contenido || !cuit?.ok || !delRespaldo) return fallo({ tipo: 'contenido_invalido' });
      if (delRespaldo.emisor.datos.cuit.valor !== cuit.valor.valor) {
        return fallo({ tipo: 'contenido_invalido' });
      }

      // Lo que ya hay en el teléfono no se pisa: el respaldo solo suma lo que falta.
      const actual = await configuracion.leer();
      if (actual && actual.emisor.datos.cuit.valor !== cuit.valor.valor) {
        return fallo({ tipo: 'otro_emisor', cuit: cuit.valor });
      }
      if (!actual) await configuracion.guardar(delRespaldo);
      const emisor = (actual ?? delRespaldo).emisor;

      const guardados = await restaurarComprobantes(contenido, emisor, comprobantes);
      let clientesNuevos = 0;
      for (const guardado of contenido.receptores) {
        const cliente = aCliente(guardado);
        // Un cliente que ya está en el teléfono conserva sus datos.
        if (!cliente || (await clientes.leer(cliente.cuit))) continue;
        await clientes.guardar(cliente);
        clientesNuevos++;
      }

      let conLogo = false;
      if (
        contenido.logo !== undefined &&
        (await logo.leer().catch(() => undefined)) === undefined
      ) {
        // Sin logo la factura sale igual: un logo que no pasa la validación no frena el resto.
        conLogo = await logo.guardar(contenido.logo).then(
          () => true,
          () => false,
        );
      }

      return exito({
        configuracion: !actual,
        comprobantes: guardados,
        descartados: contenido.comprobantes.length - guardados,
        clientes: clientesNuevos,
        logo: conLogo,
      });
    },
  };
}

/** Cada comprobante se valida como lo guardado en el teléfono, y tiene que ser del mismo emisor. */
async function restaurarComprobantes(
  contenido: Contenido,
  emisor: Emisor,
  comprobantes: RepositorioDeComprobantes,
): Promise<number> {
  let guardados = 0;
  for (const { ambiente, puntoDeVenta, numero, datos } of contenido.comprobantes) {
    const deAmbiente = AMBIENTES.find((a) => a === ambiente);
    const rearmado = deAmbiente && desdeTextoGuardado(datos, emisor);
    const enteros = Number.isSafeInteger(puntoDeVenta) && Number.isSafeInteger(numero);
    if (!deAmbiente || !rearmado || !enteros) continue;
    if (rearmado.emisor.datos.cuit.valor !== emisor.datos.cuit.valor) continue;
    // Guardar dos veces el mismo comprobante no lo duplica.
    await comprobantes.guardar({ ambiente: deAmbiente, puntoDeVenta, numero, ...rearmado });
    guardados++;
  }
  return guardados;
}

function aCliente(guardado: Contenido['receptores'][number]): Cliente | undefined {
  const cuit = typeof guardado.cuit === 'string' ? Cuit.crear(guardado.cuit) : undefined;
  const condicion =
    typeof guardado.condicion === 'number'
      ? CondicionIvaReceptor.desdeCodigoArca(guardado.condicion)
      : undefined;
  if (!cuit?.ok || !condicion) return undefined;
  return {
    cuit: cuit.valor,
    condicion,
    ...(typeof guardado.nombre === 'string' && { nombre: guardado.nombre }),
    ...(typeof guardado.domicilio === 'string' && { domicilio: guardado.domicilio }),
  };
}

/** Solo la forma general: cada parte se valida en detalle al restaurarla. */
function interpretar(bytes: Uint8Array): Contenido | undefined {
  try {
    const valor: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof valor !== 'object' || valor === null) return undefined;
    const { formato, cuit, configuracion, receptores, comprobantes, logo } = valor as Record<
      string,
      unknown
    >;
    const valido =
      formato === 1 &&
      typeof cuit === 'string' &&
      typeof configuracion === 'string' &&
      Array.isArray(receptores) &&
      receptores.every((r) => typeof r === 'object' && r !== null) &&
      Array.isArray(comprobantes) &&
      comprobantes.every(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as Record<string, unknown>)['datos'] === 'string',
      ) &&
      (logo === undefined || typeof logo === 'string');
    return valido ? (valor as Contenido) : undefined;
  } catch {
    return undefined;
  }
}
