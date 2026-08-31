import { Button } from "@/components/ui/button";
import type { Oportunidad } from "@/tipos/oportunidad";
import { ETAPA_OPORTUNIDAD_ETIQUETAS } from "../catalogos";
import { getTransicionesIntermediasValidas } from "../etapas";
import { useCambiarEtapaOportunidad } from "./useOportunidadDetalle";

interface OportunidadEtapaAccionesProps {
  oportunidad: Oportunidad;
}

/**
 * Avance de etapa intermedia de una oportunidad (Bloque D). Solo expone el
 * único paso lineal siguiente (`NUEVO→CONTACTADO→CITA`); en `CITA` y en las
 * etapas terminales no hay destino intermedio y el panel no se renderiza. El
 * cierre (VENTA/NO_VENTA) tiene su propia autoridad y va por
 * `OportunidadCierrePanel`, no por acá.
 */
export function OportunidadEtapaAcciones({ oportunidad }: OportunidadEtapaAccionesProps) {
  const cambiarEtapa = useCambiarEtapaOportunidad(oportunidad.id);
  const [siguiente] = getTransicionesIntermediasValidas(oportunidad.etapa);

  if (!siguiente) return null;

  // `TRANSICIONES_INTERMEDIAS` solo produce CONTACTADO/CITA como destino.
  const destino = siguiente as "CONTACTADO" | "CITA";
  const etiqueta = ETAPA_OPORTUNIDAD_ETIQUETAS[destino];

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Avance de etapa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          El siguiente paso del embudo es {etiqueta}.
        </p>
      </div>
      <Button
        className="w-fit"
        disabled={cambiarEtapa.isPending}
        onClick={() => cambiarEtapa.mutate(destino)}
      >
        {cambiarEtapa.isPending ? "Avanzando…" : `Avanzar a ${etiqueta}`}
      </Button>
    </section>
  );
}
