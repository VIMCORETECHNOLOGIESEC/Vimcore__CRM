import { httpClient, type QueryParamValue } from "@/api/httpClient";

/**
 * Capa de datos del editor cross-empresa de holding
 * (`docs/blocks/d0-visualizacion-multitenant.md`, PASO 8 --
 * `PATCH /empresas/:empresaId/apariencia`, exclusivo sessionScope `holding`).
 * Distinta de `empresa-apariencia.api.ts` (self-service, siempre sobre la
 * propia empresa de la sesión, `/empresas/actual/apariencia`): acá el id
 * viene explícito por parámetro, nunca de la sesión, porque el caso de uso
 * es editar CUALQUIER `Empresa` de la instancia.
 *
 * `GET /empresas` (listado, ver `fetchEmpresasHoldingApi` más abajo) ya
 * existe -- resuelve el gap de backend documentado antes acá y en
 * `docs/blocks/d0-visualizacion-multitenant.md` (PASO 8, excepción
 * 2026-08-29, último bullet). Consumido por `GestorEmpresasPage.tsx`.
 */
export interface EmpresaAparienciaHoldingView {
  id: string;
  nombre: string;
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}

export interface UpdateEmpresaAparienciaHoldingInput {
  nombre?: string;
  colorPrimario?: string | null;
  colorSecundario?: string | null;
  logoUrl?: string | null;
}

/**
 * Query params de `GET /empresas` (paginación server-side, contrato fijo
 * acordado con el backend -- 1-based `page`, default 1; `pageSize` default
 * 25; `search` filtra por nombre). A diferencia de `UsuariosQueryParams`
 * (F7, `pagina`/`limite`/`busqueda`), este endpoint usa nombres en inglés --
 * no lo homogeneizamos porque el contrato ya está fijo del lado del backend.
 */
export interface EmpresasHoldingQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface EmpresasHoldingResponse {
  items: EmpresaAparienciaHoldingView[];
  total: number;
}

/** `PATCH /empresas/:empresaId/apariencia` -- solo sessionScope `holding` + rol `ADMINISTRADOR`. */
export async function updateEmpresaAparienciaHoldingApi(
  empresaId: string,
  input: UpdateEmpresaAparienciaHoldingInput,
): Promise<EmpresaAparienciaHoldingView> {
  return httpClient.patch<EmpresaAparienciaHoldingView>(`/empresas/${empresaId}/apariencia`, input);
}

/**
 * `GET /empresas` -- solo sessionScope `holding` + rol `ADMINISTRADOR`.
 * Listado paginado y filtrable de todas las `Empresa` de la instancia,
 * ordenado por nombre (server-side). `page`/`pageSize`/`search` son
 * opcionales -- omitirlos deja que el backend aplique sus defaults
 * (`page=1`, `pageSize=25`). Alimenta `GestorEmpresasPage.tsx`.
 */
export async function fetchEmpresasHoldingApi(
  params: EmpresasHoldingQueryParams = {},
): Promise<EmpresasHoldingResponse> {
  return httpClient.get<EmpresasHoldingResponse>("/empresas", {
    params: params as Record<string, QueryParamValue>,
  });
}
