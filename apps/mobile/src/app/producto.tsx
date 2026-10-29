import type { Producto } from '@facturador/aplicacion';
import { Aviso, Boton, DialogoDeConfirmacion, Pantalla, useTema } from '@facturador/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { facturaIva } from '../catalogo/conIva';
import { FormularioDeProducto } from '../catalogo/FormularioDeProducto';
import { productos, registro } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';

const ENTERO = /^\d{1,9}$/;

type Estado =
  | { readonly paso: 'cargando' }
  | { readonly paso: 'listo'; readonly producto?: Producto }
  | { readonly paso: 'no_encontrado' };

/** Alta de un producto o, si llega su id, edición y baja. */
export default function FichaDelProducto() {
  const { espacio } = useTema();
  const router = useRouter();
  const configuracion = useConfiguracion();
  const { id: parametro } = useLocalSearchParams();
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const [problema, setProblema] = useState<string>();

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  // El parámetro llega como texto: se valida como cualquier entrada.
  const id =
    typeof parametro === 'string' && ENTERO.test(parametro) ? Number(parametro) : undefined;

  useEffect(() => {
    if (parametro === undefined) {
      setEstado({ paso: 'listo' });
      return;
    }
    if (id === undefined) {
      setEstado({ paso: 'no_encontrado' });
      return;
    }
    let vigente = true;
    productos.leer(id).then(
      (producto) => {
        if (vigente) setEstado(producto ? { paso: 'listo', producto } : { paso: 'no_encontrado' });
      },
      () => {
        if (vigente) setEstado({ paso: 'no_encontrado' });
      },
    );
    return () => {
      vigente = false;
    };
  }, [id]);

  const guardar = async (producto: Producto) => {
    setProblema(undefined);
    setGuardando(true);
    try {
      await productos.guardar(producto);
      router.back();
    } catch (error) {
      registro.error('no se pudo guardar el producto', error);
      setProblema('No se pudo guardar el producto. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (producto: Producto) => {
    setConfirmandoBorrar(false);
    if (producto.id === undefined) return;
    try {
      await productos.borrar(producto.id);
      router.back();
    } catch (error) {
      registro.error('no se pudo borrar el producto', error);
      setProblema('No se pudo borrar el producto. Probá de nuevo.');
    }
  };

  const editando = estado.paso === 'listo' ? estado.producto : undefined;

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: editando ? 'Producto o servicio' : 'Nuevo producto' }} />
      {estado.paso === 'no_encontrado' && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se encontró el producto.
        </Aviso>
      )}
      {estado.paso === 'listo' && configurada && (
        <ScrollView
          contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}
          keyboardShouldPersistTaps="handled"
        >
          <FormularioDeProducto
            {...(editando && { inicial: editando })}
            conIva={facturaIva(configurada.emisor.datos.condicion)}
            textoDelBoton={editando ? 'Guardar cambios' : 'Guardar producto'}
            onListo={(producto) => void guardar(producto)}
            ocupado={guardando}
          />
          {problema !== undefined && (
            <Aviso icono="alert-circle-outline" tono="error">
              {problema}
            </Aviso>
          )}
          {editando && (
            <Boton
              variante="texto"
              icon="delete-outline"
              onPress={() => {
                setConfirmandoBorrar(true);
              }}
            >
              Borrar del catálogo
            </Boton>
          )}
          {editando && (
            <DialogoDeConfirmacion
              visible={confirmandoBorrar}
              titulo="¿Borrar del catálogo?"
              mensaje="Las facturas que ya lo incluyen no cambian."
              confirmar="Borrar"
              onConfirmar={() => void borrar(editando)}
              onCancelar={() => {
                setConfirmandoBorrar(false);
              }}
            />
          )}
        </ScrollView>
      )}
    </Pantalla>
  );
}
