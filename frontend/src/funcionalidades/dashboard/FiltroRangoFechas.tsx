import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RangoSeleccionado } from "./dashboard.utils";
import { ETIQUETAS_RANGO_PRESET, PRESETS_AUTOMATICOS } from "./rangoFechas";

interface FiltroRangoFechasProps {
  rango: RangoSeleccionado;
  onChange: (rango: RangoSeleccionado) => void;
}

/**
 * Selector de rango de fechas con presets (docs/08 §4). Componente de
 * presentación puro: el cálculo de la ventana concreta de cada preset lo
 * hace el backend real (`resolveRangoFechas`), acá solo se elige el literal
 * (`MetricasFiltros["rango"]`) -- salvo "Personalizado", que sí necesita
 * `desde`/`hasta` explícitos porque el backend los exige para ese preset.
 */
export function FiltroRangoFechas({ rango, onChange }: FiltroRangoFechasProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Rango de fechas">
        {PRESETS_AUTOMATICOS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={rango.preset === preset ? "default" : "outline"}
            aria-pressed={rango.preset === preset}
            onClick={() => onChange({ ...rango, preset })}
          >
            {ETIQUETAS_RANGO_PRESET[preset]}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={rango.preset === "personalizado" ? "default" : "outline"}
          aria-pressed={rango.preset === "personalizado"}
          onClick={() => onChange({ ...rango, preset: "personalizado" })}
        >
          {ETIQUETAS_RANGO_PRESET.personalizado}
        </Button>
      </div>

      {rango.preset === "personalizado" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="dashboard-fecha-desde" className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              id="dashboard-fecha-desde"
              type="date"
              value={rango.desde}
              onChange={(event) => onChange({ ...rango, desde: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="dashboard-fecha-hasta" className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="dashboard-fecha-hasta"
              type="date"
              value={rango.hasta}
              onChange={(event) => onChange({ ...rango, hasta: event.target.value })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
