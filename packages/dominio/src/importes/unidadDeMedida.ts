import { Cantidad } from './cantidad';

/**
 * Las unidades de medida más usadas, con el código de la tabla de unidades de ARCA. WSFEv1 no
 * recibe los ítems: el código queda para un web service con detalle de ítems.
 *
 * La clave es la que se guarda. No sirve el código de ARCA, porque su tabla no tiene horas ni
 * servicios: los dos se informan como "otras unidades".
 */
export class UnidadDeMedida {
  private constructor(
    readonly clave: string,
    readonly codigoArca: number,
    /** Para elegirla: `Kilogramos`. */
    readonly nombre: string,
    private readonly formaDeEscribir:
      { readonly simbolo: string } | { readonly singular: string; readonly plural: string },
  ) {}

  static readonly UNIDADES = new UnidadDeMedida('unidades', 7, 'Unidades', {
    singular: 'unidad',
    plural: 'unidades',
  });
  static readonly KILOGRAMOS = new UnidadDeMedida('kilogramos', 1, 'Kilogramos', { simbolo: 'kg' });
  static readonly GRAMOS = new UnidadDeMedida('gramos', 14, 'Gramos', { simbolo: 'g' });
  static readonly LITROS = new UnidadDeMedida('litros', 5, 'Litros', {
    // Con mayúscula: una ele minúscula junto al número se lee como un uno.
    simbolo: 'L',
  });
  static readonly METROS = new UnidadDeMedida('metros', 2, 'Metros', { simbolo: 'm' });
  static readonly METROS_CUADRADOS = new UnidadDeMedida('metros_cuadrados', 3, 'Metros²', {
    simbolo: 'm²',
  });
  static readonly HORAS = new UnidadDeMedida('horas', 98, 'Horas', {
    singular: 'hora',
    plural: 'horas',
  });
  static readonly SERVICIOS = new UnidadDeMedida('servicios', 98, 'Servicios', {
    singular: 'servicio',
    plural: 'servicios',
  });

  static readonly TODAS: readonly UnidadDeMedida[] = [
    UnidadDeMedida.UNIDADES,
    UnidadDeMedida.KILOGRAMOS,
    UnidadDeMedida.GRAMOS,
    UnidadDeMedida.LITROS,
    UnidadDeMedida.METROS,
    UnidadDeMedida.METROS_CUADRADOS,
    UnidadDeMedida.HORAS,
    UnidadDeMedida.SERVICIOS,
  ];

  static desdeClave(clave: string): UnidadDeMedida | undefined {
    return UnidadDeMedida.TODAS.find((unidad) => unidad.clave === clave);
  }

  /** La cantidad con su unidad: `2,5 kg`, `1 hora`, `3 unidades`. */
  formatear(cantidad: Cantidad): string {
    const numero = cantidad.formatear();
    const forma = this.formaDeEscribir;
    if ('simbolo' in forma) return `${numero} ${forma.simbolo}`;
    const esUna = cantidad.milesimas === Cantidad.UNO.milesimas;
    return `${numero} ${esUna ? forma.singular : forma.plural}`;
  }
}
