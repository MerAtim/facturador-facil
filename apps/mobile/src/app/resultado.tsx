import {
  explicarError,
  explicarObservaciones,
  numeroCompleto,
  type AccionSugerida,
  type CaeOtorgado,
  type ErrorAutorizacion,
} from '@facturador/arca';
import type { Receptor } from '@facturador/dominio';
import { Aviso, Boton, Pantalla, TarjetaDeComprobante, Texto, useTema } from '@facturador/ui';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';

import { emisionPara } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';
import { CompartirComprobante } from '../emision/CompartirComprobante';
import { facturaEnCurso } from '../emision/facturaEnCurso';
import { nombreDelReceptor } from '../emision/resumenDelComprobante';

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
  const { tipo } = comprobante.datos;
  const esFactura = tipo.naturaleza === 'factura';
  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
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
          title: resultado.ok ? `${tipo.nombre} emitida` : 'No se pudo emitir',
          // Volver a la revisión ofrecería emitir otra vez lo que ya se envió.
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
        {resultado.ok ? (
          <Autorizada otorgado={resultado.valor} receptor={receptor} />
        ) : (
          <Rechazada error={resultado.error} />
        )}

        <View style={{ gap: espacio.chico, marginTop: espacio.normal }}>
          {resultado.ok && configurada && (
            <CompartirComprobante
              documento={{
                comprobante: resultado.valor.comprobante,
                emisor: configurada.emisor,
                receptor,
                puntoDeVenta: resultado.valor.puntoDeVenta,
                numero: resultado.valor.numero,
                deHomologacion: configurada.ambiente === 'homologacion',
              }}
            />
          )}
          {resultado.ok && esFactura && (
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
                // La revisión se reemplazó por este resultado: atrás queda la carga de la nota.
                if (esFactura) router.dismissTo('/nueva-factura');
                else router.back();
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

function Autorizada({
  otorgado,
  receptor,
}: {
  readonly otorgado: CaeOtorgado;
  readonly receptor: Receptor;
}) {
  const { comprobante, puntoDeVenta, numero, observaciones } = otorgado;
  const autorizacion = comprobante.autorizacion;
  const notas = explicarObservaciones(observaciones);
  const { tipo } = comprobante.datos;

  return (
    <>
      <Aviso icono="check-circle-outline">ARCA autorizó la {tipo.nombre.toLowerCase()}.</Aviso>
      <TarjetaDeComprobante
        titulo={tipo.descripcion}
        numero={numeroCompleto(puntoDeVenta, numero)}
        total={comprobante.totales.total.formatear()}
        receptor={nombreDelReceptor(receptor)}
        fecha={comprobante.datos.fechaDeEmision.formatear()}
        {...(autorizacion && {
          autorizacion: {
            cae: autorizacion.cae,
            vencimiento: autorizacion.vencimiento.formatear(),
          },
        })}
      />
      {notas.length > 0 && (
        <Aviso icono="information-outline">
          {['ARCA hizo estas observaciones, que no invalidan el comprobante:', ...notas].join('\n')}
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
    return <Boton onPress={onCorregir}>Corregir el comprobante</Boton>;
  }
  // La verificación de la puesta en marcha dice qué falta: el certificado, la autorización o el
  // punto de venta.
  if (accion === 'revisar_certificado' || accion === 'revisar_punto_de_venta') {
    return <Boton onPress={onRevisarAlta}>Revisar la puesta en marcha</Boton>;
  }
  return null;
}
