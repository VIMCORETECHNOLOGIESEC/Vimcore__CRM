import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LinkedInFuente } from "@/tipos/linkedin";
import {
  descubrirFuentesLinkedInApi,
  fetchLinkedInCallbackApi,
  fetchLinkedInConexionApi,
  fetchLinkedInFuentesApi,
  iniciarOAuthLinkedInApi,
  probarConexionLinkedInApi,
  toggleFuenteLinkedInApi,
  type LinkedInCallbackParams,
} from "./linkedin.api";
import { guardarBridgeIdFlujo, redirigirA } from "./linkedin.utils";

const LINKEDIN_CONEXION_QUERY_KEY = "linkedin-conexion";
const LINKEDIN_FUENTES_QUERY_KEY = "linkedin-fuentes";
const LINKEDIN_CALLBACK_QUERY_KEY = "linkedin-callback";

/**
 * Paso 1 (`POST /bridges/:id/linkedin/oauth/iniciar`). Acción disparada por
 * click, no un dato de fondo -- por eso `useMutation` pese a que el endpoint
 * real es un POST sin body, mismo criterio que
 * `whatsapp/useWhatsApp.ts::useIniciarConexionWhatsApp`. Al resolver:
 * persiste el `bridgeId` para que el callback lo recupere después de la
 * navegación completa a LinkedIn, y redirige el navegador de verdad a
 * `authorizationUrl`.
 */
export function useIniciarOAuthLinkedIn(bridgeId: string) {
  return useMutation({
    mutationFn: () => iniciarOAuthLinkedInApi(bridgeId),
    onSuccess: (data) => {
      guardarBridgeIdFlujo(bridgeId);
      redirigirA(data.authorizationUrl);
    },
  });
}

/**
 * Paso 2 (`GET /integraciones/linkedin/oauth/callback`, público). Se
 * dispara solo al montar `LinkedInCallbackPage` con los query params que
 * LinkedIn puso en la URL -- `retry: false` porque `code`/`state` son de un
 * solo uso, un segundo intento automático fallaría igual
 * (`linkedin_oauth_state_invalido`), mismo criterio que
 * `whatsapp/useWhatsApp.ts::useWhatsAppCallback`.
 */
export function useLinkedInCallback(params: LinkedInCallbackParams) {
  return useQuery({
    queryKey: [LINKEDIN_CALLBACK_QUERY_KEY, params],
    queryFn: () => fetchLinkedInCallbackApi(params),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Paso 3 (`GET /bridges/:id/linkedin/conexion`) -- consultado desde `LinkedInIntegracionSection`. */
export function useLinkedInConexion(bridgeId: string) {
  return useQuery({
    queryKey: [LINKEDIN_CONEXION_QUERY_KEY, bridgeId],
    queryFn: () => fetchLinkedInConexionApi(bridgeId),
  });
}

/**
 * Paso 4 (`POST /bridges/:id/linkedin/probar-conexion`) -- diagnóstica, no
 * invalida ninguna query (no cambia el estado guardado de la conexión,
 * mismo criterio que `bridges/useBridges.ts::useTestConnection`). El
 * resultado se muestra vía el valor de retorno de la mutación, no solo por
 * toast.
 */
export function useProbarConexionLinkedIn(bridgeId: string) {
  return useMutation({
    mutationFn: () => probarConexionLinkedInApi(bridgeId),
    onSuccess: (resultado) => {
      if (resultado.conectado) {
        toast.success("Conexión con LinkedIn verificada correctamente.");
      } else {
        toast.error("No se pudo verificar la conexión con LinkedIn.");
      }
    },
  });
}

/** Paso 5 (`GET /bridges/:id/linkedin/fuentes`). */
export function useLinkedInFuentes(bridgeId: string) {
  return useQuery({
    queryKey: [LINKEDIN_FUENTES_QUERY_KEY, bridgeId],
    queryFn: () => fetchLinkedInFuentesApi(bridgeId),
  });
}

/**
 * Paso 6 (`POST /bridges/:id/linkedin/fuentes/descubrir`) -- upsert local,
 * nunca activa una fuente automáticamente (contrato, paso 6). Invalida el
 * listado de fuentes para reflejar lo recién descubierto/actualizado.
 */
export function useDescubrirFuentesLinkedIn(bridgeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => descubrirFuentesLinkedInApi(bridgeId),
    onSuccess: (fuentes) => {
      queryClient.setQueryData([LINKEDIN_FUENTES_QUERY_KEY, bridgeId], fuentes);
      toast.success("Fuentes de LinkedIn actualizadas correctamente.");
    },
  });
}

/**
 * Paso 7 (`PATCH /bridges/:id/linkedin/fuentes/:fuenteId`) -- NO optimista
 * (contrato, paso 7): el `isPending` de esta mutación es lo único que debe
 * mostrar "procesando" en la UI, nunca un cambio visual anticipado del
 * estado de la fuente. Al resolver, actualiza solo esa fila en caché en vez
 * de invalidar el listado completo (evita un parpadeo de loading en las
 * demás filas que no cambiaron).
 */
export function useToggleFuenteLinkedIn(bridgeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fuenteId, activa }: { fuenteId: string; activa: boolean }) =>
      toggleFuenteLinkedInApi(bridgeId, fuenteId, activa),
    onSuccess: (fuenteActualizada) => {
      queryClient.setQueryData(
        [LINKEDIN_FUENTES_QUERY_KEY, bridgeId],
        (actual: LinkedInFuente[] | undefined) =>
          actual?.map((fuente) => (fuente.id === fuenteActualizada.id ? fuenteActualizada : fuente)),
      );
      toast.success(
        fuenteActualizada.activa
          ? "Fuente activada correctamente."
          : "Fuente desactivada correctamente.",
      );
    },
  });
}
