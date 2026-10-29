import { ProveedorDeTema, useTema } from '@facturador/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { importarClientesDeAntes } from '../composicion';
import { ProveedorDeBloqueo } from '../seguridad/Bloqueo';
import { protegerLaPantalla } from '../seguridad/privacidadEnPantalla';
import { protegerElTeclado } from '../seguridad/tecladoPrivado';

export default function LayoutRaiz() {
  useEffect(() => {
    void protegerLaPantalla();
    protegerElTeclado();
    importarClientesDeAntes();
  }, []);

  return (
    <ProveedorDeTema>
      <ProveedorDeBloqueo>
        <Navegacion />
      </ProveedorDeBloqueo>
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
          // Encabezado nativo de cada plataforma, con los colores del tema.
          headerStyle: { backgroundColor: colores.background },
          headerTintColor: colores.onSurface,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colores.background },
        }}
      />
      <StatusBar style="auto" />
    </>
  );
}
