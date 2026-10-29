import type { EstadoDeVersion } from '@facturador/aplicacion';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { controlDeVersion } from '../composicion';

/**
 * Si la versión instalada todavía puede emitir. Se vuelve a consultar al ganar el foco y al volver
 * a la app, que puede quedar abierta días; el control evita repetir el pedido seguido.
 */
export function useVersion(): EstadoDeVersion | undefined {
  const [estado, setEstado] = useState<EstadoDeVersion>();

  const consultar = useCallback(() => {
    let vigente = true;
    void controlDeVersion.consultar().then((nuevo) => {
      if (vigente) setEstado(nuevo);
    });
    return () => {
      vigente = false;
    };
  }, []);

  useFocusEffect(consultar);

  useEffect(() => {
    let cancelar: (() => void) | undefined;
    const suscripcion = AppState.addEventListener('change', (actual) => {
      if (actual !== 'active') return;
      cancelar?.();
      cancelar = consultar();
    });
    return () => {
      cancelar?.();
      suscripcion.remove();
    };
  }, [consultar]);

  return estado;
}
