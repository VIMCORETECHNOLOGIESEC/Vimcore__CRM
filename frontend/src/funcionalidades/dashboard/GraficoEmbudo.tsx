import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ETAPA_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { MetricasEmbudo, MetricasPorEtapa } from "@/tipos/metricas";
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
      <p className="text-xs text-muted-foreground">
        No Venta (fuera del embudo, es una salida): {datos.noVentaTotal} leads
      </p>
    </div>
  );
}

function TooltipEmbudo({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetricasPorEtapa & { etiqueta: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.etiqueta}</p>
      <p className="text-muted-foreground">{fila.total} leads</p>
      <p className="text-muted-foreground">
        {fila.caidaPorcentaje === null
          ? "Primer paso del embudo"
          : `Caída vs. paso anterior: ${fila.caidaPorcentaje} %`}
      </p>
    </div>
  );
}
