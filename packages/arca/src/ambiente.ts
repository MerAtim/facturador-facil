import type { Ambiente } from '@facturador/aplicacion';

export type { Ambiente };

interface Urls {
  readonly wsaa: string;
  readonly wsfe: string;
  /** Constancia de inscripción, versión A5. */
  readonly padron: string;
}

export const URLS: Readonly<Record<Ambiente, Urls>> = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    padron: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
    padron: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  },
};
