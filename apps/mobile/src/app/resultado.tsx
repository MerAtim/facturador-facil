import {
  explicarError,
  explicarObservaciones,
  numeroCompleto,
  type AccionSugerida,
  type CaeOtorgado,
  type ErrorAutorizacion,
} from '@facturador/arca';
import { mensajeSugerido } from '@facturador/documentos';
import { Aviso, Boton, CampoDeTexto, Pantalla, Tarjeta, Texto, useTema } from '@facturador/ui';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import { emisionPara, registro } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';
import { compartirFactura } from '../emision/compartirFactura';
import { facturaEnCurso } from '../emision/facturaEnCurso';

/** Acciones de un error que se resuelven pidiendo de nuevo la autorización del mismo comprobante. */
const SE_RESUELVE_REINTENTANDO: readonly AccionSugerida[] = [
  'reintentar',
  'reintentar_mas_tarde',
  'registrar_anterior',
];

export default function Resultado() {
  const { espacio } = useTema();
  const router = useRouter();
  const configuracion = useConfiguracion();
  const [, setVersion] = useState(0);
  const [reintentando, setReintentando] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [noSeCompartio, setNoSeCompartio] = useState(false);
  // Sin escribir nada, se usa el mensaje sugerido.
  const [mensaje, setMensaje] = useState<string>();
  const enviado = useRef(false);

  useEffect(() => {
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => reintentando);
    return () => {
      suscripcion.remove();
    };
  }, [reintentando]);

  const enCurso = facturaEnCurso.leer();
  if (!enCurso?.resultado) return <Redirect href="/" />;
  const { comprobante, receptor, resultado } = enCurso;
  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const sugerido =
    resultado.ok && configurada
      ? mensajeSugerido({
          clase: resultado.valor.comprobante.datos.tipo.clase,
          puntoDeVenta: resultado.valor.puntoDeVenta,
          numero: resultado.valor.numero,
          total: resultado.valor.comprobante.totales.total.formatear(),
          emisor: configurada.emisor.datos.razonSocial,
        })
      : '';

  const volverAlInicio = () => {
    facturaEnCurso.terminar();
    router.dismissAll();
  };

  const emitirOtra = () => {
    facturaEnCurso.terminar();
    router.dismissAll();
    router.push('/nueva-factura');
  };

  const compartir = async (otorgado: CaeOtorgado) => {
    if (!configurada) return;
    setNoSeCompartio(false);
    setCompartiendo(true);
    try {
      await compartirFactura(
        {
          comprobante: otorgado.comprobante,
          emisor: configurada.emisor,
          receptor,
          puntoDeVenta: otorgado.puntoDeVenta,
          numero: otorgado.numero,
          deHomologacion: configurada.ambiente === 'homologacion',
        },
        mensaje ?? sugerido,
      );
    } catch (error) {
      registro.error('no se pudo generar o compartir el pdf', error);
      setNoSeCompartio(true);
    } finally {
      setCompartiendo(false);
    }
  };

  /** El mismo comprobante otra vez: el autorizador averigua qué pasó con un envío incierto. */
  const reintentar = async () => {
    if (!configurada || enviado.current) return;
    enviado.current = true;
    setReintentando(true);
    try {
      const emision = await emisionPara(configurada);
      if (emision) facturaEnCurso.registrarResultado(await emision.emitir(comprobante, receptor));
    } finally {
      enviado.current = false;
      setReintentando(false);
      setVersion((version) => version + 1);
    }
  };

  return (
    <Pantalla conEncabezado>
      <Stack.Screen
        options={{
          title: resultado.ok ? 'Factura emitida' : 'No se pudo emitir',
          // Volver a la revisión ofrecería emitir otra vez lo que ya se envió.
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
        {resultado.ok ? (
          <Autorizada otorgado={resultado.valor} />
        ) : (
          <Rechazada error={resultado.error} />
        )}

        <View style={{ gap: espacio.chico, marginTop: espacio.normal }}>
          {resultado.ok && (
            <CampoDeTexto
              etiqueta="Mensaje para el cliente"
              valor={mensaje ?? sugerido}
              onCambiar={setMensaje}
              multilinea
              maximo={500}
            />
          )}
          {resultado.ok && (
            <Boton
              icon="share-variant"
              onPress={() => void compartir(resultado.valor)}
              loading={compartiendo}
              disabled={compartiendo}
            >
              Compartir factura
            </Boton>
          )}
          {noSeCompartio && (
            <Aviso icono="alert-circle-outline" tono="error">
              No se pudo generar el PDF. Probá de nuevo.
            </Aviso>
          )}
          {resultado.ok && (
            <Boton variante="secundario" onPress={emitirOtra}>
              Emitir otra factura
            </Boton>
          )}
          {!resultado.ok && (
            <AccionesDelError
              error={resultado.error}
              reintentando={reintentando}
              onReintentar={() => void reintentar()}
              onCorregir={() => {
                router.dismissTo('/nueva-factura');
              }}
              onRevisarAlta={() => {
                router.push('/alta');
              }}
            />
          )}
          <Boton variante="texto" onPress={volverAlInicio} disabled={reintentando}>
            Volver al inicio
          </Boton>
        </View>
      </ScrollView>
    </Pantalla>
  );
}

function Autorizada({ otorgado }: { readonly otorgado: CaeOtorgado }) {
  const { comprobante, puntoDeVenta, numero, observaciones } = otorgado;
  const autorizacion = comprobante.autorizacion;
  const notas = explicarObservaciones(observaciones);

  return (
    <>
      <Aviso icono="check-circle-outline">ARCA autorizó la factura.</Aviso>
      <Tarjeta>
        <Dato etiqueta={`Factura ${comprobante.datos.tipo.clase}`}>
          {numeroCompleto(puntoDeVenta, numero)}
        </Dato>
        <Dato etiqueta="Total">{comprobante.totales.total.formatear()}</Dato>
        {autorizacion && <Dato etiqueta="CAE">{autorizacion.cae}</Dato>}
        {autorizacion && (
          <Dato etiqueta="Vencimiento del CAE">{autorizacion.vencimiento.formatear()}</Dato>
        )}
      </Tarjeta>
      {notas.length > 0 && (
        <Aviso icono="information-outline">
          {['ARCA hizo estas observaciones, que no invalidan la factura:', ...notas].join('\n')}
        </Aviso>
      )}
    </>
  );
}

function Rechazada({ error }: { readonly error: ErrorAutorizacion }) {
  const { espacio } = useTema();
  const mensaje = explicarError(error);
  return (
    <View style={{ gap: espacio.medio }}>
      <Aviso icono="alert-circle-outline" tono="error">
        {mensaje.titulo}
      </Aviso>
      {mensaje.detalles.map((detalle) => (
        <Texto key={detalle} variante="cuerpo">
          {detalle}
        </Texto>
      ))}
      <Texto variante="cuerpo">{mensaje.sugerencia}</Texto>
      {mensaje.codigos.length > 0 && (
        <Texto variante="detalle">Códigos de ARCA: {mensaje.codigos.join(', ')}</Texto>
      )}
    </View>
  );
}

function AccionesDelError({
  error,
  reintentando,
  onReintentar,
  onCorregir,
  onRevisarAlta,
}: {
  readonly error: ErrorAutorizacion;
  readonly reintentando: boolean;
  readonly onReintentar: () => void;
  readonly onCorregir: () => void;
  readonly onRevisarAlta: () => void;
}) {
  const { accion } = explicarError(error);

  if (SE_RESUELVE_REINTENTANDO.includes(accion)) {
    return (
      <Boton onPress={onReintentar} loading={reintentando} disabled={reintentando}>
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </Boton>
    );
  }
  if (accion === 'corregir_comprobante') {
    return <Boton onPress={onCorregir}>Corregir la factura</Boton>;
  }
  // La verificación de la puesta en marcha dice qué falta: el certificado, la autorización o el
  // punto de venta.
  if (accion === 'revisar_certificado' || accion === 'revisar_punto_de_venta') {
    return <Boton onPress={onRevisarAlta}>Revisar la puesta en marcha</Boton>;
  }
  return null;
}

function Dato({ etiqueta, children }: { readonly etiqueta: string; readonly children: string }) {
  return (
    <View style={estilos.dato} accessible>
      <Texto variante="detalle">{etiqueta}</Texto>
      <Texto variante="importe">{children}</Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  dato: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
