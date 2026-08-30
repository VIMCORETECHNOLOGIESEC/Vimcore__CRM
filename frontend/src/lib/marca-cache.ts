import { CONFIGURACION_EMPRESA_DEFAULT } from "@/funcionalidades/configuracion-empresa/configuracion-empresa.api";
import type { AuthenticatedUser } from "@/tipos/usuario";

/**
 * Cache optimista de la ÚLTIMA marca conocida en este navegador (fix "boot
 * desincronizado" -- al recargar con sesión activa, `AppBoot.tsx` pintaba
 * primero el branding público del holding y recién después el real de la
 * empresa, un corte visual brusco). Se escribe acá cada vez que `GET
 * /auth/perfil` resuelve con éxito (`AuthContext.tsx`) y se lee en
 * `AppBoot.tsx` para pintar el splash inicial mientras la query real
 * (`GET /marca-publica`) resuelve en paralelo.
 *
 * IMPORTANTE -- este dato es stale por diseño, nunca fuente de verdad: puede
 * pertenecer a otra empresa si otro usuario usó el mismo navegador después
 * (estación compartida), o estar desactualizado si un admin cambió el color
 * entre sesiones. La query real sigue gobernando el estado final; esta cache
 * solo evita el parpadeo del instante inicial.
 */
export const MARCA_CONOCIDA_STORAGE_KEY = "crm.marcaConocida";

export interface MarcaConocida {
  empresaId: string | null;
  nombre: string;
  colorPrimario: string;
  colorSecundario: string;
}

/**
 * Resuelve la marca a cachear a partir de un perfil recién hidratado --
 * mismo criterio de nivel 1 vs. nivel 3 (sin nivel 2, la config EN VIVO del
 * holding, que no está disponible en `AuthContext.tsx`) que
 * `color-marca.ts::resolveEstilosMarca`/`resolveNombreMarca`: color/nombre
 * propio de la `Empresa` si la sesión es `company` y los tiene seteados,
 * default de fábrica en cualquier otro caso (sesión `holding`, o `company`
 * sin color propio).
 */
function resolveMarcaParaCache(perfil: AuthenticatedUser): MarcaConocida {
  const tieneColorPropio =
    perfil.sessionScope === "company" &&
    perfil.empresaColorPrimario !== null &&
    perfil.empresaColorSecundario !== null;

  return {
    empresaId: perfil.empresaId,
    nombre:
      perfil.sessionScope === "company" && perfil.empresaNombre !== null
        ? perfil.empresaNombre
        : CONFIGURACION_EMPRESA_DEFAULT.nombre,
    colorPrimario: tieneColorPropio
      ? (perfil.empresaColorPrimario as string)
      : CONFIGURACION_EMPRESA_DEFAULT.colorPrimario,
    colorSecundario: tieneColorPropio
      ? (perfil.empresaColorSecundario as string)
      : CONFIGURACION_EMPRESA_DEFAULT.colorSecundario,
  };
}

/**
 * Persiste la marca conocida a partir de un perfil recién hidratado.
 * `localStorage` puede no estar disponible (modo privado estricto, contextos
 * sin `window`) -- degrada a "sin cache" en vez de romper la hidratación de
 * sesión, mismo criterio que `httpClient.ts::persistRefreshToken`.
 */
export function persistMarcaConocida(perfil: AuthenticatedUser): void {
  try {
    localStorage.setItem(
      MARCA_CONOCIDA_STORAGE_KEY,
      JSON.stringify(resolveMarcaParaCache(perfil)),
    );
  } catch {
    // Sin persistencia disponible, el próximo boot simplemente no tiene
    // cache que leer -- comportamiento actual sin cambios.
  }
}

/** Type guard defensivo: nunca confía en la forma de lo que hay en `localStorage`. */
function isMarcaConocidaValida(valor: unknown): valor is MarcaConocida {
  if (typeof valor !== "object" || valor === null) return false;
  const candidata = valor as Partial<MarcaConocida>;
  return (
    (candidata.empresaId === null || typeof candidata.empresaId === "string") &&
    typeof candidata.nombre === "string" &&
    typeof candidata.colorPrimario === "string" &&
    typeof candidata.colorSecundario === "string"
  );
}

/** Lee la última marca conocida, o `null` si no hay ninguna (o está corrupta). */
export function getMarcaConocida(): MarcaConocida | null {
  try {
    const raw = localStorage.getItem(MARCA_CONOCIDA_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isMarcaConocidaValida(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
