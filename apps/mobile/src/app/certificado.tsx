import { avisoDeVencimiento, type Ambiente } from '@facturador/aplicacion';
import { aliasDeClave, type CertificadoGuardado, type Titular } from '@facturador/arca';
import { FechaCalendario } from '@facturador/dominio';
import { Boton, Cargando, Pantalla, Tarjeta, Texto, useTema } from '@facturador/ui';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AvisoDeVencimiento } from '../alta/AvisoDeVencimiento';
import { BotonesDeCarga, useCargaDeCertificado } from '../alta/cargaDeCertificado';
import {
  GuardarElPedido,
  PrepararElPedido,
  usePedidoDeCertificado,
} from '../alta/pedidoDeCertificado';
import { AbrirElSitioDeArca } from '../alta/sitioDeArca';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useConfiguracion } from '../configuracion/configuracion';
import { almacenDeCertificados } from '../composicion';

const DONDE_SUBIRLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'En ARCA, entrá con tu clave fiscal a "WSASS - Autogestión Certificados Homologación", creá un certificado nuevo y pegá o subí el pedido.',
  produccion:
    'En ARCA, entrá con tu clave fiscal a "Administración de Certificados Digitales", agregá un alias y subí el archivo del pedido.',
};

/** Renovar es pedir otro certificado con la misma clave, para el mismo alias de ARCA. */
const DONDE_RENOVARLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'En ARCA, entrá con tu clave fiscal a "WSASS - Autogestión Certificados Homologación", creá un certificado nuevo y pegá o subí el pedido.',
  produccion:
    'En ARCA, entrá con tu clave fiscal a "Administración de Certificados Digitales", elegí el alias que ya usás con la app, tocá "Agregar certificado" y subí el pedido. Con el mismo alias no hace falta volver a autorizar la factura electrónica.',
};

const COMO_CARGARLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'WSASS te muestra el certificado como texto: copialo entero, desde BEGIN CERTIFICATE hasta END CERTIFICATE, y pegalo acá. Si lo guardaste como archivo, cargalo.',
  produccion: 'Descargá el certificado que te da ARCA y cargalo acá.',
};

export default function Certificado() {
  const { espacio } = useTema();
  const router = useRouter();
  const configuracion = useConfiguracion();
  const [certificado, setCertificado] = useState<CertificadoGuardado>();

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const titular: Titular | undefined = configurada && {
    ambiente: configurada.ambiente,
    cuit: configurada.emisor.datos.cuit,
    razonSocial: configurada.emisor.datos.razonSocial,
  };

  const pedido = usePedidoDeCertificado(titular);
  const carga = useCargaDeCertificado(titular, setCertificado);

  // Al cambiar el titular, que se identifica por el alias, se lee su certificado.
  const alias = titular && aliasDeClave(titular);
  useEffect(() => {
    if (!titular || !alias) return;
    void almacenDeCertificados.leer(titular).then(setCertificado, () => undefined);
  }, [alias]);

  if (configuracion.estado === 'lista' && !configurada) return <Redirect href="/configuracion" />;

  // Cerca del vencimiento, o ya vencido, se muestran los pasos para renovarlo.
  const renovar =
    certificado !== undefined &&
    avisoDeVencimiento(certificado.vigenteHasta, new Date()).tipo !== 'vigente';
  const mostrarPedido = !certificado || renovar;

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Certificado' }} />
      {configuracion.estado === 'cargando' && <Cargando />}
      {titular && (
        <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
          <AvisoDeAmbiente ambiente={titular.ambiente} />

          {certificado ? (
            <Tarjeta>
              <Texto variante="subtitulo">Certificado cargado</Texto>
              <Texto variante="cuerpo">
                Vence el {FechaCalendario.enArgentina(certificado.vigenteHasta).formatear()}.
              </Texto>
              <AvisoDeVencimiento vigenteHasta={certificado.vigenteHasta} />
              {/* Al renovar, la carga va al final de los pasos. */}
              {!renovar && (
                <BotonesDeCarga carga={carga} ambiente={titular.ambiente} hayCertificado />
              )}
            </Tarjeta>
          ) : (
            <>
              <Texto variante="cuerpo">
                Para facturar, ARCA te da un certificado a partir de un pedido que genera la app. La
                clave del pedido se crea en este teléfono y nunca sale de él.
              </Texto>
              <Boton
                variante="texto"
                icon="shield-check-outline"
                onPress={() => {
                  router.push('/sobre-el-certificado');
                }}
              >
                Qué puede hacer el certificado
              </Boton>
            </>
          )}

          {mostrarPedido && <PrepararElPedido pedido={pedido} />}

          {mostrarPedido && pedido.estado.paso === 'listo' && (
            <View style={{ gap: espacio.medio }}>
              <Texto variante="subtitulo">
                {renovar ? 'Para renovarlo' : 'Tu pedido está listo'}
              </Texto>
              <Texto variante="cuerpo">
                1. Guardá el pedido en el teléfono, o mandalo a donde vayas a entrar a ARCA.
              </Texto>
              <GuardarElPedido pedido={pedido} />
              <Texto variante="cuerpo">
                2. {(renovar ? DONDE_RENOVARLO : DONDE_SUBIRLO)[titular.ambiente]}
              </Texto>
              <AbrirElSitioDeArca />
              <Texto variante="cuerpo">3. {COMO_CARGARLO[titular.ambiente]}</Texto>
              <BotonesDeCarga
                carga={carga}
                ambiente={titular.ambiente}
                hayCertificado={certificado !== undefined}
              />
            </View>
          )}
        </ScrollView>
      )}
    </Pantalla>
  );
}
