import type { ComprobanteEmitido } from '@facturador/aplicacion';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { comprobantesEmitidos, registro } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';
import { claveDe } from './claveDelComprobante';

export type EstadoDelComprobante =
  | { readonly paso: 'cargando' }
  | {
      readonly paso: 'listo';
      readonly emitido: ComprobanteEmitido;
      /** Las notas de crédito que ajustan la factura. Vacío si es una nota. */
      readonly notas: readonly ComprobanteEmitido[];
    }
  | { readonly paso: 'no_encontrado' };

/** El comprobante que indican los parámetros de la pantalla, con sus notas de crédito. */
export function useComprobanteEmitido(): EstadoDelComprobante {
  const parametros = useLocalSearchParams();
  const configuracion = useConfiguracion();
  const [estado, setEstado] = useState<EstadoDelComprobante>({ paso: 'cargando' });

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const { tipo, puntoDeVenta, numero } = claveDe(parametros) ?? {};

  useEffect(() => {
    if (!configurada) return;
    if (!tipo || puntoDeVenta === undefined || numero === undefined) {
      setEstado({ paso: 'no_encontrado' });
      return;
    }
    // Si cambian los parámetros antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true;
    const clave = {
      ambiente: configurada.ambiente,
      emisor: configurada.emisor,
      tipo,
      puntoDeVenta,
      numero,
    };
    Promise.all([
      comprobantesEmitidos.leer(clave),
      tipo.naturaleza === 'factura' ? comprobantesEmitidos.notasDeCreditoDe(clave) : [],
    ]).then(
      ([emitido, notas]) => {
        if (!vigente) return;
        setEstado(emitido ? { paso: 'listo', emitido, notas } : { paso: 'no_encontrado' });
      },
      (error: unknown) => {
        registro.error('no se pudo leer el comprobante', error);
        if (vigente) setEstado({ paso: 'no_encontrado' });
      },
    );
    return () => {
      vigente = false;
    };
  }, [configurada, tipo, puntoDeVenta, numero]);

  return estado;
}
