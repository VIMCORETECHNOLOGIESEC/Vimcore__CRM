import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * "Vista de empresa" de un holding-wide (reparto de trabajo, pantallas de
 * gestión jerárquica holding/empresa) -- NO es la sesión real (eso es
 * `AuthContext::sessionScope`/`empresaId`, resuelto en el login). Es una
 * vista de solo lectura simulada: un holding-wide "entra" a mirar una
 * empresa puntual pasando su id como query param `?empresaId=`, que
 * `UsuariosPage`/`BridgesPage`/`EmpresaDetallePage` reenvían al backend
 * (que todavía lo ignora -- mismo gap de scope ya reportado a Mateo;
 * forward-compatible para el día que lo soporte, ver
 * `usuarios.api.ts::UsuariosQueryParams.empresaId`).
 *
 * Implementado sobre `useSearchParams` (URL), no un Context de React nuevo:
 * es exactamente el mecanismo que ya usan en producción
 * `GestorEmpresasPage.tsx` ("Ver detalles" -> `/usuarios?empresaId=X`) y
 * `SalirVistaEmpresaButton.tsx` (lee/limpia el mismo param) -- este hook
 * solo nombra y centraliza esa lectura/escritura para que toda pantalla
 * nueva (`EmpresaDetallePage`) y las ya existentes usen la misma fuente de
 * verdad, sin duplicar lógica ni arriesgar un segundo estado que se
 * desincronice de la URL. Sobrevive a cualquier navegación interna y a un
 * refresh de página completo, porque vive en la URL.
 */
export function useVistaEmpresa() {
  const [searchParams, setSearchParams] = useSearchParams();
  const empresaVistaId = searchParams.get("empresaId");

  const entrarAEmpresa = useCallback(
    (empresaId: string) => {
      setSearchParams((prev) => {
        const siguiente = new URLSearchParams(prev);
        siguiente.set("empresaId", empresaId);
        return siguiente;
      });
    },
    [setSearchParams],
  );

  const salirDeEmpresa = useCallback(() => {
    setSearchParams((prev) => {
      const siguiente = new URLSearchParams(prev);
      siguiente.delete("empresaId");
      return siguiente;
    });
  }, [setSearchParams]);

  return { empresaVistaId, entrarAEmpresa, salirDeEmpresa };
}
