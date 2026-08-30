import { useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/componentes/ConfirmDialog";
import type { Oportunidad } from "@/tipos/oportunidad";
import { FORMA_PAGO_ETIQUETAS } from "../catalogos";
import { esTerminal } from "../etapas";
import { CierreNoVentaForm } from "./CierreNoVentaForm";
import { CierreVentaForm } from "./CierreVentaForm";
import type { CerrarOportunidadInput } from "./oportunidadDetalle.api";
import { useCerrarOportunidad } from "./useOportunidadDetalle";

interface OportunidadCierrePanelProps {
  oportunidad: Oportunidad;
}

type ModoCierre = "VENTA" | "NO_VENTA" | null;

const FORMATO_MONTO = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

/**
 * Cierre de una Oportunidad en VENTA/NO_VENTA (Bloque D, D7). Autoridad
 * restringida en el servidor: solo el `asesorId` actual con
 * `Membresia.habilitadoParaVenta` puede cerrar -- sin bypass de
 * admin/supervisor salvo que hayan tomado la negociación por la excepción D9
 * (`OportunidadReasignarPanel`). Un rechazo 403 `permiso_denegado` se muestra
 * inline (no solo el toast global) y NO limpia el formulario ni cambia de
 * etapa de forma optimista.
 *
 * Cierre es irreversible -- dos pasos: el formulario valida y entrega los
 * valores (`onValidSubmit`), después `ConfirmDialog` exige confirmación
 * explícita antes de mutar (mismo patrón de dos pasos que
 * `leads/detalle/CierreVentaForm.tsx`).
 */
export function OportunidadCierrePanel({ oportunidad }: OportunidadCierrePanelProps) {
  const [modo, setModo] = useState<ModoCierre>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [payloadPendiente, setPayloadPendiente] = useState<CerrarOportunidadInput | null>(null);
  const cerrar = useCerrarOportunidad(oportunidad.id);

  if (esTerminal(oportunidad.etapa)) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Oportunidad cerrada</h2>
        {oportunidad.etapa === "VENTA" ? (
          <p className="text-sm text-muted-foreground">
            Monto:{" "}
            {oportunidad.montoVenta == null ? "—" : FORMATO_MONTO.format(oportunidad.montoVenta)}
            {oportunidad.formaPago
              ? ` · Forma de pago: ${FORMA_PAGO_ETIQUETAS[oportunidad.formaPago]}`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {oportunidad.observacionCierre ?? "Sin observación registrada."}
          </p>
        )}
      </section>
    );
  }

  function abrirConfirmacion(payload: CerrarOportunidadInput) {
    setPayloadPendiente(payload);
    setConfirmando(true);
  }

  function confirmar() {
    if (!payloadPendiente) return;
    cerrar.mutate(payloadPendiente, {
      onSuccess: () => {
        setConfirmando(false);
        setPayloadPendiente(null);
      },
      // Rechazo (p. ej. 403 permiso_denegado): cierra el diálogo de
      // confirmación pero conserva el modo y el formulario ya completado --
      // el mensaje accionable se muestra abajo (`cerrar.isError`) y el toast
      // global (`queryClient` mutationCache) también dispara.
      onError: () => setConfirmando(false),
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Cierre de la oportunidad</h2>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="success" onClick={() => setModo("VENTA")}>
          Venta
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setModo("NO_VENTA")}>
          No Venta
        </Button>
      </div>

      {modo === "VENTA" ? (
        <CierreVentaForm
          onValidSubmit={(valores) => abrirConfirmacion({ etapa: "VENTA", ...valores })}
        />
      ) : null}
      {modo === "NO_VENTA" ? (
        <CierreNoVentaForm
          onValidSubmit={(valores) => abrirConfirmacion({ etapa: "NO_VENTA", ...valores })}
        />
      ) : null}

      {cerrar.isError ? (
        <p className="text-sm text-destructive">{getErrorMessage(cerrar.error)}</p>
      ) : null}

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title={modo === "VENTA" ? "Confirmar cierre como Venta" : "Confirmar cierre como No Venta"}
        description="Esta acción es irreversible: una oportunidad cerrada no vuelve a reabrirse. Verificá los datos antes de confirmar."
        confirmLabel={modo === "VENTA" ? "Cerrar como Venta" : "Cerrar como No Venta"}
        confirming={cerrar.isPending}
        onConfirm={confirmar}
      />
    </section>
  );
}
