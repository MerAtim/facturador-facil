import type { Producto } from '@facturador/aplicacion';
import { CampoDeTexto, Fichas, Texto, useTema, type Ficha } from '@facturador/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { productos } from '../composicion';
import { FilaDeProducto } from './FilaDeProducto';

/** Los que entran cómodos como fichas; el resto se encuentra buscando. */
const MAS_USADOS = 8;
const RESULTADOS_DE_LA_BUSQUEDA = 5;
const BUSCAR = 'buscar';
const NINGUNO = '';

/**
 * Agrega a la factura un producto del catálogo con un toque. Sin productos guardados no muestra
 * nada: el catálogo se carga desde su pantalla.
 */
export function CatalogoEnLaFactura({
  conIva,
  onElegir,
}: {
  readonly conIva: boolean;
  readonly onElegir: (producto: Producto) => void;
}) {
  const { espacio } = useTema();
  const [masUsados, setMasUsados] = useState<readonly Producto[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    productos.buscar('', MAS_USADOS).then(setMasUsados, () => undefined);
  }, []);

  if (masUsados.length === 0) return null;

  const fichas: readonly Ficha<string>[] = [
    ...masUsados.map((p) => ({ valor: String(p.id), etiqueta: p.descripcion, icono: 'plus' })),
    { valor: BUSCAR, etiqueta: 'Buscar', icono: 'magnify' },
  ];

  const elegir = (valor: string) => {
    if (valor === BUSCAR) {
      setBuscando((antes) => !antes);
      return;
    }
    const producto = masUsados.find((p) => String(p.id) === valor);
    if (producto) onElegir(producto);
  };

  return (
    <View style={{ gap: espacio.chico }}>
      <Texto variante="etiqueta">Agregar del catálogo</Texto>
      {/* Las fichas agregan, no quedan elegidas: solo "Buscar" se marca mientras está abierta. */}
      <Fichas opciones={fichas} valor={buscando ? BUSCAR : NINGUNO} onCambiar={elegir} />
      {buscando && (
        <BuscadorDeProductos
          conIva={conIva}
          onElegir={(producto) => {
            setBuscando(false);
            onElegir(producto);
          }}
        />
      )}
    </View>
  );
}

function BuscadorDeProductos({
  conIva,
  onElegir,
}: {
  readonly conIva: boolean;
  readonly onElegir: (producto: Producto) => void;
}) {
  const { espacio } = useTema();
  const [texto, setTexto] = useState('');
  const [encontrados, setEncontrados] = useState<readonly Producto[]>([]);

  useEffect(() => {
    // Si se sigue escribiendo antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true;
    productos.buscar(texto, RESULTADOS_DE_LA_BUSQUEDA).then(
      (resultado) => {
        if (vigente) setEncontrados(resultado);
      },
      () => undefined,
    );
    return () => {
      vigente = false;
    };
  }, [texto]);

  return (
    <View style={{ gap: espacio.chico }}>
      <CampoDeTexto
        etiqueta="Producto o servicio"
        valor={texto}
        onCambiar={setTexto}
        maximo={60}
        autoFocus
      />
      {encontrados.map((producto) => (
        <FilaDeProducto
          key={String(producto.id)}
          producto={producto}
          conIva={conIva}
          onPress={() => {
            onElegir(producto);
          }}
        />
      ))}
      {encontrados.length === 0 && (
        <Texto variante="detalle">No hay productos que coincidan.</Texto>
      )}
    </View>
  );
}
