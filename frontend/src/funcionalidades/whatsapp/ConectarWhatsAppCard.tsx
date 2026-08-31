import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/api/httpClient";
import { ErrorState } from "@/componentes/states/ErrorState";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { useOAuthPopup } from "@/hooks/useOAuthPopup";
import { PuntoEstadoActivo } from "./PuntoEstadoActivo";
import { WhatsAppConexionOverlay, type WhatsAppConexionOverlayStatus } from "./WhatsAppConexionOverlay";
import {
  useIniciarConexionWhatsApp,
  useWhatsAppConexionStatus,
  useWhatsAppEstadoActual,
} from "./useWhatsApp";
import { redirectTo } from "./whatsapp.utils";

/**
 * Entrada del Paso 1 del flujo de conexión de WhatsApp Business
 * (`GET /whatsapp/conectar`, `docs/contrato-frontend-whatsapp-api_mat_04.md`
 * sección 1) -- montada de forma aditiva dentro de `BridgesPage.tsx`.
 * WhatsApp NO es un `Bridge` en el modelo de datos (un mensaje no es un
 * lead), pero conceptualmente es "otro canal de comunicación de la
 * empresa", de ahí compartir pantalla con Bridges en vez de crear una
 * sección nueva en el sidebar solo para esto.
 *
 * Reusa `useVistaEmpresa()` -- la MISMA fuente de verdad que ya usan
 * `BridgesPage`/`UsuariosPage`/`EmpresaDetallePage` (`?empresaId=` en la
 * URL) -- para resolver qué empresa está mirando un actor holding-wide, en
 * vez de inventar un selector de empresa nuevo solo para WhatsApp.
 *
 * El flujo de conexión (Paso 1) ya no navega de página completa: abre
 * `authorizationUrl` en una ventana emergente (`useOAuthPopup`) y muestra un
 * overlay bloqueante (`WhatsAppConexionOverlay`) mientras dura. Al cerrarse
 * el popup -- por CUALQUIER motivo -- se consulta el estado REAL contra el
 * backend (Paso 4, `useWhatsAppConexionStatus`) en vez de asumir éxito o
 * cancelación; solo si `window.open` fue bloqueado por el navegador cae al
 * redirect de página completa (`redirectTo`) como antes.
 *
 * BLOQUEO CONOCIDO (ya comunicado, no se resuelve acá): `WHATSAPP_OAUTH_
 * REDIRECT_URI` del backend apunta hoy al backend mismo, nunca al frontend
 * -- el popup nunca llega a alcanzar `WhatsAppCallbackPage`. Por eso, hasta
 * que se corrija, el Paso 4 va a devolver honestamente "no conectado" -- el
 * día que se arregle, este mismo código empieza a mostrar "conectado" de
 * verdad sin tocar una línea.
 */
export function ConectarWhatsAppCard() {
  const { user } = useAuth();
  const { empresaVistaId } = useVistaEmpresa();
  const iniciarConexion = useIniciarConexionWhatsApp();
  const estadoConexionReal = useWhatsAppConexionStatus();
  const popup = useOAuthPopup();
  const [overlayStatus, setOverlayStatus] = useState<WhatsAppConexionOverlayStatus>("idle");

  const esHoldingWide = user?.sessionScope === "holding";
  const empresaIdEfectiva = esHoldingWide ? (empresaVistaId ?? undefined) : undefined;
  const faltaElegirEmpresa = esHoldingWide && !empresaVistaId;
  const estadoActual = useWhatsAppEstadoActual(empresaIdEfectiva, { enabled: !faltaElegirEmpresa });
  const yaConectado = estadoActual.data?.estado === "ACTIVA";

  function connect() {
    iniciarConexion.mutate(empresaIdEfectiva, {
      onSuccess: (data) => {
        const seAbrio = popup.open(data.authorizationUrl);
        if (seAbrio) {
          setOverlayStatus("waiting");
        } else {
          // Bloqueado por el navegador -- fallback transparente, sin mostrar
          // ningún error (el redirect de página completa sigue funcionando
          // igual que antes de este cambio).
          redirectTo(data.authorizationUrl);
        }
      },
    });
  }

  // El popup se cerró mientras esperábamos -- por lo que sea (el usuario lo
  // cerró a mano, tocó "Cancelar", o el día que el redirect_uri se arregle,
  // se cerró solo tras completar el flujo real). Nunca se asume el
  // resultado: se consulta el estado verdadero contra el backend.
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
    void estadoActual.refetch();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <MessageCircle className="size-5 text-muted-foreground" aria-hidden="true" />
        <CardTitle className="text-base">WhatsApp Business</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {yaConectado ? (
          <div className="flex items-center gap-2">
            <PuntoEstadoActivo />
            <p className="text-sm text-foreground">
              Conectado a {estadoActual.data?.numeroDisplay}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conectá el número de WhatsApp Business de la empresa para habilitar mensajería con
              clientes. Se abre el flujo de autorización de Meta en una ventana emergente.
            </p>

            {faltaElegirEmpresa ? (
              <p className="text-sm text-muted-foreground">
                Elegí primero una empresa desde «Empresas» para conectar su WhatsApp.
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
              {iniciarConexion.isPending ? "Conectando…" : "Conectar WhatsApp"}
            </Button>
          </>
        )}
      </CardContent>

      <WhatsAppConexionOverlay
        status={overlayStatus}
        onCancel={popup.cancel}
        onClose={closeOverlay}
      />
    </Card>
  );
}
