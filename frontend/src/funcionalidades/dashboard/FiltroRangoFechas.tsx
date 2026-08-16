import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateRangoPreset, ETIQUETAS_RANGO_PRESET, type RangoFechas, type RangoPreset } from "./rangoFechas";

export type PresetSeleccionado = RangoPreset | "PERSONALIZADO";

interface FiltroRangoFechasProps {
  presetSeleccionado: PresetSeleccionado;
  rango: RangoFechas;
  onChange: (presetSeleccionado: PresetSeleccionado, rango: RangoFechas) => void;
}

const PRESETS: RangoPreset[] = ["HOY", "SIETE_DIAS", "TREINTA_DIAS", "MES_ACTUAL", "MES_ANTERIOR"];

/** Selector de rango de fechas con presets (docs/08 §4). Componente de presentación: el cálculo de cada preset vive en `rangoFechas.ts`. */
export function FiltroRangoFechas({ presetSeleccionado, rango, onChange }: FiltroRangoFechasProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Rango de fechas">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={presetSeleccionado === preset ? "default" : "outline"}
            aria-pressed={presetSeleccionado === preset}
            onClick={() => onChange(preset, calculateRangoPreset(preset))}
          >
            {ETIQUETAS_RANGO_PRESET[preset]}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={presetSeleccionado === "PERSONALIZADO" ? "default" : "outline"}
          aria-pressed={presetSeleccionado === "PERSONALIZADO"}
          onClick={() => onChange("PERSONALIZADO", rango)}
        >
          Personalizado
        </Button>
      </div>

      {presetSeleccionado === "PERSONALIZADO" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="dashboard-fecha-desde" className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              id="dashboard-fecha-desde"
              type="date"
              value={rango.fechaDesde}
              onChange={(event) => onChange("PERSONALIZADO", { ...rango, fechaDesde: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="dashboard-fecha-hasta" className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="dashboard-fecha-hasta"
              type="date"
              value={rango.fechaHasta}
              onChange={(event) => onChange("PERSONALIZADO", { ...rango, fechaHasta: event.target.value })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
