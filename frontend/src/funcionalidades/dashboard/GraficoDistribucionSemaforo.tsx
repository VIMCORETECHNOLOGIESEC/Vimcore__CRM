import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SEMAFORO_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { DistribucionSemaforo } from "@/tipos/metricas";
import { COLOR_SIN_CALIFICAR, PALETA_SEMAFORO } from "./paleta";

interface GraficoDistribucionSemaforoProps {
  /** Objeto embebido en `ResumenMetricas.distribucionSemaforo` (`GET /metricas/resumen`, docs/08 §3.6) -- ya no un endpoint/array propio. */
  datos: DistribucionSemaforo;
}

interface Fila {
  clave: "rojo" | "amarillo" | "verde" | "sinCalificar";
  etiqueta: string;
  total: number;
  color: string;
}

/**
 * 3.6 Distribución por semáforo (docs/08 §3.6): anillo con el conteo por
 * color, **solo sobre leads en gestión** (exclusión de VENTA/NO_VENTA ya
 * aplicada por el backend). El color nunca va solo: cada segmento lleva su
 * etiqueta de texto en la leyenda (docs/07, criterio transversal de
 * accesibilidad -- "el semáforo nunca es solo color"). Incluye "Sin
 * calificar" (leads NUEVO sin calificar todavía, D14) como cuarto segmento,
 * en gris neutro -- el backend real sí distingue ese bucket, a diferencia del
 * mock anterior.
 */
export function GraficoDistribucionSemaforo({ datos }: GraficoDistribucionSemaforoProps) {
  const filas: Fila[] = [
    { clave: "verde", etiqueta: SEMAFORO_ETIQUETAS.VERDE, total: datos.verde, color: PALETA_SEMAFORO.VERDE },
    {
      clave: "amarillo",
      etiqueta: SEMAFORO_ETIQUETAS.AMARILLO,
      total: datos.amarillo,
      color: PALETA_SEMAFORO.AMARILLO,
    },
    { clave: "rojo", etiqueta: SEMAFORO_ETIQUETAS.ROJO, total: datos.rojo, color: PALETA_SEMAFORO.ROJO },
    { clave: "sinCalificar", etiqueta: "Sin calificar", total: datos.sinCalificar, color: COLOR_SIN_CALIFICAR },
  ];
  const total = filas.reduce((suma, f) => suma + f.total, 0);

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
            <Cell key={fila.clave} fill={fila.color} />
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
  payload?: { payload: Fila }[];
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
