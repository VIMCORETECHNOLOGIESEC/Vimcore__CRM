import { httpClient } from "@/api/httpClient";

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

/** `PATCH /empresas/:empresaId/apariencia` -- solo sessionScope `holding` + rol `ADMINISTRADOR`. */
export async function updateEmpresaAparienciaHoldingApi(
  empresaId: string,
  input: UpdateEmpresaAparienciaHoldingInput,
): Promise<EmpresaAparienciaHoldingView> {
  return httpClient.patch<EmpresaAparienciaHoldingView>(`/empresas/${empresaId}/apariencia`, input);
}

/**
 * `GET /empresas` -- solo sessionScope `holding` + rol `ADMINISTRADOR`.
 * Listado de solo lectura de todas las `Empresa` de la instancia, sin
 * filtros, ordenado por nombre (ya resuelto server-side). Alimenta
 * `GestorEmpresasPage.tsx`.
 */
export async function fetchEmpresasHoldingApi(): Promise<EmpresaAparienciaHoldingView[]> {
  return httpClient.get<EmpresaAparienciaHoldingView[]>("/empresas");
}
