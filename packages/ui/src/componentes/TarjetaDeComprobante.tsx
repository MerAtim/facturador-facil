import { Pressable, StyleSheet, View } from 'react-native';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio, radio } from '../tema/tokens';
import { Texto } from './Texto';

export interface AutorizacionMostrada {
  readonly cae: string;
  /** El vencimiento del CAE ya formateado. */
  readonly vencimiento: string;
}

/**
 * Un comprobante de un vistazo: qué es, a quién y cuánto, y su CAE si ARCA lo autorizó. Recibe todo
 * ya formateado, así sirve igual para el resultado de una emisión que para un listado.
 */
export function TarjetaDeComprobante({
  titulo,
  numero,
  total,
  receptor,
  fecha,
  autorizacion,
  onPress,
}: {
  /** El tipo y la clase, `Factura B`. */
  readonly titulo: string;
  /** Punto de venta y número, `0001-00000012`. */
  readonly numero: string;
  readonly total: string;
  readonly receptor?: string;
  readonly fecha?: string;
  readonly autorizacion?: AutorizacionMostrada;
  /** Si se puede tocar, por ejemplo para ver el detalle desde un listado. */
  readonly onPress?: () => void;
}) {
  const { colores } = useTema();
  const contexto = [receptor, fecha].filter(Boolean).join(' · ');

  const estilo = [
    estilos.tarjeta,
    { borderColor: colores.outlineVariant, backgroundColor: colores.surface },
  ];
  const contenido = (
    <>
      <View style={estilos.resumen} accessible>
        <View style={estilos.encabezado}>
          <View style={estilos.identificacion}>
            <Texto variante="etiqueta" style={{ color: colores.onSurfaceVariant }}>
              {titulo}
            </Texto>
            <Texto variante="importe">{numero}</Texto>
          </View>
          <Texto variante="importeDestacado" style={{ color: colores.primary }}>
            {total}
          </Texto>
        </View>
        {/* A todo el ancho: un nombre largo no compite con el total. */}
        {contexto !== '' && (
          <Texto variante="detalle" style={{ color: colores.onSurfaceVariant }}>
            {contexto}
          </Texto>
        )}
      </View>
      {autorizacion && (
        <View style={[estilos.autorizacion, { borderTopColor: colores.outlineVariant }]}>
          <Dato etiqueta="CAE">{autorizacion.cae}</Dato>
          <Dato etiqueta="Vencimiento del CAE">{autorizacion.vencimiento}</Dato>
        </View>
      )}
    </>
  );

  if (!onPress) return <View style={estilo}>{contenido}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [estilo, pressed && { backgroundColor: colores.surfaceVariant }]}
      accessibilityRole="button"
      accessibilityLabel={[titulo, numero, contexto, total].filter(Boolean).join(', ')}
      accessibilityHint="Abre el detalle"
    >
      {contenido}
    </Pressable>
  );
}

function Dato({ etiqueta, children }: { readonly etiqueta: string; readonly children: string }) {
  return (
    <View style={estilos.fila} accessible>
      <Texto variante="detalle">{etiqueta}</Texto>
      <Texto variante="importe">{children}</Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    borderWidth: 1,
    borderRadius: radio.medio,
    padding: espacio.normal,
    gap: espacio.medio,
  },
  // Con la fuente grande, lo que no entra al lado pasa abajo en vez de partirse o salirse.
  fila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: espacio.chico,
  },
  resumen: { gap: espacio.chico },
  encabezado: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: espacio.chico,
  },
  identificacion: { flexGrow: 1, gap: espacio.minimo },
  autorizacion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: espacio.medio,
    gap: espacio.chico,
  },
});
