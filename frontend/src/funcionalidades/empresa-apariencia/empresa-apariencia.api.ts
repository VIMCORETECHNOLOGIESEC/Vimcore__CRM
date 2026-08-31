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
 * Consumido por `EmpresaAparienciaPage.tsx` (self-service) como capa de
 * datos; el hook de mutación vive en `./useEmpresaApariencia`.
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

/**
 * `POST /empresas/actual/apariencia/logo` -- mismo guard self-service que el
 * `PATCH` de arriba (`postEmpresaAparienciaLogo`,
 * `backend/src/controllers/empresa-apariencia.controller.ts`). Multipart con
 * un único campo `logo` (`uploadLogoMiddleware`, Multer). El backend devuelve
 * la `EmpresaAparienciaView` completa ya actualizada; acá solo se expone la
 * URL nueva porque es lo único que le importa a `CampoLogoUpload`.
 */
export async function uploadLogoEmpresaApi(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("logo", file);
  const apariencia = await httpClient.postFormData<EmpresaAparienciaView>(
    "/empresas/actual/apariencia/logo",
    formData,
  );
  return apariencia.logoUrl ?? "";
}
