import { exito, fallo, type Resultado } from '@facturador/dominio';
// La entrada principal de txml importa node:stream, que no existe en React Native.
import { isElementNode, parse, type TNode } from 'txml/txml';

export interface ElementoXml {
  /** Nombre sin prefijo de espacio de nombres: `soap:Body` queda como `Body`. */
  readonly nombre: string;
  readonly hijos: readonly ElementoXml[];
  /** Texto directo del elemento, con las entidades predefinidas ya decodificadas. */
  readonly texto: string;
}

export interface XmlInvalido {
  readonly tipo: 'xml_invalido';
  readonly motivo: 'dtd_no_permitida' | 'mal_formado';
}

// Ninguna respuesta de ARCA trae DTD. Rechazarla corta de raíz XXE y bombas de entidades,
// aunque txml tampoco las procesaría.
const DECLARACION_DTD = /<!(?:DOCTYPE|ENTITY)/i;

export function leerXml(texto: string): Resultado<ElementoXml, XmlInvalido> {
  if (DECLARACION_DTD.test(texto)) return invalido('dtd_no_permitida');

  let nodos: (TNode | string)[];
  try {
    // Sin etiquetas vacías por defecto: esas son reglas de HTML, no de XML.
    nodos = parse(texto, { selfClosingTags: [] });
  } catch {
    return invalido('mal_formado');
  }

  const raiz = nodos.filter(isElementNode).find((nodo) => !nodo.tagName.startsWith('?'));
  return raiz ? exito(convertir(raiz)) : invalido('mal_formado');
}

/** Sigue una ruta de hijos directos por nombre, por ejemplo `buscar(sobre, 'Body', 'Fault')`. */
export function buscar(elemento: ElementoXml, ...ruta: string[]): ElementoXml | undefined {
  let actual: ElementoXml | undefined = elemento;
  for (const nombre of ruta) actual = actual?.hijos.find((hijo) => hijo.nombre === nombre);
  return actual;
}

const invalido = (motivo: XmlInvalido['motivo']) =>
  fallo<XmlInvalido>({ tipo: 'xml_invalido', motivo });

function convertir(nodo: TNode): ElementoXml {
  return {
    nombre: nodo.tagName.replace(/^[^:]*:/, ''),
    hijos: nodo.children.filter(isElementNode).map(convertir),
    texto: decodificar(nodo.children.filter((hijo) => typeof hijo === 'string').join('')),
  };
}

const PREDEFINIDAS: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

function decodificar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entidad, nombre: string) => {
    if (!nombre.startsWith('#')) return PREDEFINIDAS[nombre] ?? entidad;
    const codigo =
      nombre[1] === 'x' ? parseInt(nombre.slice(2), 16) : parseInt(nombre.slice(1), 10);
    return codigo <= 0x10ffff ? String.fromCodePoint(codigo) : entidad;
  });
}

/** Para insertar texto en un XML armado a mano. Se aplica a todo valor, aunque parezca inofensivo. */
export function escaparXml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
