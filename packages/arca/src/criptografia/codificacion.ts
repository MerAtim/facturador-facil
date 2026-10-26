// btoa y atob existen tanto en Hermes como en Node, pero trabajan con cadenas binarias.

export function aBase64(bytes: Uint8Array): string {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export function desdeBase64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto.replace(/\s/g, '')), (caracter) => caracter.charCodeAt(0));
}

export function aPem(etiqueta: string, der: Uint8Array): string {
  const lineas = aBase64(der).match(/.{1,64}/g) ?? [];
  return [`-----BEGIN ${etiqueta}-----`, ...lineas, `-----END ${etiqueta}-----`, ''].join('\n');
}

export function desdePem(etiqueta: string, pem: string): Uint8Array {
  const inicio = `-----BEGIN ${etiqueta}-----`;
  const desde = pem.indexOf(inicio);
  const hasta = pem.indexOf(`-----END ${etiqueta}-----`, desde);
  if (desde === -1 || hasta === -1) throw new Error(`No se encontró un bloque ${etiqueta}`);
  return desdeBase64(pem.slice(desde + inicio.length, hasta));
}
