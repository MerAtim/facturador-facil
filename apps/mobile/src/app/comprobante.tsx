import type { ComprobanteEmitido } from '@facturador/aplicacion';
import { numeroCompleto } from '@facturador/arca';
import { saldoAcreditable } from '@facturador/dominio';
import {
  Aviso,
  Boton,
  Pantalla,
  ResumenDeTotales,
  Tarjeta,
  TarjetaDeComprobante,
  Texto,
  useTema,
} from '@facturador/ui';
import { Stack, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { parametrosDe } from '../emision/claveDelComprobante';
import { CompartirComprobante } from '../emision/CompartirComprobante';
import { ItemsDelComprobante } from '../emision/ItemsDelComprobante';
import { lineasDelResumen } from '../emision/resumen';
import { enUnaFrase, resumenDelComprobante } from '../emision/resumenDelComprobante';
import { useComprobanteEmitido } from '../emision/useComprobanteEmitido';

/** Un comprobante emitido, con todo su detalle, para volver a compartirlo o anularlo. */
export default function DetalleDelComprobante() {
  const estado = useComprobanteEmitido();

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Comprobante' }} />
      {estado.paso === 'no_encontrado' && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se encontró el comprobante.
        </Aviso>
      )}
      {estado.paso === 'listo' && <Detalle emitido={estado.emitido} notas={estado.notas} />}
    </Pantalla>
  );
}

function Detalle({
  emitido,
  notas,
}: {
  readonly emitido: ComprobanteEmitido;
  readonly notas: readonly ComprobanteEmitido[];
}) {
  const { espacio } = useTema();
  const router = useRouter();
  const { comprobante, receptor, emisor, ambiente, puntoDeVenta, numero } = emitido;
  const { tipo, modoDePrecio, asociado } = comprobante.datos;
  const { autorizacion } = comprobante;

  return (
    <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
      <TarjetaDeComprobante
        {...resumenDelComprobante(emitido)}
        {...(autorizacion && {
          autorizacion: {
            cae: autorizacion.cae,
            vencimiento: autorizacion.vencimiento.formatear(),
          },
        })}
      />
      {asociado && (
        <Boton
          variante="texto"
          icon="file-document-outline"
          onPress={() => {
            router.push({
              pathname: '/comprobante',
              params: parametrosDe(asociado.tipo, asociado.puntoDeVenta, asociado.numero),
            });
          }}
        >
          {`Ajusta la ${enUnaFrase(asociado.tipo)} ${numeroCompleto(asociado.puntoDeVenta, asociado.numero)}`}
        </Boton>
      )}
      <Tarjeta>
        <Texto variante="etiqueta">
          {tipo.informaIva()
            ? `Ítems, precios ${modoDePrecio === 'final' ? 'con' : 'sin'} IVA`
            : 'Ítems'}
        </Texto>
        <ItemsDelComprobante comprobante={comprobante} />
      </Tarjeta>
      <ResumenDeTotales
        lineas={lineasDelResumen(tipo, comprobante.totales)}
        total={comprobante.totales.total.formatear()}
      />
      <CompartirComprobante
        documento={{
          comprobante,
          // Los datos del emisor de cuando se emitió: el PDF sale igual que la primera vez.
          emisor,
          receptor,
          puntoDeVenta,
          numero,
          deHomologacion: ambiente === 'homologacion',
        }}
      />
      {tipo.naturaleza === 'factura' && <NotasDeCredito factura={emitido} notas={notas} />}
    </ScrollView>
  );
}

/** Lo que ya se anuló de la factura y el acceso para hacer otra nota mientras quede saldo. */
function NotasDeCredito({
  factura,
  notas,
}: {
  readonly factura: ComprobanteEmitido;
  readonly notas: readonly ComprobanteEmitido[];
}) {
  const { espacio } = useTema();
  const router = useRouter();
  const { total: saldo } = saldoAcreditable(
    factura.comprobante,
    notas.map((nota) => nota.comprobante),
  );

  return (
    <View style={{ gap: espacio.medio, marginTop: espacio.normal }}>
      {notas.length > 0 && <Texto variante="subtitulo">Notas de crédito</Texto>}
      {notas.map((nota) => (
        <TarjetaDeComprobante
          key={String(nota.numero)}
          {...resumenDelComprobante(nota)}
          onPress={() => {
            router.push({
              pathname: '/comprobante',
              params: parametrosDe(nota.comprobante.datos.tipo, nota.puntoDeVenta, nota.numero),
            });
          }}
        />
      ))}
      {notas.length > 0 && (
        <Texto variante="detalle">
          {saldo.esCero()
            ? 'La factura quedó anulada por completo.'
            : `Queda ${saldo.formatear()} por acreditar.`}
        </Texto>
      )}
      {!saldo.esCero() && (
        <Boton
          variante="secundario"
          icon="file-undo-outline"
          onPress={() => {
            router.push({
              pathname: '/nota-de-credito',
              params: parametrosDe(
                factura.comprobante.datos.tipo,
                factura.puntoDeVenta,
                factura.numero,
              ),
            });
          }}
        >
          Hacer una nota de crédito
        </Boton>
      )}
    </View>
  );
}
