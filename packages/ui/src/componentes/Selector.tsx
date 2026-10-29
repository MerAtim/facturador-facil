import { useState } from 'react';
import { View } from 'react-native';
import { Menu, TextInput, TouchableRipple } from 'react-native-paper';

import type { Opcion } from './SelectorSegmentado';

/** Márgenes del ítem y lugar del ícono de la opción elegida. */
const ESPACIO_DEL_ICONO = 56;

const INICIO = { start: 0, end: 0 };

/** Elección de una opción en una lista que se despliega, para cuando son demasiadas para verlas juntas. */
export function Selector<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
}: {
  readonly etiqueta: string;
  readonly opciones: readonly Opcion<T>[];
  readonly valor: T;
  readonly onCambiar: (valor: T) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ancho, setAncho] = useState(0);
  const elegida = opciones.find((opcion) => opcion.valor === valor)?.etiqueta ?? '';

  return (
    <Menu
      visible={abierto}
      onDismiss={() => {
        setAbierto(false);
      }}
      anchorPosition="bottom"
      anchor={
        <TouchableRipple
          onPress={() => {
            setAbierto(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${etiqueta}: ${elegida}`}
          onLayout={(evento) => {
            setAncho(evento.nativeEvent.layout.width);
          }}
        >
          {/* Se ve como los demás campos, pero el toque y la lectura los recibe el contenedor. */}
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <TextInput
              mode="outlined"
              label={etiqueta}
              value={elegida}
              editable={false}
              // Si el texto no entra, Android lo desplaza hasta el final y se come el principio:
              // con la fuente grande se leía "Jnidades". Así queda a la vista el comienzo.
              selection={INICIO}
              right={<TextInput.Icon icon={abierto ? 'menu-up' : 'menu-down'} />}
            />
          </View>
        </TouchableRipple>
      }
    >
      {opciones.map((opcion) => (
        <Menu.Item
          key={opcion.valor}
          title={opcion.etiqueta}
          {...(opcion.valor === valor ? { leadingIcon: 'check' } : {})}
          // Paper limita el ancho de los ítems; como desplegable, la lista mide lo mismo que el campo.
          style={{ width: ancho, maxWidth: ancho }}
          contentStyle={{ maxWidth: Math.max(0, ancho - ESPACIO_DEL_ICONO) }}
          onPress={() => {
            setAbierto(false);
            onCambiar(opcion.valor);
          }}
        />
      ))}
    </Menu>
  );
}
