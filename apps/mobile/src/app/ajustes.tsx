import { FechaCalendario } from '@facturador/dominio';
import { Pantalla, useTema } from '@facturador/ui';
import { Stack, useRouter, type Href } from 'expo-router';
import { ScrollView } from 'react-native';

import { useAlta } from '../alta/useAlta';
import { Opcion } from '../inicio/Opcion';

/** Lo que se configura una vez o muy de vez en cuando, fuera del inicio. */
export default function Ajustes() {
  const { espacio } = useTema();
  const router = useRouter();
  const [guia] = useAlta();

  const vigenteHasta = guia.estado === 'lista' ? guia.vigenteHasta : undefined;
  const pendiente = guia.estado === 'lista' ? guia.alta.actual : undefined;
  const ir = (destino: Href) => () => {
    router.push(destino);
  };

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Ajustes' }} />
      <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.medio }}>
        <Opcion
          icono="card-account-details-outline"
          titulo="Datos del emisor"
          descripcion="Razón social, domicilio, punto de venta, Ingresos Brutos y logo."
          onPress={ir('/configuracion')}
        />
        <Opcion
          icono="certificate-outline"
          titulo="Certificado de ARCA"
          descripcion={
            vigenteHasta
              ? `Vence el ${FechaCalendario.enArgentina(vigenteHasta).formatear()}.`
              : 'Todavía no está cargado.'
          }
          onPress={ir('/certificado')}
        />
        <Opcion
          icono="backup-restore"
          titulo="Respaldo"
          descripcion="Guardá tus datos cifrados para recuperarlos en otro teléfono."
          onPress={ir('/respaldo')}
        />
        <Opcion
          icono="check-decagram-outline"
          titulo="Puesta en marcha"
          descripcion={
            pendiente
              ? 'Falta completar pasos para facturar.'
              : 'Todo listo con ARCA. Volvé a verificar si cambiaste algo.'
          }
          onPress={ir('/alta')}
        />
      </ScrollView>
    </Pantalla>
  );
}
