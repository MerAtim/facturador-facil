import type { Producto } from '@facturador/aplicacion';
import { Aviso, Boton, CampoDeTexto, Pantalla, Texto, useTema } from '@facturador/ui';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';

import { facturaIva } from '../catalogo/conIva';
import { FilaDeProducto } from '../catalogo/FilaDeProducto';
import { productos, registro } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';

/** Cuántos se muestran: con más, conviene buscar. */
const LIMITE = 100;
/** Lo que se espera después de la última tecla antes de buscar. */
const ESPERA_AL_ESCRIBIR_MS = 300;

type Estado =
  | { readonly paso: 'cargando' }
  | { readonly paso: 'listo'; readonly lista: readonly Producto[] }
  | { readonly paso: 'fallo' };

/** El catálogo de productos y servicios, los más usados primero. */
export default function Productos() {
  const { espacio } = useTema();
  const router = useRouter();
  const configuracion = useConfiguracion();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [lectura, setLectura] = useState(0);
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const conIva = configurada ? facturaIva(configurada.emisor.datos.condicion) : false;

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(texto);
    }, ESPERA_AL_ESCRIBIR_MS);
    return () => {
      clearTimeout(espera);
    };
  }, [texto]);

  // Al volver de editar o borrar un producto, la lista se vuelve a leer.
  useFocusEffect(
    useCallback(() => {
      setLectura((anterior) => anterior + 1);
    }, []),
  );

  useEffect(() => {
    let vigente = true;
    productos.buscar(busqueda, LIMITE).then(
      (lista) => {
        if (vigente) setEstado({ paso: 'listo', lista });
      },
      (error: unknown) => {
        registro.error('no se pudo leer el catálogo', error);
        if (vigente) setEstado({ paso: 'fallo' });
      },
    );
    return () => {
      vigente = false;
    };
  }, [busqueda, lectura]);

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Productos y servicios' }} />
      <FlatList
        data={estado.paso === 'listo' ? estado.lista : []}
        keyExtractor={(producto) => String(producto.id)}
        contentContainerStyle={{ padding: espacio.normal, gap: espacio.medio }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: espacio.medio }}>
            <Boton
              icon="plus"
              onPress={() => {
                router.push('/producto');
              }}
            >
              Nuevo producto o servicio
            </Boton>
            <CampoDeTexto etiqueta="Buscar" valor={texto} onCambiar={setTexto} maximo={60} />
            {estado.paso === 'fallo' && (
              <Aviso icono="alert-circle-outline" tono="error">
                No se pudo leer el catálogo. Volvé a abrir la pantalla.
              </Aviso>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <FilaDeProducto
            producto={item}
            conIva={conIva}
            onPress={() => {
              router.push({ pathname: '/producto', params: { id: String(item.id) } });
            }}
          />
        )}
        ListEmptyComponent={
          estado.paso === 'listo' ? (
            <Texto variante="cuerpo">
              {busqueda.trim() === ''
                ? 'Todavía no hay productos. Cargá los que facturás seguido para agregarlos con un toque.'
                : 'No hay productos que coincidan.'}
            </Texto>
          ) : null
        }
      />
    </Pantalla>
  );
}
