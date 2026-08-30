import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { getCatalogoResponsables } from "@/funcionalidades/leads/leads.api";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";
import type { Oportunidad } from "@/tipos/oportunidad";
import { esTerminal } from "../etapas";
import { useReasignarOportunidad } from "./useOportunidadDetalle";

interface OportunidadReasignarPanelProps {
  oportunidad: Oportunidad;
}

/**
 * Reasignación administrativa de una Oportunidad (Bloque D, D9 -- excepción
 * de asignación). Solo ADMINISTRADOR/SUPERVISOR (mismos roles que exige el
 * servidor en `POST /oportunidades/:id/reasignar`) y solo mientras la
 * oportunidad no esté en etapa terminal -- reasignar una oportunidad cerrada
 * no tiene sentido de negocio y el servidor la rechazaría igual.
 *
 * El buscador de asesores se restringe a `"ASESORES"` (nunca vendedores) --
 * mismo criterio que "Reasignar" en `leads/detalle/AccionesResponsable.tsx`:
 * el asesor es el responsable del primer contacto, no del cierre.
 *
 * Un rechazo 409 (`destinatario_invalido` / `usuario_invalido`) se muestra
 * inline y NO limpia la selección -- el usuario puede corregir y reintentar
 * sin volver a buscar.
 */
export function OportunidadReasignarPanel({ oportunidad }: OportunidadReasignarPanelProps) {
  const { user } = useAuth();
  const [asesorElegido, setAsesorElegido] = useState("");
  const reasignar = useReasignarOportunidad(oportunidad.id);

  const puedeReasignar =
    (user?.rol === "ADMINISTRADOR" || user?.rol === "SUPERVISOR") &&
    !esTerminal(oportunidad.etapa);

  const { data: asesores = [] } = useQuery({
    queryKey: ["oportunidades-detalle-asesores"],
    queryFn: () => getCatalogoResponsables("ASESORES"),
    enabled: puedeReasignar,
  });

  if (!puedeReasignar) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Reasignar oportunidad</h2>
      <div className="flex flex-wrap items-center gap-2">
        <ResponsableCombobox
          valor={asesorElegido}
          onChange={setAsesorElegido}
          responsables={asesores}
          ariaLabel="Nuevo asesor"
          placeholder="Elegir asesor…"
          placeholderBusqueda="Buscar asesor…"
          className="w-56"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!asesorElegido || reasignar.isPending}
          onClick={() => reasignar.mutate(asesorElegido)}
        >
          {reasignar.isPending ? "Reasignando…" : "Reasignar"}
        </Button>
      </div>
      {reasignar.isError ? (
        <p className="text-sm text-destructive">{getErrorMessage(reasignar.error)}</p>
      ) : null}
    </section>
  );
}
