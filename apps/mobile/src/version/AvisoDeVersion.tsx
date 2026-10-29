import { Aviso, Boton, useTema } from '@facturador/ui';
import { Linking, Platform, View } from 'react-native';

const FICHA_EN_LA_TIENDA = 'https://play.google.com/store/apps/details?id=com.facturadorfacil.app';

/** Por qué no se puede emitir con esta versión, y cómo seguir. */
export function AvisoDeVersion() {
  const { espacio } = useTema();
  return (
    <View style={{ gap: espacio.chico, alignSelf: 'stretch' }}>
      <Aviso icono="update" tono="error">
        Esta versión de la app tiene un problema grave y ya no puede emitir. Actualizala para seguir
        facturando. Tus comprobantes, clientes y respaldos siguen disponibles.
      </Aviso>
      {/* En iOS la app todavía no está en la tienda. */}
      {Platform.OS === 'android' && (
        <Boton icon="open-in-new" onPress={() => void Linking.openURL(FICHA_EN_LA_TIENDA)}>
          Actualizar la app
        </Boton>
      )}
    </View>
  );
}
