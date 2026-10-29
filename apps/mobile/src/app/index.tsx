import type { PasoDeAlta } from '@facturador/aplicacion';
import { Aviso, Boton, Pantalla, Texto, useTema } from '@facturador/ui';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAlta } from '../alta/useAlta';
import { AvisoDeVencimiento } from '../alta/AvisoDeVencimiento';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useProteccion } from '../seguridad/Bloqueo';

const PENDIENTE: Readonly<Record<PasoDeAlta, string>> = {
  datos: 'cargar tus datos de emisor',
  certificado: 'cargar el certificado de ARCA',
  autorizacion: 'autorizar la factura electrónica en ARCA',
  punto_de_venta: 'crear el punto de venta en ARCA',
  verificacion: 'verificar con ARCA',
};

export default function Inicio() {
  const router = useRouter();
  const { espacio } = useTema();
  const [guia] = useAlta();
  const protegida = useProteccion();

  const irAConfiguracion = () => {
    router.push('/configuracion');
  };
  const irALaGuia = () => {
    router.push('/alta');
  };
  const irAlRespaldo = () => {
    router.push('/respaldo');
  };

  const configuracion = guia.estado === 'lista' ? guia.configuracion : undefined;
  const pendiente = guia.estado === 'lista' ? guia.alta.actual : undefined;
  const vigenteHasta = guia.estado === 'lista' ? guia.vigenteHasta : undefined;

  return (
    <Pantalla style={[estilos.contenedor, { padding: espacio.normal, gap: espacio.grande }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Texto variante="titulo">Facturador Fácil</Texto>

      {!protegida && (
        <Aviso icono="shield-alert-outline" tono="error">
          Tu teléfono no tiene bloqueo de pantalla, así que cualquiera que lo tenga puede usar la
          app con tus datos. Configurá un PIN o tu huella en los ajustes del teléfono.
        </Aviso>
      )}

      {guia.estado === 'no_disponible' && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se pudieron leer tus datos. Desbloqueá el teléfono y volvé a abrir la app.
        </Aviso>
      )}

      {guia.estado === 'lista' && !configuracion && (
        <View style={[estilos.centrado, { gap: espacio.normal }]}>
          <Texto variante="cuerpo" style={estilos.texto}>
            Para facturar desde el teléfono hay que dejar todo listo con ARCA. La app te guía paso a
            paso.
          </Texto>
          <Boton icon="arrow-right" onPress={irALaGuia}>
            Empezar
          </Boton>
          <Boton variante="texto" icon="backup-restore" onPress={irAlRespaldo}>
            Restaurar un respaldo
          </Boton>
        </View>
      )}

      {configuracion && (
        <View style={[estilos.centrado, { gap: espacio.normal }]}>
          <AvisoDeAmbiente ambiente={configuracion.ambiente} />
          {vigenteHasta && (
            <AvisoDeVencimiento
              vigenteHasta={vigenteHasta}
              onRenovar={() => {
                router.push('/certificado');
              }}
            />
          )}
          {!configuracion.emisor.datos.ingresosBrutos && (
            <Aviso icono="information-outline">
              Falta tu número de Ingresos Brutos, que va impreso en cada factura. Cargalo en los
              datos del emisor.
            </Aviso>
          )}
          <Texto variante="subtitulo">{configuracion.emisor.datos.razonSocial}</Texto>
          {pendiente && (
            <>
              <Texto variante="cuerpo" style={estilos.texto}>
                Para facturar te falta {PENDIENTE[pendiente]}.
              </Texto>
              <Boton icon="arrow-right" onPress={irALaGuia}>
                Seguir con la puesta en marcha
              </Boton>
            </>
          )}
          <Boton
            variante={pendiente ? 'secundario' : 'principal'}
            icon="plus"
            onPress={() => {
              router.push('/nueva-factura');
            }}
          >
            Nueva factura
          </Boton>
          <Boton
            variante="secundario"
            icon="file-document-multiple-outline"
            onPress={() => {
              router.push('/comprobantes');
            }}
          >
            Comprobantes
          </Boton>
          <Boton
            variante="secundario"
            icon="account-multiple-outline"
            onPress={() => {
              router.push('/clientes');
            }}
          >
            Clientes
          </Boton>
          <Boton variante="texto" onPress={irAConfiguracion}>
            Datos del emisor
          </Boton>
          <Boton
            variante="texto"
            onPress={() => {
              router.push('/certificado');
            }}
          >
            Certificado
          </Boton>
          <Boton variante="texto" onPress={irAlRespaldo}>
            Respaldo
          </Boton>
          {!pendiente && (
            <Boton variante="texto" onPress={irALaGuia}>
              Puesta en marcha
            </Boton>
          )}
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
