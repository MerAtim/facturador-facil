import { Pantalla, Texto, useTema } from '@facturador/ui';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Punto } from '../alta/Punto';

/**
 * Qué puede y qué no puede hacer el certificado. Todo lo que dice es cierto por cómo funciona ARCA:
 * la autorización vale para un solo servicio, la factura electrónica, y nada más.
 */
export default function SobreElCertificado() {
  const { espacio } = useTema();
  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Qué hace el certificado' }} />
      <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.grande }}>
        <Seccion titulo="Qué puede hacer">
          <Punto icono="check-circle-outline">
            Pedirle a ARCA la autorización, el CAE, de las facturas que emitís desde la app.
          </Punto>
          <Punto icono="check-circle-outline">
            Consultar las facturas ya emitidas y tus puntos de venta.
          </Punto>
        </Seccion>

        <Seccion titulo="Qué no puede hacer">
          <Punto icono="close-circle-outline">
            Entrar a tu cuenta de ARCA ni a otros servicios.
          </Punto>
          <Punto icono="close-circle-outline">
            Pagar, presentar declaraciones ni cambiar tus datos.
          </Punto>
          <Punto icono="close-circle-outline">
            Conocer tu clave fiscal. La app nunca te la pide.
          </Punto>
        </Seccion>

        <Seccion titulo="Dónde queda la clave">
          <Punto icono="cellphone-lock">
            Se crea dentro de este teléfono y no se puede copiar ni sacar de él. Solo firma con el
            teléfono desbloqueado.
          </Punto>
        </Seccion>

        <Seccion titulo="Si perdés el teléfono o te arrepentís">
          <Punto icono="link-variant-off">
            En el sitio de ARCA, en &quot;Administrador de Relaciones de Clave Fiscal&quot;, borrás
            la relación con la app. Desde ese momento el certificado no sirve para nada. Lleva un
            minuto.
          </Punto>
        </Seccion>
      </ScrollView>
    </Pantalla>
  );
}

function Seccion({ titulo, children }: { readonly titulo: string; readonly children: ReactNode }) {
  const { espacio } = useTema();
  return (
    <View style={{ gap: espacio.medio }}>
      <Texto variante="subtitulo" accessibilityRole="header">
        {titulo}
      </Texto>
      {children}
    </View>
  );
}
