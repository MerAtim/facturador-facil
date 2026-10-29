import { numeroCompleto } from '@facturador/arca';
import type { Receptor } from '@facturador/dominio';
import { Aviso, Boton, Pantalla, ResumenDeTotales, Tarjeta, Texto, useTema } from '@facturador/ui';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView } from 'react-native';

import { emisionPara } from '../composicion';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useConfiguracion } from '../configuracion/configuracion';
import { facturaEnCurso } from '../emision/facturaEnCurso';
import { enUnaFrase } from '../emision/resumenDelComprobante';
import { ItemsDelComprobante } from '../emision/ItemsDelComprobante';
import { lineasDelResumen } from '../emision/resumen';

/**
 * Última revisión antes de emitir: un comprobante autorizado no se puede borrar, solo anular con
 * una nota de crédito. Muestra todo lo que va a ARCA y pide confirmarlo con un botón explícito.
 */
export default function ConfirmarFactura() {
  const { espacio } = useTema();
  const router = useRouter();
  const configuracion = useConfiguracion();
  const [emitiendo, setEmitiendo] = useState(false);
  const [sinCertificado, setSinCertificado] = useState(false);
  // El estado tarda un render en deshabilitar el botón: la referencia frena un segundo toque rápido.
  const enviado = useRef(false);

  // El botón atrás de Android tampoco sale mientras se emite.
  useEffect(() => {
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => emitiendo);
    return () => {
      suscripcion.remove();
    };
  }, [emitiendo]);

  const enCurso = facturaEnCurso.leer();
  if (!enCurso) return <Redirect href="/nueva-factura" />;

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const { comprobante, receptor } = enCurso;
  const { tipo, fechaDeEmision, asociado } = comprobante.datos;
  const total = comprobante.totales.total.formatear();
  const nombre = tipo.nombre.toLowerCase();

  const emitir = async () => {
    if (!configurada || enviado.current) return;
    enviado.current = true;
    setEmitiendo(true);
    setSinCertificado(false);

    const emision = await emisionPara(configurada);
    if (!emision) {
      enviado.current = false;
      setEmitiendo(false);
      setSinCertificado(true);
      return;
    }

    facturaEnCurso.registrarResultado(await emision.emitir(comprobante, receptor));
    router.replace('/resultado');
  };

  return (
    <Pantalla conEncabezado>
      <Stack.Screen
        options={{
          title: `Revisar ${nombre}`,
          // Mientras se emite no se puede volver: la factura quedaría en un estado incierto a la vista.
          headerBackVisible: !emitiendo,
          gestureEnabled: !emitiendo,
        }}
      />
      {configurada && (
        <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
          <AvisoDeAmbiente ambiente={configurada.ambiente} />

          <Tarjeta>
            <Texto variante="etiqueta">Receptor</Texto>
            <DatosDelReceptor receptor={receptor} />
          </Tarjeta>

          <Tarjeta>
            <Texto variante="subtitulo">{tipo.descripcion}</Texto>
            <Texto variante="detalle">
              Punto de venta {String(configurada.emisor.datos.puntoDeVenta)} · Fecha{' '}
              {fechaDeEmision.formatear()}
            </Texto>
            {asociado && (
              <Texto variante="detalle">
                Ajusta la {enUnaFrase(asociado.tipo)}{' '}
                {numeroCompleto(asociado.puntoDeVenta, asociado.numero)}
              </Texto>
            )}
            <ItemsDelComprobante comprobante={comprobante} />
          </Tarjeta>

          <ResumenDeTotales lineas={lineasDelResumen(tipo, comprobante.totales)} total={total} />

          {sinCertificado && (
            <Aviso icono="alert-circle-outline" tono="error">
              Para emitir falta cargar el certificado de ARCA.
            </Aviso>
          )}
          {sinCertificado && (
            <Boton
              variante="secundario"
              onPress={() => {
                router.push('/certificado');
              }}
            >
              Ir al certificado
            </Boton>
          )}

          <Texto variante="detalle">
            {tipo.naturaleza === 'factura'
              ? 'Una factura emitida no se puede borrar: para anularla hay que hacer una nota de crédito.'
              : 'Una nota de crédito emitida no se puede borrar ni deshacer.'}
          </Texto>
          <Boton
            icon="send-check-outline"
            onPress={() => void emitir()}
            loading={emitiendo}
            disabled={emitiendo}
          >
            {emitiendo ? 'Emitiendo…' : `Emitir ${enUnaFrase(tipo)} por ${total}`}
          </Boton>
        </ScrollView>
      )}
    </Pantalla>
  );
}

function DatosDelReceptor({ receptor }: { readonly receptor: Receptor }) {
  const { identificacion, condicion, nombre, domicilio } = receptor;
  if (identificacion.tipo !== 'cuit') {
    return <Texto variante="cuerpo">{condicion.descripcion}</Texto>;
  }
  return (
    <>
      {nombre && <Texto variante="cuerpo">{nombre}</Texto>}
      <Texto variante="detalle">
        CUIT {identificacion.cuit.formateado()} · {condicion.descripcion}
      </Texto>
      {domicilio && <Texto variante="detalle">{domicilio}</Texto>}
    </>
  );
}
