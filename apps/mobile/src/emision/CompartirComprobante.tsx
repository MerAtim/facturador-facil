import { mensajeSugerido, type DatosDelDocumento } from '@facturador/documentos';
import { Aviso, Boton, CampoDeTexto, useTema } from '@facturador/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { registro } from '../composicion';
import { compartirFactura } from './compartirFactura';

/** El mensaje para el cliente y el botón que arma el PDF y abre la hoja de compartir. */
export function CompartirComprobante({ documento }: { readonly documento: DatosDelDocumento }) {
  const { espacio } = useTema();
  const [compartiendo, setCompartiendo] = useState(false);
  const [noSeCompartio, setNoSeCompartio] = useState(false);
  // Sin escribir nada, se usa el mensaje sugerido.
  const [mensaje, setMensaje] = useState<string>();

  const { comprobante, puntoDeVenta, numero, emisor } = documento;
  const sugerido = mensajeSugerido({
    tipo: comprobante.datos.tipo,
    puntoDeVenta,
    numero,
    total: comprobante.totales.total.formatear(),
    emisor: emisor.datos.razonSocial,
  });

  const compartir = async () => {
    setNoSeCompartio(false);
    setCompartiendo(true);
    try {
      await compartirFactura(documento, mensaje ?? sugerido);
    } catch (error) {
      registro.error('no se pudo generar o compartir el pdf', error);
      setNoSeCompartio(true);
    } finally {
      setCompartiendo(false);
    }
  };

  return (
    <View style={{ gap: espacio.chico }}>
      <CampoDeTexto
        etiqueta="Mensaje para el cliente"
        valor={mensaje ?? sugerido}
        onCambiar={setMensaje}
        multilinea
        maximo={500}
      />
      <Boton
        icon="share-variant"
        onPress={() => void compartir()}
        loading={compartiendo}
        disabled={compartiendo}
      >
        {`Compartir ${comprobante.datos.tipo.nombre.toLowerCase()}`}
      </Boton>
      {noSeCompartio && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se pudo generar el PDF. Probá de nuevo.
        </Aviso>
      )}
    </View>
  );
}
