import { ProveedorDeTema, useTema } from '@facturador/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';

import { importarClientesDeAntes, preparacionDePrueba, registro } from '../composicion';
import { ProveedorDeBloqueo } from '../seguridad/Bloqueo';
import { protegerLaPantalla } from '../seguridad/privacidadEnPantalla';
import { protegerElTeclado } from '../seguridad/tecladoPrivado';

export default function LayoutRaiz() {
  // Solo el build de las pruebas espera algo: cargar el emisor de prueba antes de la primera pantalla.
  const [preparada, setPreparada] = useState(preparacionDePrueba === undefined);

  useEffect(() => {
    preparacionDePrueba
      ?.catch((error: unknown) => {
        registro.error('no se pudo preparar el emisor de prueba', error);
      })
      .finally(() => {
        setPreparada(true);
      });
  }, []);

  useEffect(() => {
    void protegerLaPantalla();
    protegerElTeclado();
    importarClientesDeAntes();
  }, []);

  return (
    <ProveedorDeTema>
      <ProveedorDeBloqueo>{preparada && <Navegacion />}</ProveedorDeBloqueo>
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
