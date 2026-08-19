import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RED_SOCIAL_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { MetricasPorCampania } from "@/tipos/metricas";
import { getColorCategorico } from "./paleta";

interface GraficoPorCampaniaProps {
  /** Ya viene como top 10 ordenado (`getPorCampaniaTop10`, `ORDER BY total DESC LIMIT 10`, `metricas.repository.ts`). */
  datos: MetricasPorCampania[];
}

/**
 * 3.4 Leads por campaña (docs/08 §3.4): barras horizontales, top 10.
 * Etiqueta con nombre de campaña **y** red social juntos, porque una misma
 * campaña puede correr en redes distintas y son registros independientes.
 * `redSocial` puede ser `null` (leads previos a M5 sin ese dato, mismo gap
 * que `leads.api.ts::mapLeadFromApi`).
 */
export function GraficoPorCampania({ datos }: GraficoPorCampaniaProps) {
  const filas = datos.map((d, indice) => ({
    ...d,
    clave: `${d.nombreCampania}::${d.redSocial ?? "sin-red"}::${indice}`,
    etiqueta: `${d.nombreCampania} · ${d.redSocial ? RED_SOCIAL_ETIQUETAS[d.redSocial] : "Sin red social"}`,
  }));
  const alto = Math.max(120, filas.length * 44);

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart
        data={filas}
        layout="vertical"
        barSize={24}
        margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="etiqueta" width={180} tick={{ fontSize: 12 }} />
        <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipCampania />} />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} fill={getColorCategorico(2)} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TooltipCampania({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetricasPorCampania & { etiqueta: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.etiqueta}</p>
      <p className="text-muted-foreground">{fila.total} leads</p>
    </div>
  );
}
