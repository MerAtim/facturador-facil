import type { Ambiente } from '@facturador/aplicacion';
import { Aviso } from '@facturador/ui';

/** En homologación lo emitido no vale: tiene que verse siempre, para no confundirlo con lo real. */
export function AvisoDeAmbiente({ ambiente }: { readonly ambiente: Ambiente }) {
  if (ambiente === 'produccion') return null;
  return (
    <Aviso icono="flask-outline">
      Homologación: lo que emitas es de prueba y no tiene validez fiscal.
    </Aviso>
  );
}
