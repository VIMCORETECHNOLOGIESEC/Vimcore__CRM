import { httpClient } from "@/api/httpClient";

/**
 * Capa de datos de la configuración de marca de la empresa (tema empresarial
 * -- integración login + splash de bienvenida). Esta es la ÚNICA
 * configuración global del holding -- no hay selector de empresa acá porque
 * este endpoint edita el único registro de configuración global, no porque
 * la infraestructura multi-tenant (`Empresa`/`Membresia`/RLS, AGENTS.md §1)
 * no exista -- ver la nota de alcance en `ConfiguracionEmpresaPage.tsx`.
 *
 * Contrato confirmado con el backend en paralelo (mismo cambio,
 * `feature/tema-empresarial-integracion`):
 * - `GET /configuracion-empresa` -- cualquier usuario autenticado.
 * - `PATCH /configuracion-empresa` -- solo `ADMINISTRADOR` (401/403 para el
 *   resto, ya cubierto por la ruta protegida en `router.tsx` y por el
 *   manejo global de errores de mutaciones, `api/queryClient.ts`).
 */

export interface ConfiguracionEmpresa {
  nombre: string;
  /** Hex de 6 dígitos con `#`, ej. `"#1e2a5e"`. */
  colorPrimario: string;
  /** Hex de 6 dígitos con `#`, ej. `"#2563eb"`. */
  colorSecundario: string;
  /**
   * PASO 6 (tema-empresarial-integracion): URL del isotipo del holding --
   * `null` cuando nunca se configuró ninguno (no hay un logo de fábrica).
   */
  logoUrl: string | null;
}

export type UpdateConfiguracionEmpresaInput = Partial<ConfiguracionEmpresa>;

/**
 * Defaults si nunca se configuró nada -- se usa como *fallback* del frontend
 * cuando `GET /configuracion-empresa` falla o no llega a tiempo (ver
 * `LoginPage.tsx`), nunca como sustituto silencioso de una respuesta exitosa
 * del backend.
 *
 * Línea gráfica ARCANO CRM (rebrandeo de cliente, `docs/branding/arcano-
 * linea-grafica.md` en la rama `cliente/arcano-crm`): grafito `#241F1B`
 * (`--arcano-graphite-900`) + dorado `#B98A4E` (`--arcano-gold`), paleta
 * extraída del isotipo del cliente y verificada por contraste WCAG en ese
 * doc. Ya NO coincide con el default de fábrica del backend ("CRM Embudo de
 * Leads", `#1e2a5e`/`#2563eb`) -- divergencia intencional para este cliente,
 * solo visible en el instante breve de un fallback (el nombre/color real en
 * uso normal viaja siempre por `GET /configuracion-empresa`).
 */
export const CONFIGURACION_EMPRESA_DEFAULT: ConfiguracionEmpresa = {
  nombre: "ARCANO CRM",
  colorPrimario: "#241F1B",
  colorSecundario: "#B98A4E",
  logoUrl: null,
};

/** `GET /configuracion-empresa` -- cualquier usuario autenticado. */
export async function fetchConfiguracionEmpresaApi(): Promise<ConfiguracionEmpresa> {
  return httpClient.get<ConfiguracionEmpresa>("/configuracion-empresa");
}

/**
 * `PATCH /configuracion-empresa` -- solo `ADMINISTRADOR`. Body parcial:
 * el backend devuelve el objeto completo ya actualizado, no solo los campos
 * enviados.
 */
export async function updateConfiguracionEmpresaApi(
  input: UpdateConfiguracionEmpresaInput,
): Promise<ConfiguracionEmpresa> {
  return httpClient.patch<ConfiguracionEmpresa>("/configuracion-empresa", input);
}

/**
 * `POST /configuracion-empresa/logo` -- solo `ADMINISTRADOR`
 * (`postConfiguracionEmpresaLogo`,
 * `backend/src/controllers/configuracion-empresa.controller.ts`). Multipart
 * con un único campo `logo` (`uploadLogoMiddleware`, Multer). El backend
 * devuelve la `ConfiguracionEmpresa` completa ya actualizada; acá solo se
 * expone la URL nueva porque es lo único que le importa a `CampoLogoUpload`.
 */
export async function uploadLogoHoldingApi(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("logo", file);
  const configuracion = await httpClient.postFormData<ConfiguracionEmpresa>(
    "/configuracion-empresa/logo",
    formData,
  );
  return configuracion.logoUrl ?? "";
}
