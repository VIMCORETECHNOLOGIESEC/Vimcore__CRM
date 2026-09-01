import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { NotificarWhatsAppNoConectadoDialog } from "./NotificarWhatsAppNoConectadoDialog";
import { WhatsAppIcon } from "./WhatsAppIcon";

interface WhatsAppSinConexionProps {
  /**
   * `hasRole(["ADMINISTRADOR"])` del llamador (`LeadDetallePage.tsx`) --
   * mismo criterio de autorización "cosmética" que el resto del frontend
   * (`permissions.ts::hasRoleAccess`, con el bypass de
   * `SUPER_ADMIN`/`SUPERVISOR_HOLDING` ya incluido), en vez de comparar
   * `rol === "ADMINISTRADOR"` acá y duplicar esa regla.
   */
  puedeIrABridges: boolean;
  /**
   * `useVistaEmpresa().empresaVistaId` del llamador -- solo presente para un
   * holding-wide que ya "entró" a la vista de una empresa puntual
   * (`?empresaId=`). Determina el destino exacto del botón "Ir a Bridges".
   */
  empresaVistaId?: string | null;
}

/**
 * Estado del panel de WhatsApp del detalle de un lead (`LeadDetallePage.tsx`
 * -- `WhatsAppChat`) cuando la EMPRESA todavía no tiene una
 * `WhatsAppConexion` activa (`useWhatsAppEstadoActual`, `estado !== "ACTIVA"`,
 * incluye "nunca se conectó"). Distinto del `EmptyState` de "Todavía no hay
 * conversación" -- ese caso asume que la empresa SÍ está conectada, solo que
 * este cliente puntual no escribió todavía.
 *
 * Reusa `WhatsAppIcon.tsx` (no duplica el SVG) -- misma función, sin props,
 * ya usada por el botón flotante de `LeadDetallePage.tsx`.
 */
export function WhatsAppSinConexion({ puedeIrABridges, empresaVistaId }: WhatsAppSinConexionProps) {
  const navigate = useNavigate();
  const [notificarAbierto, setNotificarAbierto] = useState(false);

  function irABridges() {
    navigate(empresaVistaId ? `/empresas/${empresaVistaId}/bridges` : "/bridges");
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-marca-texto">
        <WhatsAppIcon />
      </span>
      <div className="flex max-w-xs flex-col gap-1">
        <p className="text-sm font-medium text-foreground">No hay conexión con WhatsApp.</p>
        <p className="text-sm text-muted-foreground">
          {puedeIrABridges
            ? "Conecta el WhatsApp Business de la empresa desde Bridges para habilitar la mensajería."
            : "Pídele a un administrador que conecte el WhatsApp Business de la empresa."}
        </p>
      </div>
      {puedeIrABridges ? (
        <Button type="button" onClick={irABridges}>
          Ir a Bridges
        </Button>
      ) : (
        <Button type="button" onClick={() => setNotificarAbierto(true)}>
          Notificar a administrador
        </Button>
      )}
      <NotificarWhatsAppNoConectadoDialog open={notificarAbierto} onOpenChange={setNotificarAbierto} />
    </div>
  );
}
