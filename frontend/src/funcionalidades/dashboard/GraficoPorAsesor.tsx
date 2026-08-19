import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MetricasPorAsesor } from "@/tipos/metricas";
import { getColorCategorico } from "./paleta";

interface GraficoPorAsesorProps {
  /** Ya viene ordenado de mayor a menor (`getPorAsesorConSla`, `ORDER BY total DESC`, `metricas.repository.ts`). */
  datos: MetricasPorAsesor[];
}

/**
 * 3.2 Leads por responsable (asesor o vendedor traspasado, `getResponsable`
 * en `leads.utils.ts`): barras horizontales, orden mayor a menor
 * (docs/08 §3.2). Tasa de conversión y cumplimiento de SLA por responsable
 * en el tooltip. Visibilidad restringida a administrador/supervisor: se
 * controla en `DashboardPage.tsx`, este componente no conoce roles.
 */
export function GraficoPorAsesor({ datos }: GraficoPorAsesorProps) {
  const alto = Math.max(120, datos.length * 44);

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart
        data={datos}
        layout="vertical"
        barSize={24}
        margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="nombre"
          width={120}
          tick={{ fontSize: 12 }}
        />
        <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipAsesor />} />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} fill={getColorCategorico(1)} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TooltipAsesor({ active, payload }: { active?: boolean; payload?: { payload: MetricasPorAsesor }[] }) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.nombre}</p>
      <p className="text-muted-foreground">{fila.total} leads</p>
      <p className="text-muted-foreground">
        Conversión:{" "}
        {fila.tasaConversionPct === null
          ? "sin cerrados en el rango"
          : `${fila.tasaConversionPct} % (${fila.ventas} de ${fila.ventas + fila.noVentas})`}
      </p>
      <p className="text-muted-foreground">
        {fila.cumplimientoSlaPct === null
          ? "Cumplimiento de SLA: sin leads asignados en el rango"
          : `Cumplimiento de SLA: ${fila.cumplimientoSlaPct} %`}
      </p>
    </div>
  );
}
