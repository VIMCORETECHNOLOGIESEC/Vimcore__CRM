import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/api/httpClient";
import { ErrorState } from "@/componentes/states/ErrorState";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { useOAuthPopup } from "@/hooks/useOAuthPopup";
import { MetaAdsConexionOverlay, type MetaAdsConexionOverlayStatus } from "./MetaAdsConexionOverlay";
import { useIniciarConexionMetaAds, useMetaAdsConexionStatus } from "./useMetaAds";
import { redirectTo } from "./meta-ads.utils";

/**
 * Entrada del Paso 1 del flujo de conexión de Meta Ads
 * (`GET /meta-ads/conectar`) -- montada de forma aditiva dentro de
 * `BridgesPage.tsx`, al lado de `ConectarWhatsAppCard`. Meta Ads NO es un
 * `Bridge` en el modelo de datos (no es fuente de leads) -- es una conexión
 * OAuth por empresa para traer métricas reales de campañas (CPC/CPL/CAC) al
 * Dashboard. Mismo patrón conceptual que WhatsApp de compartir esta pantalla
 * en vez de crear una sección nueva en el sidebar solo para esto.
 *
 * Reusa `useVistaEmpresa()` -- la MISMA fuente de verdad que ya usan
 * `BridgesPage`/`ConectarWhatsAppCard` (`?empresaId=` en la URL) -- para
 * resolver qué empresa está mirando un actor holding-wide.
 *
 * El flujo de conexión (Paso 1) abre `authorizationUrl` en una ventana
 * emergente (`useOAuthPopup`) y muestra un overlay bloqueante
 * (`MetaAdsConexionOverlay`) mientras dura. Al cerrarse el popup -- por
 * CUALQUIER motivo -- se consulta el estado REAL contra el backend (Paso 4,
 * `useMetaAdsConexionStatus`) en vez de asumir éxito o cancelación; solo si
 * `window.open` fue bloqueado por el navegador cae al redirect de página
 * completa (`redirectTo`) como fallback. Mismo criterio exacto que
 * `whatsapp/ConectarWhatsAppCard.tsx`.
 */
export function ConectarMetaAdsCard() {
  const { user } = useAuth();
  const { empresaVistaId } = useVistaEmpresa();
  const iniciarConexion = useIniciarConexionMetaAds();
  const estadoConexionReal = useMetaAdsConexionStatus();
  const popup = useOAuthPopup();
  const [overlayStatus, setOverlayStatus] = useState<MetaAdsConexionOverlayStatus>("idle");

  const esHoldingWide = user?.sessionScope === "holding";
  const empresaIdEfectiva = esHoldingWide ? (empresaVistaId ?? undefined) : undefined;
  const faltaElegirEmpresa = esHoldingWide && !empresaVistaId;

  function connect() {
    iniciarConexion.mutate(empresaIdEfectiva, {
      onSuccess: (data) => {
        const seAbrio = popup.open(data.authorizationUrl);
        if (seAbrio) {
          setOverlayStatus("waiting");
        } else {
          // Bloqueado por el navegador -- fallback transparente, sin mostrar
          // ningún error.
          redirectTo(data.authorizationUrl);
        }
      },
    });
  }

  // El popup se cerró mientras esperábamos -- por lo que sea (el usuario lo
  // cerró a mano, tocó "Cancelar", o se cerró solo tras completar el flujo
  // real). Nunca se asume el resultado: se consulta el estado verdadero
  // contra el backend.
  useEffect(() => {
    if (popup.status !== "closed" || overlayStatus !== "waiting") {
      return;
    }

    setOverlayStatus("verifying");
    estadoConexionReal.mutate(empresaIdEfectiva, {
      onSuccess: (conexion) => {
        setOverlayStatus(conexion?.estado === "ACTIVA" ? "connected" : "notConnected");
      },
      onError: () => {
        setOverlayStatus("notConnected");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup.status]);

  function closeOverlay() {
    estadoConexionReal.reset();
    setOverlayStatus("idle");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <Megaphone className="size-5 text-muted-foreground" aria-hidden="true" />
        <CardTitle className="text-base">Meta Ads</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Conectá la cuenta de anuncios de Meta de la empresa para traer métricas reales de
          campañas (CPC, CPL, CAC) al Dashboard. Se abre el flujo de autorización de Meta en una
          ventana emergente.
        </p>

        {faltaElegirEmpresa ? (
          <p className="text-sm text-muted-foreground">
            Elegí primero una empresa desde «Empresas» para conectar su cuenta de Meta Ads.
          </p>
        ) : null}

        {iniciarConexion.isError ? (
          <ErrorState
            message={getErrorMessage(iniciarConexion.error)}
            onRetry={connect}
          />
        ) : null}

        <Button
          type="button"
          onClick={connect}
          disabled={faltaElegirEmpresa || iniciarConexion.isPending}
          className="w-fit"
        >
          {iniciarConexion.isPending ? "Conectando…" : "Conectar Meta Ads"}
        </Button>
      </CardContent>

      <MetaAdsConexionOverlay
        status={overlayStatus}
        onCancel={popup.cancel}
        onClose={closeOverlay}
      />
    </Card>
  );
}
