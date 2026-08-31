import { useMutation, useQuery } from "@tanstack/react-query";
import {
  completarConexionWhatsAppApi,
  fetchWhatsAppCallbackApi,
  fetchWhatsAppConexionApi,
  iniciarConexionWhatsAppApi,
  type CompletarConexionWhatsAppInput,
  type WhatsAppCallbackParams,
} from "./whatsapp.api";
import { guardarEmpresaFlujo } from "./whatsapp.utils";

const WHATSAPP_CALLBACK_QUERY_KEY = "whatsapp-callback";

/**
 * Paso 1 (`GET /whatsapp/conectar`). Acción disparada por click, no un dato
 * de fondo -- por eso `useMutation` pese a ser un GET (mismo criterio que
 * `bridges/useBridges.ts::useTestConnection`, también GET/POST triggereado
 * por botón). Al resolver: guarda el `empresaId` usado (si lo hay, caso
 * holding-wide) para que el Paso 3 lo recupere después de la navegación a
 * Meta.
 *
 * Ya NO redirige acá dentro (antes hacía `redirectTo(data.authorizationUrl)`
 * en su propio `onSuccess`) -- esa decisión ahora vive en quien consume este
 * hook (`ConectarWhatsAppCard.tsx`), porque el flujo real es abrir
 * `authorizationUrl` en un popup (`useOAuthPopup`) y solo caer a un redirect
 * de página completa como fallback si el navegador bloqueó el popup. Este
 * hook no tiene forma de saber cuál de los dos corresponde, así que ya no
 * decide.
 */
export function useIniciarConexionWhatsApp() {
  return useMutation({
    mutationFn: (empresaId: string | undefined) => iniciarConexionWhatsAppApi(empresaId),
    onSuccess: (_data, empresaId) => {
      guardarEmpresaFlujo(empresaId);
    },
  });
}

/**
 * Paso 2 (`GET /whatsapp/callback`, público). Se dispara solo al montar
 * `WhatsAppCallbackPage` con los query params que Meta puso en la URL --
 * `retry: false` porque `code`/`state` son de un solo uso, un segundo
 * intento automático fallaría igual (`whatsapp_oauth_state_invalido`).
 */
export function useWhatsAppCallback(params: WhatsAppCallbackParams) {
  return useQuery({
    queryKey: [WHATSAPP_CALLBACK_QUERY_KEY, params],
    queryFn: () => fetchWhatsAppCallbackApi(params),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Paso 3 (`POST /whatsapp/conexion`). */
export function useCompletarConexionWhatsApp() {
  return useMutation({
    mutationFn: (input: CompletarConexionWhatsAppInput) => completarConexionWhatsAppApi(input),
  });
}

/**
 * Paso 4 (`GET /whatsapp/conexion`) -- estado REAL de la conexión, consultado
 * en un momento preciso: justo después de que la ventana emergente del Paso
 * 1 se cierra (`WhatsAppConexionOverlay.tsx`, estado `"verificando"`), nunca
 * en background ni al montar. `useMutation` en vez de `useQuery` a propósito
 * -- mismo criterio que `useIniciarConexionWhatsApp`: es un GET pero
 * disparado por un evento puntual (el cierre del popup), no un dato que
 * viva montado con la pantalla y se revalide solo. Un `useQuery` habilitado
 * condicionalmente exigiría modelar ese "condicional" con una `key`/`enabled`
 * artificiales para algo que en los hechos ocurre como máximo una vez por
 * intento de conexión -- `mutate()` expresa esa semántica de forma directa.
 */
export function useWhatsAppConexionStatus() {
  return useMutation({
    mutationFn: (empresaId: string | undefined) => fetchWhatsAppConexionApi(empresaId),
  });
}

export const WHATSAPP_ESTADO_ACTUAL_QUERY_KEY = "whatsapp-estado-actual";

/**
 * Estado ACTUAL de la conexión (`GET /whatsapp/conexion`), a diferencia del
 * Paso 4 (`useWhatsAppConexionStatus`): esta sí vive montada con la card
 * (`ConectarWhatsAppCard.tsx`), para reflejar "ya hay una conexión activa"
 * sin depender de que el usuario acabe de pasar por el popup -- por ejemplo
 * al recargar la página o entrar por primera vez con una empresa ya
 * conectada de antes. Mientras la conexión está ACTIVA, se revalida sola
 * cada 60s para detectar si se cae (token expirado, etc.) sin exigir un F5.
 */
export function useWhatsAppEstadoActual(
  empresaId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [WHATSAPP_ESTADO_ACTUAL_QUERY_KEY, empresaId],
    queryFn: () => fetchWhatsAppConexionApi(empresaId),
    enabled: options?.enabled ?? true,
    refetchInterval: (query) => (query.state.data?.estado === "ACTIVA" ? 60_000 : false),
  });
}
