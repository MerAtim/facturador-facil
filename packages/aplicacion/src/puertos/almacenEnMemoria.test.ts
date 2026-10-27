import { describe, expect, it } from 'vitest';

import { AlmacenEnMemoria } from './almacenEnMemoria';

describe('AlmacenEnMemoria', () => {
  it('devuelve undefined para una clave sin valor', async () => {
    await expect(new AlmacenEnMemoria().leer('ticket.wsfe')).resolves.toBeUndefined();
  });

  it('guarda, reemplaza y borra valores', async () => {
    const almacen = new AlmacenEnMemoria();

    await almacen.guardar('ticket.wsfe', 'uno');
    await almacen.guardar('ticket.wsfe', 'dos');
    await expect(almacen.leer('ticket.wsfe')).resolves.toBe('dos');

    await almacen.borrar('ticket.wsfe');
    await expect(almacen.leer('ticket.wsfe')).resolves.toBeUndefined();
  });

  it('borrar una clave inexistente no falla', async () => {
    await expect(new AlmacenEnMemoria().borrar('nada')).resolves.toBeUndefined();
  });

  it.each(['', 'con espacio', 'ticket/wsfe', 'ñandú'])('rechaza la clave "%s"', async (clave) => {
    const almacen = new AlmacenEnMemoria();

    await expect(almacen.leer(clave)).rejects.toThrow('Clave de almacén inválida');
    await expect(almacen.guardar(clave, 'x')).rejects.toThrow('Clave de almacén inválida');
    await expect(almacen.borrar(clave)).rejects.toThrow('Clave de almacén inválida');
  });
});
