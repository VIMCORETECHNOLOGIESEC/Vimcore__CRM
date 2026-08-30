import { httpClient } from "@/api/httpClient";
import { CONFIGURACION_EMPRESA_DEFAULT, type ConfiguracionEmpresa } from "./configuracion-empresa.api";

/**
 * PASO 5 (tema-empresarial-integracion): capa de datos del ÚNICO endpoint
 * de branding sin autenticación (`GET /marca-publica`) -- para los dos
 * lugares que todavía no tienen sesión: el boot de la SPA (`AppBoot.tsx`) y
 * la pantalla de login (`LoginPage.tsx`, panel izquierdo). Misma forma que
 * `ConfiguracionEmpresa` (nombre/colores/logo) -- es literalmente el mismo
 * subconjunto público del backend (`configuracion-empresa.service.ts::getConfiguracion`,
 * reusado sin duplicar por `marca-publica.controller.ts`), distinto solo en
 * que no requiere `Authorization`.
 */
export type MarcaPublica = ConfiguracionEmpresa;

/** `GET /marca-publica` -- sin token, `skipAuth: true` (nunca adjunta `Authorization`). */
export async function fetchMarcaPublicaApi(): Promise<MarcaPublica> {
  return httpClient.get<MarcaPublica>("/marca-publica", { skipAuth: true });
}

/**
 * Tope de espera antes de resolver con los defaults de fábrica -- mismo
 * criterio/valor que `LoginPage.tsx::CONFIGURACION_EMPRESA_TIMEOUT_MS`: este
 * fetch es puramente cosmético (branding pre-login), nunca debe demorar ni
 * romper el boot/login.
 */
const MARCA_PUBLICA_TIMEOUT_MS = 1200;

/**
 * Trae la marca pública con `fallback` silencioso a `CONFIGURACION_EMPRESA_DEFAULT`
 * ante cualquier falla de red o demora -- usado por `AppBoot.tsx` (cortina
 * de arranque) y `LoginPage.tsx` (panel de isotipo), los dos únicos lugares
 * sin sesión todavía. A diferencia de
 * `LoginPage.tsx::obtenerConfiguracionEmpresaConFallback` (que sí pasa por
 * `queryClient.fetchQuery` porque corre DESPUÉS del login, con
 * `QueryClientProvider` ya montado), este helper no depende de TanStack
 * Query -- `AppBoot.tsx` se monta ANTES de `<App/>`, fuera de ese provider.
 */
export async function obtenerMarcaPublicaConFallback(): Promise<MarcaPublica> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error("marca_publica_timeout")),
      MARCA_PUBLICA_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([fetchMarcaPublicaApi(), timeout]);
  } catch {
    return CONFIGURACION_EMPRESA_DEFAULT;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}
