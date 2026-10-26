import { describe, expect, it } from 'vitest';

import { buscar, leerXml } from './xml';

function leer(texto: string) {
  const resultado = leerXml(texto);
  if (!resultado.ok) throw new Error(resultado.error.motivo);
  return resultado.valor;
}

describe('leerXml', () => {
  it('quita los prefijos de espacio de nombres e ignora la declaración XML', () => {
    const sobre = leer(
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="x"><soap:Body><a>1</a></soap:Body></soap:Envelope>',
    );

    expect(sobre.nombre).toBe('Envelope');
    expect(buscar(sobre, 'Body', 'a')?.texto).toBe('1');
  });

  it('decodifica las entidades predefinidas y las referencias numéricas', () => {
    const elemento = leer('<a>&lt;b&gt; &amp;amp; &quot;&apos; &#65;&#x42; &#x110000; &nbsp;</a>');

    expect(elemento.texto).toBe('<b> &amp; "\' AB &#x110000; &nbsp;');
  });

  it('no trata como vacías las etiquetas que en HTML lo son', () => {
    expect(buscar(leer('<a><input>valor</input></a>'), 'input')?.texto).toBe('valor');
  });

  it('rechaza XML mal formado', () => {
    expect(leerXml('<a><b></a>')).toEqual({
      ok: false,
      error: { tipo: 'xml_invalido', motivo: 'mal_formado' },
    });
    expect(leerXml('solo texto')).toEqual({
      ok: false,
      error: { tipo: 'xml_invalido', motivo: 'mal_formado' },
    });
  });

  it.each([
    [
      'entidades externas',
      '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>',
    ],
    [
      'expansión exponencial de entidades',
      '<!DOCTYPE a [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><a>&b;</a>',
    ],
    ['una DTD externa', '<!doctype a SYSTEM "http://atacante/dtd"><a/>'],
  ])('rechaza un documento con %s', (_, texto) => {
    expect(leerXml(texto)).toEqual({
      ok: false,
      error: { tipo: 'xml_invalido', motivo: 'dtd_no_permitida' },
    });
  });

  it('no expande una entidad no declarada', () => {
    expect(leer('<a>&xxe;</a>').texto).toBe('&xxe;');
  });
});

describe('buscar', () => {
  it('devuelve undefined si algún tramo de la ruta no existe', () => {
    expect(buscar(leer('<a><b/></a>'), 'b', 'c')).toBeUndefined();
  });
});
