import { Aviso, Boton, Pantalla, Texto, useTema } from '@facturador/ui';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useConfiguracion } from '../configuracion/configuracion';

export default function Inicio() {
  const router = useRouter();
  const { espacio } = useTema();
  const configuracion = useConfiguracion();

  const irAConfiguracion = () => {
    router.push('/configuracion');
  };

  return (
    <Pantalla style={[estilos.contenedor, { padding: espacio.normal, gap: espacio.grande }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Texto variante="titulo">Facturador Fácil</Texto>

      {configuracion.estado === 'no_disponible' && (
        <Aviso icono="alert-circle-outline">
          No se pudieron leer tus datos. Desbloqueá el teléfono y volvé a abrir la app.
        </Aviso>
      )}

      {configuracion.estado === 'lista' && !configuracion.configuracion && (
        <View style={[estilos.centrado, { gap: espacio.normal }]}>
          <Texto variante="cuerpo" style={estilos.texto}>
            Para empezar, cargá tus datos de emisor tal como figuran en ARCA.
          </Texto>
          <Boton icon="account-edit-outline" onPress={irAConfiguracion}>
            Cargar mis datos
          </Boton>
        </View>
      )}

      {configuracion.estado === 'lista' && configuracion.configuracion && (
        <View style={[estilos.centrado, { gap: espacio.normal }]}>
          <AvisoDeAmbiente ambiente={configuracion.configuracion.ambiente} />
          <Texto variante="subtitulo">{configuracion.configuracion.emisor.datos.razonSocial}</Texto>
          <Boton
            icon="plus"
            onPress={() => {
              router.push('/nueva-factura');
            }}
          >
            Nueva factura
          </Boton>
          <Boton variante="texto" onPress={irAConfiguracion}>
            Datos del emisor
          </Boton>
        </View>
      )}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centrado: { alignItems: 'center', alignSelf: 'stretch' },
  texto: { textAlign: 'center' },
});
