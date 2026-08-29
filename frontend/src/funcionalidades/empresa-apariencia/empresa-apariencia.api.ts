import { httpClient } from "@/api/httpClient";

/**
 * Capa de datos del color de marca PROPIO de la empresa de la sesión
 * (tema-empresarial-integracion, Tarea 3 -- fundacional para trabajo
 * futuro). Distinto de `configuracion-empresa.api.ts`: aquella es el
 * branding GLOBAL de la instancia/holding (singleton, cualquier empresa sin
 * color propio cae ahí); este módulo es self-service, exclusivo del
 * ADMINISTRADOR de UNA empresa sobre SU PROPIA `Empresa.colorPrimario/
 * colorSecundario` (backend: `PATCH /empresas/actual/apariencia`, scoped al
 * `empresaId` de la sesión -- nunca un id que venga del cliente).
 *
 * Sin componente de UI todavía a propósito -- ver la nota de alcance en la
 * tarea que introduce este archivo. Esto es solo la capa de datos +
 * el hook de mutación.
 */
export interface EmpresaAparienciaView {
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}

export interface UpdateEmpresaAparienciaInput {
  colorPrimario: string | null;
  colorSecundario: string | null;
  /** Opcional -- omitir el campo deja el isotipo sin tocar (backend: `PATCH /empresas/actual/apariencia`). */
  logoUrl?: string | null;
}

/** `PATCH /empresas/actual/apariencia` -- solo `ADMINISTRADOR` de una sesión `company`. */
export async function updateEmpresaAparienciaApi(
  input: UpdateEmpresaAparienciaInput,
): Promise<EmpresaAparienciaView> {
  return httpClient.patch<EmpresaAparienciaView>("/empresas/actual/apariencia", input);
}
