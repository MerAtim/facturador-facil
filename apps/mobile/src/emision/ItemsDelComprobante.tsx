import { importeDe, unidadDe, type Comprobante } from '@facturador/dominio';
import { Texto, useTema } from '@facturador/ui';
import { StyleSheet, View } from 'react-native';

/** Cada ítem con su cantidad y unidad, precio, alícuota si corresponde, y su importe. */
export function ItemsDelComprobante({ comprobante }: { readonly comprobante: Comprobante }) {
  const { espacio } = useTema();
  const { tipo, items } = comprobante.datos;
  return (
    <>
      {items.map((item, indice) => (
        <View key={String(indice)} style={estilos.item} accessible>
          <View style={[estilos.descripcion, { paddingRight: espacio.chico }]}>
            <Texto variante="cuerpo">{item.descripcion}</Texto>
            <Texto variante="detalle">
              {unidadDe(item).formatear(item.cantidad)} × {item.precioUnitario.formatear()}
              {tipo.informaIva() && item.alicuota ? ` · IVA ${item.alicuota.formatear()}` : ''}
            </Texto>
          </View>
          <Texto variante="importe">{importeDe(item).formatear()}</Texto>
        </View>
      ))}
    </>
  );
}

const estilos = StyleSheet.create({
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  descripcion: { flex: 1 },
});
