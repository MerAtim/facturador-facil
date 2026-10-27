import {
  explicarError,
  explicarObservaciones,
  numeroCompleto,
  type AccionSugerida,
  type CaeOtorgado,
  type ErrorAutorizacion,
} from '@facturador/arca';
import { Aviso, Boton, Pantalla, Tarjeta, Texto, useTema } from '@facturador/ui';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import { emisionPara } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';
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

  const volverAlInicio = () => {
    facturaEnCurso.terminar();
    router.dismissAll();
  };

  const emitirOtra = () => {
    facturaEnCurso.terminar();
    router.dismissAll();
    router.push('/nueva-factura');
  };

  /** El mismo comprobante otra vez: el autorizador averigua qué pasó con un envío incierto. */
  const reintentar = async () => {
    const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
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
          {resultado.ok && <Boton onPress={emitirOtra}>Emitir otra factura</Boton>}
          {!resultado.ok && (
            <AccionesDelError
              error={resultado.error}
              reintentando={reintentando}
              onReintentar={() => void reintentar()}
              onCorregir={() => {
                router.dismissTo('/nueva-factura');
              }}
              onIrAlCertificado={() => {
                router.push('/certificado');
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
  onIrAlCertificado,
}: {
  readonly error: ErrorAutorizacion;
  readonly reintentando: boolean;
  readonly onReintentar: () => void;
  readonly onCorregir: () => void;
  readonly onIrAlCertificado: () => void;
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
  if (accion === 'revisar_certificado') {
    return <Boton onPress={onIrAlCertificado}>Ir al certificado</Boton>;
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
