import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Inicio() {
  return (
    <SafeAreaView style={estilos.contenedor}>
      <Text style={estilos.titulo}>Facturador Fácil</Text>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 24,
    fontWeight: '600',
  },
});
