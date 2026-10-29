import type { Cliente } from '@facturador/aplicacion';
import { Aviso, Boton, CampoDeTexto, Pantalla, Texto, useTema } from '@facturador/ui';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';

import { FilaDeCliente } from '../clientes/FilaDeCliente';
import { clientes, registro } from '../composicion';

/** Cuántos se muestran: con más, conviene buscar. */
const LIMITE = 100;
/** Lo que se espera después de la última tecla antes de buscar. */
const ESPERA_AL_ESCRIBIR_MS = 300;

type Estado =
  | { readonly paso: 'cargando' }
  | { readonly paso: 'listo'; readonly lista: readonly Cliente[] }
  | { readonly paso: 'fallo' };

/** Los clientes guardados, para buscarlos, cargarlos o editarlos. */
export default function Clientes() {
  const { espacio } = useTema();
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [lectura, setLectura] = useState(0);
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(texto);
    }, ESPERA_AL_ESCRIBIR_MS);
    return () => {
      clearTimeout(espera);
    };
  }, [texto]);

  // Al volver de editar o borrar un cliente, la lista se vuelve a leer.
  useFocusEffect(
    useCallback(() => {
      setLectura((anterior) => anterior + 1);
    }, []),
  );

  useEffect(() => {
    let vigente = true;
    clientes.buscar(busqueda, LIMITE).then(
      (lista) => {
        if (vigente) setEstado({ paso: 'listo', lista });
      },
      (error: unknown) => {
        registro.error('no se pudieron leer los clientes', error);
        if (vigente) setEstado({ paso: 'fallo' });
      },
    );
    return () => {
      vigente = false;
    };
  }, [busqueda, lectura]);

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Clientes' }} />
      <FlatList
        data={estado.paso === 'listo' ? estado.lista : []}
        keyExtractor={(cliente) => cliente.cuit.valor}
        contentContainerStyle={{ padding: espacio.normal, gap: espacio.medio }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: espacio.medio }}>
            <Boton
              icon="account-plus-outline"
              onPress={() => {
                router.push('/cliente');
              }}
            >
              Nuevo cliente
            </Boton>
            <CampoDeTexto
              etiqueta="Buscar por nombre o CUIT"
              datoPersonal
              valor={texto}
              onCambiar={setTexto}
              maximo={60}
            />
            {estado.paso === 'fallo' && (
              <Aviso icono="alert-circle-outline" tono="error">
                No se pudieron leer los clientes. Volvé a abrir la pantalla.
              </Aviso>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <FilaDeCliente
            cliente={item}
            onPress={() => {
              router.push({ pathname: '/cliente', params: { cuit: item.cuit.valor } });
            }}
          />
        )}
        ListEmptyComponent={
          estado.paso === 'listo' ? (
            <Texto variante="cuerpo">
              {busqueda.trim() === ''
                ? 'Todavía no hay clientes. Se agregan solos al facturarles con CUIT, o cargalos acá.'
                : 'No hay clientes que coincidan.'}
            </Texto>
          ) : null
        }
      />
    </Pantalla>
  );
}
