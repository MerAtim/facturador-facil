import { crearRepositorioDeConfiguracion, type Configuracion } from '@facturador/aplicacion';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { almacenSeguroDelDispositivo } from '../infraestructura/almacenSeguroDelDispositivo';

export const repositorioDeConfiguracion = crearRepositorioDeConfiguracion(
  almacenSeguroDelDispositivo,
);

export type EstadoDeConfiguracion =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'lista'; readonly configuracion: Configuracion | undefined }
  | { readonly estado: 'no_disponible' };

/** La configuración guardada. Se vuelve a leer cada vez que la pantalla gana el foco. */
export function useConfiguracion(): EstadoDeConfiguracion {
  const [estado, setEstado] = useState<EstadoDeConfiguracion>({ estado: 'cargando' });

  useFocusEffect(
    useCallback(() => {
      let vigente = true;
      repositorioDeConfiguracion.leer().then(
        (configuracion) => {
          if (vigente) setEstado({ estado: 'lista', configuracion });
        },
        () => {
          if (vigente) setEstado({ estado: 'no_disponible' });
        },
      );
      return () => {
        vigente = false;
      };
    }, []),
  );

  return estado;
}
