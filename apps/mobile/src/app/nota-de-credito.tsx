import {
  prepararNotaDeCredito,
  type ComprobanteEmitido,
  type ProblemaDeLaNota,
} from '@facturador/aplicacion';
import { numeroCompleto } from '@facturador/arca';
import {
  FechaCalendario,
  saldoAcreditable,
  type AlicuotaIva,
  type SaldoAcreditable,
} from '@facturador/dominio';
import {
  Aviso,
  Boton,
  CampoDeImporte,
  CampoDeTexto,
  Fichas,
  Pantalla,
  TarjetaDeComprobante,
  Texto,
  useTema,
} from '@facturador/ui';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useConfiguracion } from '../configuracion/configuracion';
import { facturaEnCurso } from '../emision/facturaEnCurso';
import { enUnaFrase, resumenDelComprobante } from '../emision/resumenDelComprobante';
import { useComprobanteEmitido } from '../emision/useComprobanteEmitido';

type Alcance = 'total' | 'parcial';

/** Anula una factura emitida, entera o en parte, con una nota de crédito. */
export default function NotaDeCredito() {
  const estado = useComprobanteEmitido();

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Nota de crédito' }} />
      {estado.paso === 'no_encontrado' && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se encontró la factura.
        </Aviso>
      )}
      {estado.paso === 'listo' && (
        <CargaDeLaNota factura={estado.emitido} notasPrevias={estado.notas} />
      )}
    </Pantalla>
  );
}

function CargaDeLaNota({
  factura,
  notasPrevias,
}: {
  readonly factura: ComprobanteEmitido;
  readonly notasPrevias: readonly ComprobanteEmitido[];
}) {
  const { espacio } = useTema();
  const router = useRouter();
  const configuracion = useConfiguracion();
  const { tipo, modoDePrecio } = factura.comprobante.datos;
  const numero = numeroCompleto(factura.puntoDeVenta, factura.numero);
  const saldo = saldoAcreditable(
    factura.comprobante,
    notasPrevias.map((nota) => nota.comprobante),
  );

  // Con notas anteriores ya no se puede repetir la factura entera: solo acreditar lo que queda.
  const admiteTotal = notasPrevias.length === 0;
  const [alcance, setAlcance] = useState<Alcance>(admiteTotal ? 'total' : 'parcial');
  const [importe, setImporte] = useState('');
  const [descripcion, setDescripcion] = useState('Ajuste de precio');
  const [alicuota, setAlicuota] = useState<AlicuotaIva>();
  const [problema, setProblema] = useState<ProblemaDeLaNota>();
  // El aviso de un problema se va apenas se empieza a corregir.
  const corregir =
    <T,>(cambiar: (valor: T) => void) =>
    (valor: T) => {
      cambiar(valor);
      setProblema(undefined);
    };

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  if (!configurada) return null;
  const { ambiente } = configurada;

  if (tipo.naturaleza !== 'factura' || saldo.total.esCero()) {
    return (
      <View style={{ padding: espacio.normal }}>
        <Aviso icono="information-outline">
          {tipo.naturaleza === 'factura'
            ? 'Esta factura ya quedó anulada por completo.'
            : 'Las notas de crédito se hacen sobre una factura.'}
        </Aviso>
      </View>
    );
  }

  const revisar = () => {
    const nota = prepararNotaDeCredito({
      factura,
      notasPrevias,
      alcance:
        alcance === 'total'
          ? { tipo: 'total' }
          : { tipo: 'parcial', importe, descripcion, ...(alicuota && { alicuota }) },
      hoy: FechaCalendario.enArgentina(new Date()),
    });
    if (!nota.ok) {
      setProblema(nota.error);
      return;
    }
    setProblema(undefined);
    facturaEnCurso.preparar(nota.valor, factura.receptor);
    router.push('/confirmar-factura');
  };

  const etiquetaDelImporte = tipo.informaIva()
    ? `Importe a devolver, ${modoDePrecio === 'final' ? 'con' : 'sin'} IVA`
    : 'Importe a devolver';

  return (
    <ScrollView
      contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}
      keyboardShouldPersistTaps="handled"
    >
      <AvisoDeAmbiente ambiente={ambiente} />
      <TarjetaDeComprobante {...resumenDelComprobante(factura)} />
      {!admiteTotal && (
        <Texto variante="detalle">
          Ya tiene notas de crédito. Queda {saldo.total.formatear()} por acreditar.
        </Texto>
      )}

      {admiteTotal && (
        <Fichas
          opciones={[
            { valor: 'total' as const, etiqueta: 'Toda la factura' },
            { valor: 'parcial' as const, etiqueta: 'Una parte' },
          ]}
          valor={alcance}
          onCambiar={(nuevo) => {
            setAlcance(nuevo);
            setProblema(undefined);
          }}
        />
      )}

      {alcance === 'total' ? (
        <Texto variante="cuerpo">
          La nota repite todos los ítems de la {enUnaFrase(tipo)} {numero} y la anula por{' '}
          {factura.comprobante.totales.total.formatear()}.
        </Texto>
      ) : (
        <View style={{ gap: espacio.medio }}>
          <CampoDeImporte
            etiqueta={etiquetaDelImporte}
            valor={importe}
            onCambiar={corregir(setImporte)}
          />
          {saldo.porAlicuota.length > 1 && (
            <View style={{ gap: espacio.chico }}>
              <Texto variante="etiqueta">Alícuota de IVA</Texto>
              <Fichas
                opciones={opcionesDeAlicuota(saldo)}
                valor={alicuota ? String(alicuota.codigoArca) : ''}
                onCambiar={(codigo) => {
                  setProblema(undefined);
                  setAlicuota(
                    saldo.porAlicuota.find((g) => String(g.alicuota.codigoArca) === codigo)
                      ?.alicuota,
                  );
                }}
              />
            </View>
          )}
          <CampoDeTexto
            etiqueta="Descripción"
            valor={descripcion}
            onCambiar={corregir(setDescripcion)}
            maximo={200}
          />
        </View>
      )}

      {problema && (
        <Aviso icono="alert-circle-outline" tono="error">
          {explicar(problema, saldo, factura)}
        </Aviso>
      )}

      <Boton icon="file-undo-outline" onPress={revisar}>
        Revisar nota de crédito
      </Boton>
    </ScrollView>
  );
}

/** Cada alícuota de la factura con lo que todavía se puede acreditar en ella. */
function opcionesDeAlicuota(saldo: SaldoAcreditable) {
  return saldo.porAlicuota.map(({ alicuota, importe }) => ({
    valor: String(alicuota.codigoArca),
    etiqueta: `${alicuota.formatear()} · hasta ${importe.formatear()}`,
  }));
}

function explicar(
  problema: ProblemaDeLaNota,
  saldo: SaldoAcreditable,
  factura: ComprobanteEmitido,
): string {
  switch (problema.tipo) {
    case 'importe_invalido':
      return 'Escribí el importe a devolver.';
    case 'descripcion_vacia':
      return 'Escribí qué se acredita, por ejemplo "Devolución" o "Descuento".';
    case 'falta_alicuota':
      return 'Elegí la alícuota de IVA de lo que se devuelve.';
    case 'supera_el_saldo':
      return saldo.porAlicuota.length > 1
        ? 'El importe supera lo que queda por acreditar en esa alícuota.'
        : `Queda ${saldo.total.formatear()} por acreditar y el importe lo supera.`;
    case 'comprobante':
      return problema.motivo === 'anterior_al_asociado'
        ? `La factura es del ${factura.comprobante.datos.fechaDeEmision.formatear()}: la nota se puede hacer desde ese día.`
        : 'Revisá los datos de la nota.';
  }
}
