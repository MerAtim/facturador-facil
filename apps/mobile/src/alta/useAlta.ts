import {
  estadoDeAlta,
  PROGRESO_INICIAL,
  type Configuracion,
  type EstadoDeAlta,
  type ProgresoDeAlta,
} from '@facturador/aplicacion';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { almacenDeCertificados, registroDeAlta } from '../composicion';
import { repositorioDeConfiguracion } from '../configuracion/configuracion';

export type EstadoDeLaGuia =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'no_disponible' }
  | {
      readonly estado: 'lista';
      readonly configuracion: Configuracion | undefined;
      readonly progreso: ProgresoDeAlta;
      readonly alta: EstadoDeAlta;
      /** Cuándo vence el certificado cargado, para avisar con tiempo. */
      readonly vigenteHasta?: Date;
    };

async function leer(): Promise<EstadoDeLaGuia> {
  const configuracion = await repositorioDeConfiguracion.leer();
  if (!configuracion) {
    const progreso = PROGRESO_INICIAL;
    const alta = estadoDeAlta({ ambiente: 'homologacion', conCertificado: false, progreso });
    return { estado: 'lista', configuracion, progreso, alta };
  }

  const { ambiente, emisor } = configuracion;
  const titular = { ambiente, cuit: emisor.datos.cuit };
  const [certificado, progreso] = await Promise.all([
    almacenDeCertificados.leer(titular).catch(() => undefined),
    registroDeAlta.leer(titular),
  ]);
  const alta = estadoDeAlta({
    ambiente,
    puntoDeVenta: emisor.datos.puntoDeVenta,
    conCertificado: certificado !== undefined,
    progreso,
  });
  return {
    estado: 'lista',
    configuracion,
    progreso,
    alta,
    ...(certificado && { vigenteHasta: certificado.vigenteHasta }),
  };
}

/**
 * Dónde está el usuario en la puesta en marcha. Se vuelve a leer al ganar el foco, porque los datos
 * y el certificado se cargan en otras pantallas, y cuando se pide con `recargar`.
 */
export function useAlta(): readonly [EstadoDeLaGuia, () => void] {
  const [estado, setEstado] = useState<EstadoDeLaGuia>({ estado: 'cargando' });
  const [lectura, setLectura] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let vigente = true;
      leer().then(
        (leido) => {
          if (vigente) setEstado(leido);
        },
        () => {
          if (vigente) setEstado({ estado: 'no_disponible' });
        },
      );
      return () => {
        vigente = false;
      };
    }, [lectura]),
  );

  const recargar = useCallback(() => {
    setLectura((anterior) => anterior + 1);
  }, []);

  return [estado, recargar] as const;
}
