import {
  CondicionIvaReceptor,
  Cuit,
  exito,
  fallo,
  LARGO_MAXIMO_DOMICILIO,
  type MotivoCuitInvalido,
  type Resultado,
} from '@facturador/dominio';

import {
  escaparComodines,
  LARGO_MAXIMO_DE_LA_BUSQUEDA,
} from '../comprobantes/busquedaDeComprobantes';
import type { AlmacenSeguro } from '../puertos/almacenSeguro';
import type { BaseDeDatos, FilaSql } from '../puertos/baseDeDatos';

/** Un cliente se identifica con su CUIT: es lo que se informa a ARCA. */
export interface Cliente {
  readonly cuit: Cuit;
  readonly condicion: CondicionIvaReceptor;
  readonly nombre?: string;
  readonly domicilio?: string;
}

export const LARGO_MAXIMO_DEL_NOMBRE = 60;

export interface DatosDelCliente {
  readonly cuit: string;
  readonly condicion: CondicionIvaReceptor;
  readonly nombre: string;
  readonly domicilio: string;
}

export type ProblemaDelCliente =
  | { readonly tipo: 'cuit'; readonly motivo: MotivoCuitInvalido }
  | { readonly tipo: 'nombre_largo' }
  | { readonly tipo: 'domicilio_largo' };

/** Lo cargado en pantalla, validado con los mismos value objects que usa la factura. */
export function crearCliente(
  datos: DatosDelCliente,
): Resultado<Cliente, readonly ProblemaDelCliente[]> {
  const cuit = Cuit.crear(datos.cuit);
  const nombre = limpiar(datos.nombre);
  const domicilio = limpiar(datos.domicilio);
  const problemas: ProblemaDelCliente[] = [
    ...(cuit.ok ? [] : [{ tipo: 'cuit' as const, motivo: cuit.error.motivo }]),
    ...((nombre?.length ?? 0) > LARGO_MAXIMO_DEL_NOMBRE ? [{ tipo: 'nombre_largo' as const }] : []),
    ...((domicilio?.length ?? 0) > LARGO_MAXIMO_DOMICILIO
      ? [{ tipo: 'domicilio_largo' as const }]
      : []),
  ];
  if (!cuit.ok || problemas.length > 0) return fallo(problemas);
  return exito({
    cuit: cuit.valor,
    condicion: datos.condicion,
    ...(nombre !== undefined && { nombre }),
    ...(domicilio !== undefined && { domicilio }),
  });
}

/**
 * Los clientes, en la base cifrada del teléfono: son datos personales de terceros. Al facturar a un
 * CUIT nuevo se agrega solo, así la lista se arma sin cargarla a mano.
 */
export interface RepositorioDeClientes {
  /** Por parte del nombre, sin importar mayúsculas ni tildes, o por parte del CUIT. */
  buscar(texto: string, limite: number): Promise<readonly Cliente[]>;
  /** Los más usados primero; entre los que se usaron igual, el más reciente. */
  frecuentes(limite: number): Promise<readonly Cliente[]>;
  /** Todos, para el respaldo. */
  todos(): Promise<readonly Cliente[]>;
  leer(cuit: Cuit): Promise<Cliente | undefined>;
  /** Alta o edición. No cambia los usos. */
  guardar(cliente: Cliente): Promise<void>;
  /** Al emitir: lo agrega si no existe, actualiza sus datos y suma un uso. */
  registrarUso(cliente: Cliente): Promise<void>;
  borrar(cuit: Cuit): Promise<void>;
}

const GUARDAR = `
  INSERT INTO clientes (cuit, condicion, nombre, domicilio, busqueda, usos, ultimo_uso, creado_en)
  VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
  ON CONFLICT (cuit) DO UPDATE SET
    condicion = excluded.condicion,
    nombre = excluded.nombre,
    domicilio = excluded.domicilio,
    busqueda = excluded.busqueda
`;

const REGISTRAR_USO = `
  INSERT INTO clientes (cuit, condicion, nombre, domicilio, busqueda, usos, ultimo_uso, creado_en)
  VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT (cuit) DO UPDATE SET
    condicion = excluded.condicion,
    nombre = COALESCE(excluded.nombre, clientes.nombre),
    domicilio = COALESCE(excluded.domicilio, clientes.domicilio),
    busqueda = COALESCE(excluded.busqueda, clientes.busqueda),
    usos = clientes.usos + 1,
    ultimo_uso = excluded.ultimo_uso
`;

const BUSCAR = `
  SELECT cuit, condicion, nombre, domicilio FROM clientes
  WHERE ? IS NULL OR busqueda LIKE ? ESCAPE '\\' OR cuit LIKE ?
  ORDER BY nombre IS NULL, busqueda, cuit
  LIMIT ?
`;

const FRECUENTES = `
  SELECT cuit, condicion, nombre, domicilio FROM clientes
  WHERE usos > 0
  ORDER BY usos DESC, ultimo_uso DESC
  LIMIT ?
`;

const TODOS = `SELECT cuit, condicion, nombre, domicilio FROM clientes ORDER BY creado_en, cuit`;
const LEER = `SELECT cuit, condicion, nombre, domicilio FROM clientes WHERE cuit = ?`;
const BORRAR = `DELETE FROM clientes WHERE cuit = ?`;

export function crearRepositorioDeClientes(
  base: BaseDeDatos,
  ahora: () => number = Date.now,
): RepositorioDeClientes {
  const rearmar = (filas: readonly FilaSql[]) =>
    // Una fila que no se puede leer no tapa a las demás.
    filas.flatMap((fila) => {
      const cliente = desdeFila(fila);
      return cliente ? [cliente] : [];
    });
  const datos = ({ cuit, condicion, nombre, domicilio }: Cliente) => [
    cuit.valor,
    condicion.codigoArca,
    nombre ?? null,
    domicilio ?? null,
    nombre === undefined ? null : normalizar(nombre),
  ];

  return {
    async buscar(texto, limite) {
      const limpio = normalizar(texto.trim().slice(0, LARGO_MAXIMO_DE_LA_BUSQUEDA));
      const digitos = texto.replace(/[\s.-]/g, '');
      const patron = limpio === '' ? null : `%${escaparComodines(limpio)}%`;
      const delCuit = /^\d+$/.test(digitos) ? `%${digitos}%` : null;
      return rearmar(await base.consultar(BUSCAR, [patron, patron, delCuit, limite]));
    },
    async frecuentes(limite) {
      return rearmar(await base.consultar(FRECUENTES, [limite]));
    },
    async todos() {
      return rearmar(await base.consultar(TODOS));
    },
    async leer(cuit) {
      return rearmar(await base.consultar(LEER, [cuit.valor]))[0];
    },
    async guardar(cliente) {
      await base.ejecutar(GUARDAR, [...datos(cliente), ahora()]);
    },
    async registrarUso(cliente) {
      const momento = ahora();
      await base.ejecutar(REGISTRAR_USO, [...datos(cliente), momento, momento]);
    },
    async borrar(cuit) {
      await base.ejecutar(BORRAR, [cuit.valor]);
    },
  };
}

/** Lo guardado se valida como cualquier entrada. */
function desdeFila({ cuit, condicion, nombre, domicilio }: FilaSql): Cliente | undefined {
  const valido = typeof cuit === 'string' ? Cuit.crear(cuit) : undefined;
  const deIva =
    typeof condicion === 'number' ? CondicionIvaReceptor.desdeCodigoArca(condicion) : undefined;
  if (!valido?.ok || !deIva) return undefined;
  return {
    cuit: valido.valor,
    condicion: deIva,
    ...(typeof nombre === 'string' && { nombre }),
    ...(typeof domicilio === 'string' && { domicilio }),
  };
}

/** Sin caracteres de control: el nombre y el domicilio se muestran en pantalla y en el PDF. */
function limpiar(texto: string): string | undefined {
  const limpio = texto.replace(/\p{Cc}/gu, ' ').trim();
  return limpio === '' ? undefined : limpio;
}

/** Para buscar sin importar mayúsculas ni tildes: "Ferretería" se encuentra con "ferreteria". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const CLAVE_DE_LOS_FRECUENTES = 'receptores.frecuentes';

/**
 * Antes de la tabla de clientes, la app recordaba hasta 8 receptores en el almacén seguro. Se
 * pasan una vez a la tabla, en orden de uso, y se borran del almacén. Si algo falla, quedan ahí y
 * se intenta de nuevo la próxima vez.
 */
export async function importarClientesFrecuentes(
  almacen: AlmacenSeguro,
  clientes: RepositorioDeClientes,
): Promise<number> {
  const texto = await almacen.leer(CLAVE_DE_LOS_FRECUENTES);
  if (texto === undefined) return 0;
  const recordados = interpretarFrecuentes(texto);
  // Del menos usado al más usado: cada uso registrado lo pone más arriba.
  for (const { cliente, usos } of [...recordados].reverse()) {
    for (let uso = 0; uso < usos; uso++) await clientes.registrarUso(cliente);
  }
  await almacen.borrar(CLAVE_DE_LOS_FRECUENTES);
  return recordados.length;
}

function interpretarFrecuentes(texto: string): { cliente: Cliente; usos: number }[] {
  let lista: unknown;
  try {
    lista = JSON.parse(texto);
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .flatMap((registro: unknown) => {
      if (typeof registro !== 'object' || registro === null) return [];
      const { cuit, condicion, nombre, domicilio, usos, ultimoUso } = registro as Record<
        string,
        unknown
      >;
      const cliente =
        typeof cuit === 'string' && typeof condicion === 'number'
          ? desdeFila({
              cuit,
              condicion,
              nombre: typeof nombre === 'string' ? nombre : null,
              domicilio: typeof domicilio === 'string' ? domicilio : null,
            })
          : undefined;
      if (!cliente) return [];
      return [
        {
          cliente,
          // Alcanza con el orden: no hace falta repetir cientos de usos.
          usos: Math.min(Number.isSafeInteger(usos) ? Number(usos) : 1, 20),
          ultimoUso: Number.isSafeInteger(ultimoUso) ? Number(ultimoUso) : 0,
        },
      ];
    })
    .sort((a, b) => b.usos - a.usos || b.ultimoUso - a.ultimoUso)
    .map(({ cliente, usos }) => ({ cliente, usos }));
}
