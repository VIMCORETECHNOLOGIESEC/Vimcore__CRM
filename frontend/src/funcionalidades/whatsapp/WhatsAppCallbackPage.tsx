import { CheckCircle2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useCompletarConexionWhatsApp, useWhatsAppCallback } from "./useWhatsApp";
import { leerYLimpiarEmpresaFlujo } from "./whatsapp.utils";

/** Ruta a la que "reintentar" vuelve a mandar al administrador -- el Paso 1 vive ahí (`ConectarWhatsAppCard.tsx`, montada en `BridgesPage.tsx`). */
const RUTA_PASO_1 = "/bridges";

/**
 * Pasos 2 (`GET /whatsapp/callback`, público) + 3 (`POST /whatsapp/conexion`)
 * del flujo de conexión de WhatsApp Business, resueltos en una sola pantalla
 * continua (contrato, secciones 2-3: el Paso 2 "alimenta directo" al Paso 3,
 * no hay pantalla intermedia con sentido propio).
 *
 * Ruta PÚBLICA (fuera de `ProtectedRoute`, ver `router.tsx`) -- Meta
 * redirige acá el navegador del administrador de verdad (no es un fetch
 * disparado por la SPA), así que esta pantalla no puede asumir que ya hay
 * una sesión restaurada en memoria en el instante del montaje. El Paso 2 en
 * sí no la necesita (identidad resuelta server-side desde el `state`); el
 * Paso 3 sí exige `Authorization` -- si `AuthProvider` todavía no terminó de
 * restaurar la sesión desde el refresh token persistido para ese momento, el
 * error 401 resultante ya llega con un mensaje accionable
 * (`getErrorMessage`), sin necesitar un guard especial acá.
 */
export function WhatsAppCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const callback = useWhatsAppCallback({
    code: searchParams.get("code") ?? undefined,
    state: searchParams.get("state") ?? undefined,
    error: searchParams.get("error") ?? undefined,
    errorDescription: searchParams.get("error_description") ?? undefined,
  });

  // Se lee (y limpia) una única vez al montar -- sobrevive a la navegación
  // completa hacia/desde Meta vía `sessionStorage` porque el Paso 1 ya no
  // está en memoria acá (ver `whatsapp.utils.ts`). Se reutiliza para todos
  // los reintentos del Paso 3 dentro de esta misma instancia de página.
  const [empresaIdFlujo] = useState(() => leerYLimpiarEmpresaFlujo());
  const [numeroSeleccionado, setNumeroSeleccionado] = useState<string | null>(null);

  const completarConexion = useCompletarConexionWhatsApp();

  function volverAlPaso1() {
    navigate(RUTA_PASO_1);
  }

  function reintentarPaso3() {
    if (completarConexion.error instanceof ApiError && completarConexion.error.code === "whatsapp_seleccion_invalida") {
      volverAlPaso1();
      return;
    }
    completarConexion.reset();
  }

  function conectarNumeroElegido() {
    if (!numeroSeleccionado || !callback.data) return;
    completarConexion.mutate({
      seleccion: callback.data.seleccion,
      numeroTelefonoId: numeroSeleccionado,
      empresaId: empresaIdFlujo,
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <MessageCircle className="size-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-base">Conectar WhatsApp Business</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {callback.isLoading ? <LoadingState rows={3} rowHeight="h-14" /> : null}

          {callback.isError ? (
            <ErrorState message={getErrorMessage(callback.error)} onRetry={volverAlPaso1} />
          ) : null}

          {callback.isSuccess ? (
            completarConexion.isSuccess ? (
              <div className="flex flex-col items-start gap-3">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                  <p className="text-base font-medium text-foreground">¡WhatsApp conectado!</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Número: {completarConexion.data.numeroDisplay}
                </p>
                <Button type="button" onClick={volverAlPaso1}>
                  Volver a Bridges
                </Button>
              </div>
            ) : callback.data.numeros.length === 0 ? (
              <EmptyState
                title="No se encontraron números de WhatsApp Business disponibles"
                description="Verificá que la cuenta autorizada en Meta tenga al menos un número de WhatsApp Business configurado."
                action={
                  <Button type="button" variant="outline" onClick={volverAlPaso1}>
                    Volver
                  </Button>
                }
              />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Elegí el número de WhatsApp Business que querés conectar:
                </p>
                <div role="radiogroup" aria-label="Número de WhatsApp Business" className="flex flex-col gap-2">
                  {callback.data.numeros.map((numero) => (
                    <label
                      key={numero.numeroTelefonoId}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary"
                    >
                      <input
                        type="radio"
                        name="whatsapp-numero"
                        value={numero.numeroTelefonoId}
                        checked={numeroSeleccionado === numero.numeroTelefonoId}
                        onChange={() => setNumeroSeleccionado(numero.numeroTelefonoId)}
                        className="size-4"
                      />
                      <span className="flex flex-col">
                        <span className="font-medium text-foreground">{numero.numeroDisplay}</span>
                        {numero.verifiedName ? (
                          <span className="text-sm text-muted-foreground">{numero.verifiedName}</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>

                {completarConexion.isError ? (
                  <ErrorState
                    message={getErrorMessage(completarConexion.error)}
                    onRetry={reintentarPaso3}
                  />
                ) : null}

                <Button
                  type="button"
                  onClick={conectarNumeroElegido}
                  disabled={!numeroSeleccionado || completarConexion.isPending}
                  className="w-fit"
                >
                  {completarConexion.isPending ? "Conectando…" : "Conectar este número"}
                </Button>
              </>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
