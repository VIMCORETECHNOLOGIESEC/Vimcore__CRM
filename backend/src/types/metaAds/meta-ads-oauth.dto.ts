import type { EstadoConexionCuentaAnuncios, RedSocial } from "@prisma/client";

export interface MetaAdsOAuthStartDto {
  authorizationUrl: string;
  expiraEn: string;
}

export interface MetaAdsCuentaDescubiertaDto {
  cuentaAnunciosIdExterno: string;
  nombre: string;
  moneda: string | null;
  zonaHoraria: string | null;
}

export interface MetaAdsOAuthCallbackDto {
  cuentas: MetaAdsCuentaDescubiertaDto[];
  seleccion: string;
  expiraEn: string;
}

export interface MetaAdsConexionDto {
  id: string;
  empresaId: string;
  cuentaAnunciosIdExterno: string;
  nombre: string;
  moneda: string | null;
  zonaHoraria: string | null;
  estado: EstadoConexionCuentaAnuncios;
  tokenExpiraEn: string | null;
  ultimaSincronizacionEn: string | null;
  ultimoError: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface MetaAdsRendimientoCampaniaDto {
  campaniaId: string;
  idExterno: string;
  nombreCampania: string;
  redSocial: RedSocial;
  moneda: string;
  gasto: number;
  impresiones: number;
  clics: number;
  alcance: number;
  leads: number;
  ventas: number;
  cpc: number | null;
  cpl: number | null;
  cac: number | null;
}
