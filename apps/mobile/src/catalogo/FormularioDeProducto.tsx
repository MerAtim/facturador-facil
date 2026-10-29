import {
  crearProducto,
  LARGO_MAXIMO_DE_LA_DESCRIPCION,
  type Producto,
  type ProblemaDelProducto,
} from '@facturador/aplicacion';
import { AlicuotaIva, UnidadDeMedida, type ModoDePrecio } from '@facturador/dominio';
import {
  Aviso,
  Boton,
  CampoDeImporte,
  CampoDeTexto,
  Selector,
  SelectorSegmentado,
  useTema,
  type Opcion,
} from '@facturador/ui';
import { useState } from 'react';
import { View } from 'react-native';

const MODOS: readonly Opcion<ModoDePrecio>[] = [
  { valor: 'final', etiqueta: 'Precio final' },
  { valor: 'neto', etiqueta: 'Precio neto' },
];

const ALICUOTAS: readonly Opcion<string>[] = AlicuotaIva.TODAS.map((alicuota) => ({
  valor: String(alicuota.codigoArca),
  etiqueta: alicuota.formatear(),
}));

const UNIDADES: readonly Opcion<string>[] = UnidadDeMedida.TODAS.map((unidad) => ({
  valor: unidad.clave,
  etiqueta: unidad.nombre,
}));

const MENSAJE: Readonly<Record<ProblemaDelProducto['tipo'], string>> = {
  descripcion_vacia: 'Falta la descripción.',
  descripcion_larga: `Hasta ${String(LARGO_MAXIMO_DE_LA_DESCRIPCION)} caracteres.`,
  precio_invalido: 'Falta el precio.',
  falta_alicuota: 'Con precio neto hace falta la alícuota.',
};

/** El precio guardado se muestra como se escribiría: sin el signo. */
const textoDelPrecio = (producto?: Producto) =>
  producto ? producto.precio.formatear().replace('$ ', '') : '';

/**
 * Un producto o servicio del catálogo. Quien factura IVA elige si el precio es final o neto y su
 * alícuota; quien no, guarda solo el precio que cobra.
 */
export function FormularioDeProducto({
  inicial,
  conIva,
  textoDelBoton,
  onListo,
  ocupado = false,
}: {
  readonly inicial?: Producto;
  /** Si el emisor factura IVA, es decir, emite comprobantes A o B. */
  readonly conIva: boolean;
  readonly textoDelBoton: string;
  readonly onListo: (producto: Producto) => void;
  readonly ocupado?: boolean;
}) {
  const { espacio } = useTema();
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [precio, setPrecio] = useState(textoDelPrecio(inicial));
  const [modo, setModo] = useState<ModoDePrecio>(inicial?.modoDePrecio ?? 'final');
  const [alicuota, setAlicuota] = useState(inicial?.alicuota ?? AlicuotaIva.VEINTIUNO);
  const [unidad, setUnidad] = useState(inicial?.unidad ?? UnidadDeMedida.UNIDADES);
  const [mostrarProblemas, setMostrarProblemas] = useState(false);

  const resultado = crearProducto({
    descripcion,
    precio,
    modoDePrecio: conIva ? modo : 'final',
    ...(conIva && { alicuota }),
    unidad,
  });
  const problemas = mostrarProblemas && !resultado.ok ? resultado.error : [];

  return (
    <View style={{ gap: espacio.medio }}>
      <CampoDeTexto
        etiqueta="Descripción"
        valor={descripcion}
        onCambiar={setDescripcion}
        maximo={LARGO_MAXIMO_DE_LA_DESCRIPCION}
      />
      {conIva && <SelectorSegmentado opciones={MODOS} valor={modo} onCambiar={setModo} />}
      <CampoDeImporte
        etiqueta={conIva ? (modo === 'final' ? 'Precio con IVA' : 'Precio sin IVA') : 'Precio'}
        valor={precio}
        onCambiar={setPrecio}
      />
      {conIva && (
        <Selector
          etiqueta="Alícuota de IVA"
          opciones={ALICUOTAS}
          valor={String(alicuota.codigoArca)}
          onCambiar={(codigo) => {
            setAlicuota(AlicuotaIva.desdeCodigoArca(Number(codigo)) ?? alicuota);
          }}
        />
      )}
      <Selector
        etiqueta="Unidad"
        opciones={UNIDADES}
        valor={unidad.clave}
        onCambiar={(clave) => {
          setUnidad(UnidadDeMedida.desdeClave(clave) ?? unidad);
        }}
      />
      {problemas.length > 0 && (
        <Aviso icono="alert-circle-outline" tono="error">
          {problemas.map((problema) => MENSAJE[problema.tipo]).join('\n')}
        </Aviso>
      )}
      <Boton
        variante="secundario"
        disabled={ocupado}
        loading={ocupado}
        onPress={() => {
          setMostrarProblemas(true);
          if (resultado.ok) {
            onListo(
              inicial?.id === undefined ? resultado.valor : { ...resultado.valor, id: inicial.id },
            );
          }
        }}
      >
        {textoDelBoton}
      </Boton>
    </View>
  );
}
