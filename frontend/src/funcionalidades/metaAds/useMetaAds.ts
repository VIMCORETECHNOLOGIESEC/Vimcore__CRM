import { useMutation, useQuery } from "@tanstack/react-query";
import {
  completarConexionMetaAdsApi,
  fetchMetaAdsCallbackApi,
  fetchMetaAdsConexionApi,
  iniciarConexionMetaAdsApi,
  type CompletarConexionMetaAdsInput,
  type MetaAdsCallbackParams,
} from "./meta-ads.api";
import { guardarEmpresaFlujo } from "./meta-ads.utils";

const META_ADS_CALLBACK_QUERY_KEY = "meta-ads-callback";

/**
 * Paso 1 (`GET /meta-ads/conectar`). Acción disparada por click, no un dato
 * de fondo -- por eso `useMutation` pese a ser un GET (mismo criterio que
 * `whatsapp/useWhatsApp.ts::useIniciarConexionWhatsApp`). Al resolver:
 * guarda el `empresaId` usado (si lo hay, caso holding-wide) para que el
 * Paso 3 lo recupere después de la navegación a Meta.
 *
 * No redirige acá dentro -- esa decisión vive en quien consume este hook
 * (`ConectarMetaAdsCard.tsx`): abrir `authorizationUrl` en un popup
 * (`useOAuthPopup`) y solo caer a un redirect de página completa como
 * fallback si el navegador bloqueó el popup.
 */
export function useIniciarConexionMetaAds() {
  return useMutation({
    mutationFn: (empresaId: string | undefined) => iniciarConexionMetaAdsApi(empresaId),
    onSuccess: (_data, empresaId) => {
      guardarEmpresaFlujo(empresaId);
    },
  });
}

/**
 * Paso 2 (`GET /meta-ads/callback`, público). Se dispara solo al montar
 * `MetaAdsCallbackPage` con los query params que Meta puso en la URL --
 * `retry: false` porque `code`/`state` son de un solo uso, un segundo
 * intento automático fallaría igual (`meta_ads_oauth_state_invalido`).
 */
export function useMetaAdsCallback(params: MetaAdsCallbackParams) {
  return useQuery({
    queryKey: [META_ADS_CALLBACK_QUERY_KEY, params],
    queryFn: () => fetchMetaAdsCallbackApi(params),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Paso 3 (`POST /meta-ads/conexion`). */
export function useCompletarConexionMetaAds() {
  return useMutation({
    mutationFn: (input: CompletarConexionMetaAdsInput) => completarConexionMetaAdsApi(input),
  });
}

/**
 * Paso 4 (`GET /meta-ads/conexion`) -- estado REAL de la conexión, consultado
 * en un momento preciso: justo después de que la ventana emergente del Paso
 * 1 se cierra (`MetaAdsConexionOverlay.tsx`, estado `"verifying"`), nunca en
 * background ni al montar. `useMutation` en vez de `useQuery` a propósito --
 * mismo criterio que `useIniciarConexionMetaAds` (ver
 * `whatsapp/useWhatsApp.ts::useWhatsAppConexionStatus` para el detalle
 * completo del razonamiento).
 */
export function useMetaAdsConexionStatus() {
  return useMutation({
    mutationFn: (empresaId: string | undefined) => fetchMetaAdsConexionApi(empresaId),
  });
}
