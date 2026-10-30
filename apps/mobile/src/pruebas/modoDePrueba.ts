import type { RepositorioDeConfiguracion } from '@facturador/aplicacion';
import {
  aliasDeClave,
  firmadorDeClave,
  type AlmacenDeCertificados,
  type AlmacenDeClaves,
} from '@facturador/arca';
import { crearCertificadoDePrueba, crearDobleDeArca } from '@facturador/arca/doble';
import { Cuit, Emisor, FechaCalendario } from '@facturador/dominio';

/**
 * Solo existe en el build de las pruebas de punta a punta (ver composicion.ts): ARCA simulado y un
 * emisor listo para facturar, así los flujos no dependen de ARCA ni de cargar un certificado.
 */
export const transporteDePrueba = crearDobleDeArca();

const AMBIENTE = 'homologacion';
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Carga el emisor de prueba si no hay ninguno. Nunca pisa una configuración existente. Si falla,
 * el mensaje dice en qué paso: el registro de la app no muestra el detalle de los errores.
 */
export async function prepararEmisorDePrueba(dependencias: {
  readonly configuracion: RepositorioDeConfiguracion;
  readonly certificados: AlmacenDeCertificados;
  readonly claves: AlmacenDeClaves;
}): Promise<void> {
  const paso = { actual: 'leer la configuración' };
  try {
    await preparar(dependencias, paso);
  } catch (error) {
    const causa = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo ${paso.actual}: ${causa}`, { cause: error });
  }
}

async function preparar(
  {
    configuracion,
    certificados,
    claves,
  }: {
    readonly configuracion: RepositorioDeConfiguracion;
    readonly certificados: AlmacenDeCertificados;
    readonly claves: AlmacenDeClaves;
  },
  paso: { actual: string },
): Promise<void> {
  if (await configuracion.leer()) return;

  const cuit = Cuit.crear('20123456786');
  const inicio = FechaCalendario.crear(2020, 3, 1);
  if (!cuit.ok || !inicio.ok) throw new Error('Datos del emisor de prueba inválidos');
  const emisor = Emisor.crear({
    razonSocial: 'Comercio de Prueba',
    cuit: cuit.valor,
    condicion: 'responsable_inscripto',
    domicilio: 'Av. Siempreviva 742, Rosario',
    inicioDeActividades: inicio.valor,
    puntoDeVenta: 1,
    ingresosBrutos: '901-123456-7',
  });
  if (!emisor.ok) throw new Error('Emisor de prueba inválido');

  const titular = { ambiente: AMBIENTE, cuit: cuit.valor } as const;
  const alias = aliasDeClave(titular);
  paso.actual = 'generar la clave';
  if (!claves.existeClave(alias)) await claves.generarClave(alias);
  paso.actual = 'firmar el certificado';
  const ahora = Date.now();
  const certificado = await crearCertificadoDePrueba(firmadorDeClave(claves, alias), {
    cuit: cuit.valor.valor,
    desde: new Date(ahora - UN_DIA_MS),
    hasta: new Date(ahora + 365 * UN_DIA_MS),
  });
  paso.actual = 'guardar el certificado';
  await certificados.guardar(titular, certificado);
  paso.actual = 'guardar la configuración';
  await configuracion.guardar({ emisor: emisor.valor, ambiente: AMBIENTE });
}
