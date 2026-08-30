import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/api/httpClient";
import { ErrorState } from "@/componentes/states/ErrorState";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { useIniciarConexionWhatsApp } from "./useWhatsApp";

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
 * GAP DE CONTRATO CONOCIDO (contrato, "Lo que todavía NO existe"): no hay
 * `GET /whatsapp/conexion` para consultar si la empresa ya tiene WhatsApp
 * conectado -- esta tarjeta por eso NO puede mostrar "ya conectado" de forma
 * persistente, solo ofrece conectar. La única confirmación visual de una
 * conexión exitosa vive en `WhatsAppCallbackPage` (Paso 3), en el momento en
 * que ocurre -- no sobrevive a un refresh de esta pantalla.
 */
export function ConectarWhatsAppCard() {
  const { user } = useAuth();
  const { empresaVistaId } = useVistaEmpresa();
  const iniciarConexion = useIniciarConexionWhatsApp();

  const esHoldingWide = user?.sessionScope === "holding";
  const empresaIdEfectiva = esHoldingWide ? (empresaVistaId ?? undefined) : undefined;
  const faltaElegirEmpresa = esHoldingWide && !empresaVistaId;

  function conectar() {
    iniciarConexion.mutate(empresaIdEfectiva);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <MessageCircle className="size-5 text-muted-foreground" aria-hidden="true" />
        <CardTitle className="text-base">WhatsApp Business</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Conectá el número de WhatsApp Business de la empresa para habilitar mensajería con
          clientes. Se abre el flujo de autorización de Meta en esta misma pestaña.
        </p>

        {faltaElegirEmpresa ? (
          <p className="text-sm text-muted-foreground">
            Elegí primero una empresa desde «Empresas» para conectar su WhatsApp.
          </p>
        ) : null}

        {iniciarConexion.isError ? (
          <ErrorState
            message={getErrorMessage(iniciarConexion.error)}
            onRetry={conectar}
          />
        ) : null}

        <Button
          type="button"
          onClick={conectar}
          disabled={faltaElegirEmpresa || iniciarConexion.isPending}
          className="w-fit"
        >
          {iniciarConexion.isPending ? "Conectando…" : "Conectar WhatsApp"}
        </Button>
      </CardContent>
    </Card>
  );
}
