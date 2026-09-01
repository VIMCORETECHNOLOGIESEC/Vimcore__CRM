import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Bridge } from "@/tipos/bridge";
import { ClaveBridgeModal } from "../ClaveBridgeModal";
import { ESTILO_AUTENTICACION_POR_RED } from "../catalogos";
import { useRegenerateClave } from "../useBridges";

interface CredencialBridgeFormProps {
  bridge: Bridge;
}

/**
 * Bifurcación por estilo de autenticación (bridge-lifecycle-management,
 * Requirement: Credential Form Branches by Authentication Style):
 * `CLAVE_API` (Google Forms, X) solo ofrece "Regenerar clave" -- el admin
 * nunca escribe la clave, el servidor la genera. Esta operación SÍ es a
 * nivel de bridge (`POST /bridges/:id/clave`), a diferencia del token.
 *
 * `TOKEN_PROVEEDOR` (Facebook, Instagram, LinkedIn) YA NO renderiza un
 * `TokenForm` acá: el backend real administra el token POR CUENTA
 * PUBLICITARIA (`POST /bridges/:id/cuentas/:cuentaId/token`), y esta
 * sección solo conoce el `bridgeId` -- ver el gap de contrato documentado en
 * `bridges.api.ts`. El formulario funcional vive ahora por cada fila de
 * `CuentasPublicitariasList` (`detalle/CuentasPublicitariasList.tsx`); acá
 * solo queda un texto explicativo que señala dónde encontrarlo.
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
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        El token se carga, renueva y verifica por cada cuenta publicitaria, no a nivel de bridge:
        el campo siempre se muestra vacío (nunca se devuelve por la API, ni siquiera enmascarado).
        Busca la sección «Cuentas publicitarias asociadas» más abajo.
      </p>
    </div>
  );
}
