import { Boton } from '@facturador/ui';
import { Linking } from 'react-native';

import { registro } from '../composicion';

/** El ingreso con clave fiscal sirve para los dos ambientes: WSASS también está detrás de él. */
const INGRESO_CON_CLAVE_FISCAL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/** Abre el sitio de ARCA en el navegador, para hacer los pasos desde el mismo teléfono. */
export function AbrirElSitioDeArca() {
  return (
    <Boton
      variante="secundario"
      icon="open-in-new"
      onPress={() => {
        Linking.openURL(INGRESO_CON_CLAVE_FISCAL).catch((error: unknown) => {
          registro.error('no se pudo abrir el sitio de arca', error);
        });
      }}
    >
      Abrir el sitio de ARCA
    </Boton>
  );
}
