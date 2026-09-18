import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { ApiError, getAuthLoginUrl, setOnSessionExpired } from "@/api/httpClient";
import { persistMarcaConocida } from "@/lib/marca-cache";
import type { AuthenticatedUser, RolUsuario } from "@/tipos/usuario";
import { getPerfilApi, logoutApi } from "./autenticacion.api";
import { hasRoleAccess } from "./permissions";
import { AuthContext, type AuthContextValue } from "./auth-context";

/** Código del gateway: autenticado en auth pero sin identidad vinculada en el CRM (T5 decide qué hacer). */
export const CRM_IDENTITY_NOT_LINKED = "CRM_IDENTITY_NOT_LINKED";

/**
 * Query key del perfil de sesión. Representa `GET /auth/perfil` (ver
 * `autenticacion.api.ts#getPerfilApi` y `backend/src/controllers/auth.controller.ts`).
 * Si el backend cambia la forma de esa respuesta, hay que mantener
 * sincronizado el tipo `AuthenticatedUser` en `@/tipos/usuario`.
 *
 * Exportada (tema-empresarial-integracion, Tarea 3): `useUpdateEmpresaApariencia`
 * (`funcionalidades/empresa-apariencia/useEmpresaApariencia.ts`) invalida esta
 * misma query tras restaurar el color propio de la empresa, para que el
 * cambio se refleje sin esperar un login nuevo -- sin duplicar el literal
 * `["auth", "perfil"]` en dos módulos.
 */
export const PERFIL_QUERY_KEY = ["auth", "perfil"] as const;

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, tabla de estados
 * de `AuthContext`, fila "Perfil incompleto o inconsistente"): guarda
 * defensiva del lado cliente, independiente de que el backend ya falle
 * cerrado (`auth.controller.ts::resolveEmpresaNombre`) ante una `Empresa`
 * irresoluble. Cubre el caso en que la respuesta de `GET /auth/perfil` es
 * un 200 bien formado pero semánticamente inconsistente (p. ej. drift de
 * contrato entre frontend y backend): una sesión `company` sin
 * `empresaId`/`empresaNombre` resueltos, o una sesión `holding` que sí trae
 * una empresa atribuida. No es tolerancia -- ninguna combinación fuera de
 * estas dos formas válidas hidrata la sesión.
 */
function isPerfilConsistente(perfil: AuthenticatedUser): boolean {
  if (perfil.sessionScope === "company") {
    return typeof perfil.empresaId === "string" && typeof perfil.empresaNombre === "string";
  }
  if (perfil.sessionScope === "holding") {
    return perfil.empresaId === null && perfil.empresaNombre === null;
  }
  return false;
}

/**
 * Termina el estado de sesión reactivo y purga cualquier otro dato
 * cacheado de la sesión saliente -- se invoca tanto en `logout()` explícito
 * como cuando `httpClient` reporta sesión expirada (un 401 también termina la
 * sesión sin pasar por el botón de logout).
 *
 * Riesgo que evita: sin esto, cualquier query cacheada por otro módulo que
 * no incluya `user.id` en su key (p. ej. `useLeads` -- el backend ya filtra
 * por el usuario del JWT, así que no lo necesita) sigue en caché después de
 * cerrar sesión. `useNotificaciones` sí incluye `user.id` en su key pese a
 * lo anterior: `useNotificacionesRealtime.ts` escribe/invalida sobre esa
 * misma clave al recibir eventos del canal SSE (M8), y `removeQueries` de
 * abajo la limpia igual (matchea por `queryKey[0]`, no por la clave
 * completa) -- así que el cierre de sesión sigue purgándola sin depender de
 * que la key sea corta. Con
 * `staleTime: 30_000` (`api/queryClient.ts`) y login/logout como navegación
 * SPA sin recarga de página, un segundo usuario que inicia sesión en la
 * misma pestaña dentro de esos 30 s (p. ej. cambio de turno en una estación
 * compartida) recibiría datos cacheados del usuario anterior sin ningún
 * request de red.
 *
 * Por qué no `queryClient.clear()` a secas: `clear()`/`removeQueries()`
 * destruyen el objeto `Query` interno de TanStack Query sin notificar a los
 * observers ya montados (no disparan `dispatch`), así que el observer de
 * `perfilQuery` -- todavía montado en este mismo `AuthProvider` -- queda
 * apuntando a un objeto "huérfano" con los datos viejos hasta el próximo
 * render, y nada dispara ese render. `setQueryData` sí notifica de
 * inmediato porque reutiliza el mismo objeto `Query` vivo. Por eso: primero
 * `setQueryData` (perfil pasa a `null` ya mismo, dispara la redirección de
 * `ProtectedRoute`), después `removeQueries` excluyendo esa query -- si se
 * la volviera a eliminar, el próximo `setQueryData` construiría
 * un `Query` nuevo desconectado del observer ya montado, rompiendo la
 * rehidratación siguiente en la misma pestaña.
 */
function clearSessionCache(queryClient: QueryClient): void {
  queryClient.setQueryData(PERFIL_QUERY_KEY, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== PERFIL_QUERY_KEY[0],
  });
}

/**
 * Estado de sesión. `user` es estado de servidor (`GET /auth/perfil`, vía el
 * gateway con la cookie `gw_session`) y vive en TanStack Query bajo la key
 * `["auth", "perfil"]` (AGENTS.md §4). El CRM ya no tiene login propio: al
 * arrancar la app hidrata la sesión con esa única llamada.
 *
 * Resultados de la `queryFn`:
 * - 200 consistente -> hidrata `user`.
 * - 401 (sin sesión de plataforma) -> `null`; `httpClient` ya redirigió al
 *   frontend de auth, y `ProtectedRoute` cubre el caso de la guarda anti-bucle.
 * - 403 `CRM_IDENTITY_NOT_LINKED` u otro error (502 `UPSTREAM_ERROR`, red) ->
 *   se propaga como `error` de la query, expuesto como `identityNotLinked` /
 *   `bootstrapError`. Nunca se redirige a auth por estos (evita bucles).
 *
 * `retry: false`, `refetchOnWindowFocus: false`, `refetchOnMount: false` y
 * `staleTime: Infinity`: comprobación de arranque de una sola vez. La validez
 * de la sesión durante el uso la gobierna el 401 de `httpClient.ts` (que
 * invoca `onSessionExpired` para limpiar la cache).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const perfilQuery = useQuery({
    queryKey: PERFIL_QUERY_KEY,
    queryFn: async (): Promise<AuthenticatedUser | null> => {
      try {
        const perfil = await getPerfilApi();
        return isPerfilConsistente(perfil) ? perfil : null;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  const user = perfilQuery.data ?? null;
  const identityNotLinked =
    perfilQuery.error instanceof ApiError && perfilQuery.error.code === CRM_IDENTITY_NOT_LINKED;
  const bootstrapError = perfilQuery.error && !identityNotLinked ? perfilQuery.error : null;

  useEffect(() => {
    setOnSessionExpired(() => clearSessionCache(queryClient));
    return () => setOnSessionExpired(null);
  }, [queryClient]);

  // Fix "boot desincronizado" (F5 con sesión activa): cada vez que el perfil
  // hidrata con éxito, deja en `localStorage` la última marca conocida
  // (`@/lib/marca-cache`) -- la lee `AppBoot.tsx` en el próximo arranque para
  // pintar el splash con ese branding en vez del público del holding, mientras
  // la query real resuelve en paralelo. Dato stale por diseño, ver comentario
  // en `marca-cache.ts`.
  useEffect(() => {
    if (user) persistMarcaConocida(user);
  }, [user]);

  // No hay sesión de CRM que cerrar: se destruye la sesión de plataforma en el
  // gateway y se manda al usuario al login del frontend de auth (navegación
  // completa, sin pasar por la guarda anti-bucle de `redirectToAuth`).
  const logout = useCallback(async () => {
    clearSessionCache(queryClient);
    try {
      await logoutApi();
    } catch {
      // Un fallo de red no es accionable: se redirige igual.
    }
    window.location.assign(getAuthLoginUrl());
  }, [queryClient]);

  const hasRole = useCallback(
    (allowedRoles?: readonly RolUsuario[]) => hasRoleAccess(user?.rol, allowedRoles),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading: perfilQuery.isLoading,
      identityNotLinked,
      bootstrapError,
      logout,
      hasRole,
    }),
    [user, perfilQuery.isLoading, identityNotLinked, bootstrapError, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
