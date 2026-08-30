import { CheckCircle2, Network } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useLinkedInCallback } from "./useLinkedIn";
import { leerYLimpiarBridgeIdFlujo } from "./linkedin.utils";

/** Ruta de fallback cuando no hay ningún `bridgeId` persistido del Paso 1 (ver `linkedin.utils.ts`). */
const RUTA_LISTADO_BRIDGES = "/bridges";

/**
 * Paso 2 (`GET /integraciones/linkedin/oauth/callback`, público) del flujo
 * OAuth de LinkedIn Lead Sync -- a diferencia de WhatsApp (3 pasos, con
 * selección de número), LinkedIn completa la conexión de punta a punta en
 * este único paso (contrato, paso 2: `200 → { conexion }` ya activa), así
 * que esta pantalla no encadena ningún paso 3 -- solo confirma éxito/error y
 * ofrece volver al bridge de origen.
 *
 * Ruta PÚBLICA (fuera de `ProtectedRoute`, ver `router.tsx`) -- LinkedIn
 * redirige acá el navegador del administrador de verdad (no es un fetch
 * disparado por la SPA), mismo criterio que `whatsapp/WhatsAppCallbackPage.tsx`:
 * esta pantalla no puede asumir que ya hay una sesión restaurada en memoria
 * en el instante del montaje. El callback en sí no la necesita (identidad
 * resuelta server-side desde el `state`) -- no exige `Authorization`
 * (contrato, paso 2).
 */
export function LinkedInCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const callback = useLinkedInCallback({
    code: searchParams.get("code") ?? undefined,
    state: searchParams.get("state") ?? undefined,
    error: searchParams.get("error") ?? undefined,
    errorDescription: searchParams.get("error_description") ?? undefined,
  });

  // Se lee (y limpia) una única vez al montar -- sobrevive a la navegación
  // completa hacia/desde LinkedIn vía `sessionStorage` porque el Paso 1 ya
  // no está en memoria acá (ver `linkedin.utils.ts`). Es el único camino
  // confiable de "a qué bridge volver" tanto en éxito como en error (el
  // camino de error no tiene ningún `conexion.bridgeId` de dónde leerlo).
  const [bridgeIdFlujo] = useState(() => leerYLimpiarBridgeIdFlujo());

  function volverAlBridge() {
    const bridgeId = callback.data?.bridgeId ?? bridgeIdFlujo;
    navigate(bridgeId ? `/bridges/${bridgeId}` : RUTA_LISTADO_BRIDGES);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <Network className="size-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-base">Conectar LinkedIn</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {callback.isLoading ? <LoadingState rows={3} rowHeight="h-14" /> : null}

          {callback.isError ? (
            <ErrorState message={getErrorMessage(callback.error)} onRetry={volverAlBridge} />
          ) : null}

          {callback.isSuccess ? (
            <div className="flex flex-col items-start gap-3">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-5" aria-hidden="true" />
                <p className="text-base font-medium text-foreground">¡LinkedIn conectado!</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Scopes: {callback.data.scopes.join(", ")}
              </p>
              <Button type="button" onClick={volverAlBridge}>
                Volver al bridge
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
