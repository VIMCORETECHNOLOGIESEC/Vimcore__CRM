import { useMutation, useQuery } from "@tanstack/react-query";
import {
  completarConexionWhatsAppApi,
  fetchWhatsAppCallbackApi,
  iniciarConexionWhatsAppApi,
  type CompletarConexionWhatsAppInput,
  type WhatsAppCallbackParams,
} from "./whatsapp.api";
import { guardarEmpresaFlujo, redirectTo } from "./whatsapp.utils";

const WHATSAPP_CALLBACK_QUERY_KEY = "whatsapp-callback";

/**
 * Paso 1 (`GET /whatsapp/conectar`). Acción disparada por click, no un dato
 * de fondo -- por eso `useMutation` pese a ser un GET (mismo criterio que
 * `bridges/useBridges.ts::useTestConnection`, también GET/POST triggereado
 * por botón). Al resolver: guarda el `empresaId` usado (si lo hay, caso
 * holding-wide) para que el Paso 3 lo recupere después de la navegación
 * completa a Meta, y redirige el navegador de verdad a `authorizationUrl`.
 */
export function useIniciarConexionWhatsApp() {
  return useMutation({
    mutationFn: (empresaId: string | undefined) => iniciarConexionWhatsAppApi(empresaId),
    onSuccess: (data, empresaId) => {
      guardarEmpresaFlujo(empresaId);
      redirectTo(data.authorizationUrl);
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
