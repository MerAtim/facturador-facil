import { Boton, Pantalla, Texto, useTema } from '@facturador/ui';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

export default function Inicio() {
  const router = useRouter();
  const { espacio } = useTema();

  return (
    <Pantalla style={[estilos.contenedor, { gap: espacio.grande }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Texto variante="titulo">Facturador Fácil</Texto>
      <Boton
        icon="plus"
        onPress={() => {
          router.push('/nueva-factura');
        }}
      >
        Nueva factura
      </Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
