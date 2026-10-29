import {
  AlicuotaIva,
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  CondicionIvaReceptor,
  Cuit,
  Dni,
  Emisor,
  FechaCalendario,
  TipoComprobante,
  UnidadDeMedida,
  type Receptor,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { escapar, htmlDelComprobante, type DatosDelDocumento } from './htmlDelComprobante';
import { autorizado, emisor, item, sinAutorizar, valor } from './paraPruebas';

const conCuit: Receptor = {
  identificacion: { tipo: 'cuit', cuit: valor(Cuit.crear('30712345671')) },
  condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  nombre: 'Ferretería Sur',
  domicilio: 'Belgrano 123, Rosario',
};

const documento = (cambios: Partial<DatosDelDocumento> = {}): DatosDelDocumento => ({
  comprobante: autorizado(),
  emisor,
  receptor: CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  puntoDeVenta: 2,
  numero: 15,
  deHomologacion: false,
  ...cambios,
});

const facturaA = autorizado({
  tipo: TipoComprobante.FACTURA_A,
  receptor: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  identificacionReceptor: conCuit.identificacion,
  modoDePrecio: 'neto',
  items: [item('Tornillos', '1.000'), item('Libros', '500', AlicuotaIva.DIEZ_Y_MEDIO)],
});

describe('htmlDelComprobante', () => {
  it('incluye los datos obligatorios del emisor y del comprobante', () => {
    const html = htmlDelComprobante(documento());

    for (const dato of [
      'Juana Pérez',
      'Av. Siempreviva 742, Rosario',
      'IVA Responsable Inscripto',
      'CUIT: 27-33333333-9',
      'Inicio de actividades: 01/03/1998',
      '<strong>B</strong>',
      'Cód. 006',
      '00002-00000015',
      'Fecha de emisión: 27/10/2026',
      'Condición frente al IVA: Consumidor Final',
      'Tornillos',
      'CAE: <b>76123456789012</b>',
      'Vencimiento del CAE: 06/11/2026',
      '<svg',
    ]) {
      expect(html).toContain(dato);
    }
  });

  it('muestra los datos del receptor identificado', () => {
    const html = htmlDelComprobante(documento({ comprobante: facturaA, receptor: conCuit }));

    expect(html).toContain('Razón social: Ferretería Sur');
    expect(html).toContain('CUIT: 30-71234567-1');
    expect(html).toContain('Domicilio: Belgrano 123, Rosario');
    expect(html).toContain('Condición frente al IVA: IVA Responsable Inscripto');
  });

  it('muestra Ingresos Brutos del emisor si lo cargó', () => {
    const conIngresosBrutos = valor(
      Emisor.crear({ ...emisor.datos, ingresosBrutos: 'Convenio Multilateral 901-1' }),
    );

    expect(htmlDelComprobante(documento({ emisor: conIngresosBrutos }))).toContain(
      'Ingresos Brutos: Convenio Multilateral 901-1',
    );
    expect(htmlDelComprobante(documento())).not.toContain('Ingresos Brutos');
  });

  it('muestra el DNI de un consumidor final identificado', () => {
    const html = htmlDelComprobante(
      documento({
        receptor: {
          identificacion: { tipo: 'dni', dni: valor(Dni.crear('30123456')) },
          condicion: CondicionIvaReceptor.CONSUMIDOR_FINAL,
        },
      }),
    );

    expect(html).toContain('DNI: 30123456');
  });

  it('la factura A discrimina neto e IVA por alícuota', () => {
    const html = htmlDelComprobante(documento({ comprobante: facturaA, receptor: conCuit }));

    expect(html).toContain('Neto gravado al 21 %');
    expect(html).toContain('IVA 10,5 %');
    expect(html).toContain('$ 52,50');
    expect(html).toContain('Total</td><td class="numero">$ 1.762,50');
    expect(html).toContain('Precio unitario sin IVA');
  });

  it('la factura B informa el IVA contenido (Ley 27.743)', () => {
    const html = htmlDelComprobante(documento());

    expect(html).toContain('IVA contenido $ 210,00');
    expect(html).toContain('Precio unitario con IVA');
    expect(html).not.toContain('Neto gravado');
  });

  it('la factura C muestra solo el total', () => {
    const facturaC = autorizado({ tipo: TipoComprobante.FACTURA_C, items: [item('Clase', '800')] });
    const html = htmlDelComprobante(documento({ comprobante: facturaC }));

    expect(html).toContain('Total</td><td class="numero">$ 800,00');
    expect(html).not.toContain('IVA contenido');
    expect(html).not.toContain('Neto gravado');
  });

  it('muestra cada cantidad con su unidad', () => {
    const comprobante = autorizado({
      items: [
        { ...item('Pintura', '1.000'), unidad: UnidadDeMedida.LITROS },
        item('Pincel', '500'),
      ],
    });
    const html = htmlDelComprobante(documento({ comprobante }));

    expect(html).toContain('<td class="numero">1 L</td>');
    expect(html).toContain('<td class="numero">1 unidad</td>');
  });

  it('una factura no muestra comprobante asociado', () => {
    const html = htmlDelComprobante(documento());

    expect(html).toContain('<h2>Factura</h2>');
    expect(html).toContain('<title>Factura B 00002-00000015</title>');
    expect(html).not.toContain('Comprobante asociado');
  });

  it('la nota de crédito se nombra e informa la factura que ajusta', () => {
    const nota = autorizado({
      tipo: TipoComprobante.NOTA_DE_CREDITO_B,
      asociado: {
        tipo: TipoComprobante.FACTURA_B,
        puntoDeVenta: 2,
        numero: 14,
        fechaDeEmision: valor(FechaCalendario.crear(2026, 10, 20)),
      },
    });
    const html = htmlDelComprobante(documento({ comprobante: nota }));

    expect(html).toContain('<title>Nota de crédito B 00002-00000015</title>');
    expect(html).toContain('<h2>Nota de crédito</h2>');
    expect(html).toContain('Cód. 008');
    expect(html).toContain(
      'Comprobante asociado: <b class="sin-corte">Factura B 00002-00000014</b> del 20/10/2026',
    );
  });

  it('marca lo emitido en homologación', () => {
    expect(htmlDelComprobante(documento({ deHomologacion: true }))).toContain('sin validez fiscal');
    expect(htmlDelComprobante(documento())).not.toContain('sin validez fiscal');
  });

  describe('seguridad', () => {
    const malicioso = `<script>alert("x")</script><img src=x onerror=alert(1)>'`;
    const html = htmlDelComprobante(
      documento({
        comprobante: autorizado({ items: [item(malicioso, '100')] }),
        receptor: { ...conCuit, nombre: malicioso, domicilio: malicioso },
      }),
    );

    it('escapa lo que escribe el usuario', () => {
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
      expect(html).toContain('&#39;');
    });

    it('no carga recursos remotos ni permite scripts', () => {
      expect(html).toContain(
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`,
      );
      // Ninguna etiqueta real tiene src ni href; el texto escapado del usuario no cuenta.
      expect(html).not.toMatch(/<[^>]*\s(src|href)=/);
      expect(html).not.toMatch(/url\(/);
    });
  });

  describe('logo', () => {
    it('sin logo no hay imagen', () => {
      expect(htmlDelComprobante(documento())).not.toContain('class="logo"');
    });

    it('va embebido como PNG, sin cargar nada de afuera', () => {
      const html = htmlDelComprobante(documento({ logo: 'iVBORw0KGgo=' }));

      expect(html).toContain('<img class="logo" src="data:image/png;base64,iVBORw0KGgo=" alt="">');
      // La única etiqueta con src es la del logo, y es un dato embebido.
      expect(html.match(/<[^>]*\s(src|href)=/g)).toEqual(['<img class="logo" src=']);
    });

    it('un logo que no es base64 no se inserta', () => {
      const html = htmlDelComprobante(documento({ logo: 'x" onerror="alert(1)' }));

      expect(html).not.toContain('onerror');
      expect(html).not.toContain('class="logo"');
    });
  });

  it('no arma el documento de un comprobante sin autorizar', () => {
    expect(() => htmlDelComprobante(documento({ comprobante: sinAutorizar() }))).toThrow(
      'autorizado',
    );
  });
});

describe('escapar', () => {
  it('reemplaza los caracteres con significado en HTML', () => {
    expect(escapar(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &#39; f');
  });
});
