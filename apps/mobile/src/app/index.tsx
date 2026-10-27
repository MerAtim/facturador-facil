import { Pantalla, Texto } from '@facturador/ui';
import { StyleSheet } from 'react-native';

export default function Inicio() {
  return (
    <Pantalla style={estilos.contenedor}>
      <Texto variante="titulo">Facturador Fácil</Texto>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
