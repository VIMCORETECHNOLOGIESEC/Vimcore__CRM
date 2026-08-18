import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Bridge } from "@/tipos/bridge";
import { ClaveBridgeModal } from "../ClaveBridgeModal";
import { ESTILO_AUTENTICACION_POR_RED } from "../catalogos";
import { useRegenerateClave } from "../useBridges";
import { TokenForm } from "./TokenForm";

interface CredencialBridgeFormProps {
  bridge: Bridge;
}

/**
 * Bifurcación por estilo de autenticación (bridge-lifecycle-management,
 * Requirement: Credential Form Branches by Authentication Style):
 * `CLAVE_API` (Google Forms, X) solo ofrece "Regenerar clave" -- el admin
 * nunca escribe la clave, el servidor la genera; `TOKEN_PROVEEDOR`
 * (Facebook, Instagram, LinkedIn) reutiliza el `TokenForm` existente de F8,
 * marcado como Fase 2 porque el flujo OAuth real todavía no está conectado
 * a ningún proveedor (docs/05) -- pero SIGUE FUNCIONAL contra el mock, no se
 * deshabilita: la etiqueta distingue la falta de integración real, no la
 * ausencia de comportamiento simulado.
 */
export function CredencialBridgeForm({ bridge }: CredencialBridgeFormProps) {
  const estilo = ESTILO_AUTENTICACION_POR_RED[bridge.redSocial];
  const regenerarClave = useRegenerateClave(bridge.id);
  const [claveModal, setClaveModal] = useState<string | null>(null);

  if (estilo === "CLAVE_API") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Este bridge se autentica con una clave de API generada por el servidor. El administrador
          nunca la escribe: solo puede regenerarla, lo que invalida de inmediato la anterior.
        </p>
        <Button
          type="button"
          className="self-start"
          disabled={regenerarClave.isPending}
          onClick={() =>
            regenerarClave.mutate(undefined, {
              onSuccess: (respuesta) => setClaveModal(respuesta.claveApi),
            })
          }
        >
          {regenerarClave.isPending ? "Regenerando…" : "Regenerar clave"}
        </Button>

        {claveModal ? (
          <ClaveBridgeModal
            open
            bridgeNombre={bridge.nombre}
            claveApi={claveModal}
            onClose={() => setClaveModal(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
          Fase 2 · Proveedor OAuth no conectado todavía
        </span>
        <p className="text-xs text-muted-foreground">
          El campo siempre se muestra vacío: el token nunca se devuelve por la API, ni siquiera
          enmascarado. Se envía solo al guardar y se verifica de inmediato.
        </p>
      </div>
      <TokenForm bridgeId={bridge.id} />
    </div>
  );
}
