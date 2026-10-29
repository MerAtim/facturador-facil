import {
  cantidadDelBorrador,
  subtotalDelBorrador,
  type BorradorDeItem,
} from '@facturador/aplicacion';
import {
  AlicuotaIva,
  Cantidad,
  UnidadDeMedida,
  type MotivoCantidadInvalida,
} from '@facturador/dominio';
import {
  BotonDeIcono,
  CampoDeCantidad,
  CampoDeImporte,
  CampoDeTexto,
  Selector,
  Tarjeta,
  Texto,
  useTema,
  type Opcion,
} from '@facturador/ui';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

const ALICUOTAS: readonly Opcion<string>[] = AlicuotaIva.TODAS.map((alicuota) => ({
  valor: String(alicuota.codigoArca),
  etiqueta: alicuota.formatear(),
}));

const UNIDADES: readonly Opcion<string>[] = UnidadDeMedida.TODAS.map((unidad) => ({
  valor: unidad.clave,
  etiqueta: unidad.nombre,
}));

const ESCALA_PARA_APILAR = 1.3;

const MENSAJE_DE_CANTIDAD: Readonly<Record<MotivoCantidadInvalida, string>> = {
  no_positiva: 'Tiene que ser mayor a cero.',
  formato_invalido: 'Revisá la cantidad.',
  demasiados_decimales: 'Hasta tres decimales.',
};

/** Un ítem del comprobante, editable en el lugar. */
export function EditorDeItem({
  numero,
  borrador,
  onCambiar,
  onQuitar,
  conAlicuota,
  etiquetaDelPrecio,
  enfocarAlAbrir,
}: {
  readonly numero: number;
  readonly borrador: BorradorDeItem;
  readonly onCambiar: (borrador: BorradorDeItem) => void;
  /** Sin esta función el ítem no se puede quitar, porque es el único. */
  readonly onQuitar?: (() => void) | undefined;
  readonly conAlicuota: boolean;
  readonly etiquetaDelPrecio: string;
  readonly enfocarAlAbrir: 'descripcion' | 'precio';
}) {
  const { espacio } = useTema();
  // Con la fuente grande del teléfono, cantidad y unidad no entran una al lado de la otra.
  const apilar = useWindowDimensions().fontScale > ESCALA_PARA_APILAR;
  const cantidad = cantidadDelBorrador(borrador.cantidad);
  const errorDeCantidad =
    cantidad instanceof Cantidad ? undefined : MENSAJE_DE_CANTIDAD[cantidad.motivo];

  const cambiar = (cambios: Partial<BorradorDeItem>) => {
    onCambiar({ ...borrador, ...cambios });
  };

  return (
    <Tarjeta>
      <View style={estilos.linea}>
        <Texto variante="etiqueta">Ítem {numero}</Texto>
        {onQuitar && (
          <BotonDeIcono
            icono="delete-outline"
            descripcion={`Quitar el ítem ${String(numero)}`}
            onPress={onQuitar}
          />
        )}
      </View>
      <CampoDeTexto
        etiqueta="Descripción"
        valor={borrador.descripcion}
        onCambiar={(descripcion) => {
          cambiar({ descripcion });
        }}
        maximo={200}
        autoFocus={enfocarAlAbrir === 'descripcion'}
      />
      <View style={[!apilar && estilos.fila, { gap: espacio.chico }]}>
        <View style={estilos.cantidad}>
          <CampoDeCantidad
            valor={borrador.cantidad}
            onCambiar={(texto) => {
              cambiar({ cantidad: texto });
            }}
            error={errorDeCantidad}
          />
        </View>
        <View style={estilos.unidad}>
          <Selector
            etiqueta="Unidad"
            opciones={UNIDADES}
            valor={borrador.unidad.clave}
            onCambiar={(clave) => {
              cambiar({ unidad: UnidadDeMedida.desdeClave(clave) ?? borrador.unidad });
            }}
          />
        </View>
      </View>
      <CampoDeImporte
        etiqueta={etiquetaDelPrecio}
        valor={borrador.precio}
        onCambiar={(precio) => {
          cambiar({ precio });
        }}
        autoFocus={enfocarAlAbrir === 'precio'}
      />
      {conAlicuota && (
        <Selector
          etiqueta="Alícuota de IVA"
          opciones={ALICUOTAS}
          valor={String(borrador.alicuota.codigoArca)}
          onCambiar={(codigo) => {
            cambiar({ alicuota: AlicuotaIva.desdeCodigoArca(Number(codigo)) ?? borrador.alicuota });
          }}
        />
      )}
      <View style={estilos.linea} accessible>
        <Texto variante="detalle">Subtotal</Texto>
        <Texto variante="importe">{subtotalDelBorrador(borrador).formatear()}</Texto>
      </View>
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  linea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fila: { flexDirection: 'row', alignItems: 'flex-start' },
  cantidad: { flex: 1 },
  unidad: { flex: 1 },
});
