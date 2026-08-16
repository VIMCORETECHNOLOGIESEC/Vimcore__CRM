import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MetricasPorAsesor } from "@/tipos/metricas";
import { getColorCategorico } from "./paleta";

interface GraficoPorAsesorProps {
  /** Ya viene ordenado de mayor a menor (`calculateMetricasPorAsesor`). */
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
        Conversión: {fila.tasaConversion.porcentaje} % ({fila.tasaConversion.numerador} de{" "}
        {fila.tasaConversion.denominador})
      </p>
      <p className="text-muted-foreground">
        {fila.cumplimientoSla
          ? `Cumplimiento de SLA: ${fila.cumplimientoSla.porcentaje} % (${fila.cumplimientoSla.numerador} de ${fila.cumplimientoSla.denominador})`
          : "Cumplimiento de SLA: sin leads asignados en el rango"}
      </p>
    </div>
  );
}
