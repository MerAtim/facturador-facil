import { ProveedorDeTema, useTema } from '@facturador/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

export default function LayoutRaiz() {
  return (
    <ProveedorDeTema>
      <Navegacion />
    </ProveedorDeTema>
  );
}

function Navegacion() {
  const { colores } = useTema();

  // El fondo de la ventana se ve detrás de las transiciones y del teclado: tiene que seguir al tema.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colores.background);
  }, [colores.background]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colores.background },
        }}
      />
      <StatusBar style="auto" />
    </>
  );
}
