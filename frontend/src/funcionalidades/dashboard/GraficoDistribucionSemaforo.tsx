import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SEMAFORO_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { DistribucionSemaforo } from "@/tipos/metricas";
import { PALETA_SEMAFORO } from "./paleta";

interface GraficoDistribucionSemaforoProps {
  datos: DistribucionSemaforo[];
}

/**
 * 3.6 Distribución por semáforo (docs/08 §3.6): anillo con el conteo por
 * color, **solo sobre leads en gestión** -- la exclusión de VENTA/NO_VENTA
 * ya la aplica `calculateDistribucionSemaforo`, este componente solo
 * dibuja lo que recibe. El color nunca va solo: cada segmento lleva su
 * etiqueta de texto en la leyenda (docs/07, criterio transversal de
 * accesibilidad -- "el semáforo nunca es solo color").
 */
export function GraficoDistribucionSemaforo({ datos }: GraficoDistribucionSemaforoProps) {
  const total = datos.reduce((suma, d) => suma + d.total, 0);
  const filas = datos.map((d) => ({ ...d, etiqueta: SEMAFORO_ETIQUETAS[d.semaforo] }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={filas}
          dataKey="total"
          nameKey="etiqueta"
          innerRadius={64}
          outerRadius={96}
          paddingAngle={2}
        >
          {filas.map((fila) => (
            <Cell key={fila.semaforo} fill={PALETA_SEMAFORO[fila.semaforo]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipDistribucion total={total} />} />
        <Legend formatter={(value: string) => value} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function TooltipDistribucion({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload: DistribucionSemaforo & { etiqueta: string } }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  const porcentaje = total === 0 ? 0 : Math.round((fila.total / total) * 1000) / 10;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.etiqueta}</p>
      <p className="text-muted-foreground">
        {fila.total} leads ({porcentaje} % de los leads en gestión)
      </p>
    </div>
  );
}
