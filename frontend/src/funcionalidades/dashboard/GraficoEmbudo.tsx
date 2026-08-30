import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ETAPA_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { EmbudoPaso, MetricasEmbudo } from "@/tipos/metricas";
import { getColorCategorico } from "./paleta";

interface GraficoEmbudoProps {
  datos: MetricasEmbudo;
}

/**
 * 3.3 Embudo por etapa (docs/08 §3.3): Recharts no trae un componente de
 * embudo nativo, así que se arma con un `BarChart` horizontal con las
 * cuatro etapas de avance en orden (Nuevo → Contactado → Cita → Venta),
 * etiquetando el % de caída de cada paso respecto del anterior directamente
 * sobre la barra. **No Venta se muestra aparte**, como una nota fuera del
 * embudo, nunca como un paso más -- es una salida, no una etapa de avance
 * (docs/08 §3.3).
 */
export function GraficoEmbudo({ datos }: GraficoEmbudoProps) {
  const filas = datos.pasos.map((paso, indice) => ({
    ...paso,
    etiqueta: ETAPA_ETIQUETAS[paso.etapa],
    color: getColorCategorico(indice),
  }));

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={filas}
          layout="vertical"
          barSize={28}
          margin={{ top: 8, right: 48, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="etiqueta" width={90} tick={{ fontSize: 12 }} />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipEmbudo />} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {filas.map((fila) => (
              <Cell key={fila.etapa} fill={fila.color} />
            ))}
            <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: "#334155" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Detalle de caídas del embudo">
        {filas.map((fila, indice) => (
          <li key={fila.etapa} className="rounded-md border border-border/80 bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Paso {indice + 1}</p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground text-pretty">{fila.etiqueta}</span>
              <span className="text-base font-semibold text-foreground tabular-nums">{fila.total}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              {fila.caidaPct === null
                ? "Punto de partida"
                : `${formatearCaida(fila.caidaPct)} vs. ${filas[indice - 1]?.etiqueta ?? "paso anterior"}`}
            </p>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">No Venta</span> (fuera del embudo, es una salida): {datos.noVenta} leads
      </p>
    </div>
  );
}

function TooltipEmbudo({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: EmbudoPaso & { etiqueta: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.etiqueta}</p>
      <p className="text-muted-foreground">{fila.total} leads</p>
      <p className="text-muted-foreground">
        {fila.caidaPct === null ? "Primer paso del embudo" : `${formatearCaida(fila.caidaPct)} vs. paso anterior`}
      </p>
    </div>
  );
}

function formatearCaida(caidaPct: number): string {
  if (caidaPct < 0) return `Aumento: ${Math.abs(caidaPct)} %`;
  if (caidaPct === 0) return "Sin variación";
  return `Caída: ${caidaPct} %`;
}
