import { StyleSheet, View } from 'react-native';
import { Divider } from 'react-native-paper';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio, radio } from '../tema/tokens';
import { Texto } from './Texto';

export interface LineaDeTotal {
  readonly etiqueta: string;
  /** El importe ya formateado, `$ 1.234,56`. */
  readonly importe: string;
}

/** Desglose de un comprobante con el total destacado al pie. Sin líneas, muestra solo el total. */
export function ResumenDeTotales({
  lineas,
  total,
}: {
  readonly lineas: readonly LineaDeTotal[];
  readonly total: string;
}) {
  const { colores } = useTema();

  return (
    <View style={[estilos.contenedor, { backgroundColor: colores.surfaceVariant }]}>
      {lineas.map(({ etiqueta, importe }) => (
        <View key={etiqueta} style={estilos.linea} accessible>
          <Texto variante="detalle" style={{ color: colores.onSurfaceVariant }}>
            {etiqueta}
          </Texto>
          <Texto variante="importe" style={{ color: colores.onSurfaceVariant }}>
            {importe}
          </Texto>
        </View>
      ))}
      {lineas.length > 0 && <Divider style={{ backgroundColor: colores.outlineVariant }} />}
      <View style={estilos.linea} accessible>
        <Texto variante="subtitulo">Total</Texto>
        <Texto variante="importeDestacado" style={{ color: colores.primary }}>
          {total}
        </Texto>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    borderRadius: radio.grande,
    padding: espacio.normal,
    gap: espacio.chico,
  },
  linea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});
