import type { RangoDeFecha } from '@facturador/aplicacion';
import { FechaCalendario, type TipoComprobante } from '@facturador/dominio';
import { Aviso, Boton, CampoDeFecha, Texto, useTema } from '@facturador/ui';
import { useState } from 'react';
import { View } from 'react-native';

/** `05/11`: alcanza para un rango de pocos días. */
const corta = (fecha: FechaCalendario) => fecha.formatear().slice(0, 5);

const aDate = ({ anio, mes, dia }: FechaCalendario) => new Date(anio, mes - 1, dia);

/** Por qué el calendario empieza donde empieza, con la fecha límite y el motivo. */
export function explicarRango(
  rango: RangoDeFecha,
  hoy: FechaCalendario,
  tipo: TipoComprobante,
  puntoDeVenta: number,
): string {
  const serie = `${tipo.descripcion} del punto de venta ${String(puntoDeVenta)}`;
  if (rango.tipo === 'sin_fecha_valida') {
    return `Tu última ${serie} tiene fecha ${rango.desde.formatear()}: hasta ese día no podés hacer otra.`;
  }
  if (rango.limite === 'margen') {
    return `Podés elegir desde el ${corta(rango.desde)}. ARCA no acepta facturas con más de ${String(rango.diasDeMargen)} días de atraso.`;
  }
  if (rango.desde.esIgualA(hoy)) {
    return `Solo podés elegir hoy: ya hiciste una ${serie} con fecha de hoy. ARCA no acepta facturas con fecha anterior a la última.`;
  }
  return `Podés elegir desde el ${corta(rango.desde)}: es la fecha de tu última ${serie}. ARCA no acepta facturas con fecha anterior a la última.`;
}

/**
 * La fecha de emisión. Sin tocarla es la de hoy; el calendario solo ofrece las fechas que ARCA va
 * a aceptar, y el texto de abajo explica por qué.
 */
export function FechaDeEmision({
  fecha,
  hoy,
  rango,
  explicacion,
  ajuste,
  onCambiar,
}: {
  readonly fecha: FechaCalendario;
  readonly hoy: FechaCalendario;
  readonly rango: RangoDeFecha;
  readonly explicacion: string;
  /** Si la fecha elegida dejó de valer y se cambió sola, cuenta qué pasó. */
  readonly ajuste?: string | undefined;
  readonly onCambiar: (fecha: FechaCalendario) => void;
}) {
  const { colores, espacio } = useTema();
  const [conAyuda, setConAyuda] = useState(false);
  const esHoy = fecha.esIgualA(hoy);

  if (rango.tipo === 'sin_fecha_valida') {
    return (
      <Aviso icono="calendar-alert" tono="error">
        {explicacion}
      </Aviso>
    );
  }

  return (
    <View style={{ gap: espacio.chico }}>
      <CampoDeFecha
        etiqueta="Fecha"
        texto={esHoy ? `Hoy, ${fecha.formatear()}` : fecha.formatear()}
        valor={aDate(fecha)}
        minima={aDate(rango.desde)}
        maxima={aDate(rango.hasta)}
        pista={explicacion}
        onCambiar={(elegida) => {
          const nueva = FechaCalendario.crear(
            elegida.getFullYear(),
            elegida.getMonth() + 1,
            elegida.getDate(),
          );
          if (nueva.ok) onCambiar(nueva.valor);
        }}
      />
      {ajuste !== undefined && <Aviso icono="calendar-sync">{ajuste}</Aviso>}
      <Texto variante="detalle" style={{ color: colores.onSurfaceVariant }}>
        {explicacion}
      </Texto>
      <Boton
        variante="texto"
        icon={conAyuda ? 'chevron-up' : 'help-circle-outline'}
        accessibilityLabel={
          conAyuda ? 'Ocultar la ayuda sobre la fecha' : '¿Necesitás una fecha anterior?'
        }
        onPress={() => {
          setConAyuda((abierta) => !abierta);
        }}
      >
        ¿Necesitás una fecha anterior?
      </Boton>
      {conAyuda && (
        <Texto variante="detalle">
          La fecha de la factura es la de emisión: puede ser la de hoy aunque la compra haya sido
          otro día. Cada tipo de comprobante lleva su propio orden: una Factura A no frena una
          Factura B. Si tenés facturas atrasadas, hacelas primero, en orden, antes que las del día.
        </Texto>
      )}
    </View>
  );
}
