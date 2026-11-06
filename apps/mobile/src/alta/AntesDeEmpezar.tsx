import { Boton, Tarjeta, Texto } from '@facturador/ui';
import { useRouter } from 'expo-router';

import { Punto } from './Punto';

/** Qué se va a hacer y por qué, antes del primer paso: quien entiende el motivo no abandona. */
export function AntesDeEmpezar() {
  const router = useRouter();
  return (
    <Tarjeta>
      <Texto variante="subtitulo" accessibilityRole="header">
        Conectar la app con ARCA
      </Texto>
      <Texto variante="cuerpo">
        Esta app no es de ARCA. Para que pueda pedir facturas con tu CUIT, ARCA exige un certificado
        digital: es su forma de que una app facture sin que le des tu clave fiscal.
      </Texto>
      <Punto icono="clock-outline" titulo="Cuánto lleva">
        Unos 15 minutos, una sola vez. El certificado dura dos años y la app te avisa antes de que
        venza.
      </Punto>
      <Punto icono="key-outline" titulo="Qué necesitás">
        Tu clave fiscal nivel 3 y el teléfono con bloqueo de pantalla: un PIN, un patrón o tu
        huella.
      </Punto>
      <Punto icono="cellphone" titulo="Dónde">
        En el sitio de ARCA. Lo podés hacer desde este mismo teléfono.
      </Punto>
      <Texto variante="cuerpo">
        Podés dejarlo a mitad de camino: la app recuerda en qué paso quedaste.
      </Texto>
      <Boton
        variante="texto"
        icon="shield-check-outline"
        onPress={() => {
          router.push('/sobre-el-certificado');
        }}
      >
        Qué puede hacer el certificado
      </Boton>
    </Tarjeta>
  );
}
