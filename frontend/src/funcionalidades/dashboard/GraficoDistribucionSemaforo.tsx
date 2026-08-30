import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SEMAFORO_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import { cn } from "@/lib/utils";
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

const CLASES_INDICADOR: Record<Fila["clave"], string> = {
  verde: "bg-semaforo-frio",
  amarillo: "bg-semaforo-tibio",
  rojo: "bg-semaforo-caliente",
  sinCalificar: "bg-muted-foreground",
};

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
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-muted-foreground">
        Total en gestión: <span className="font-semibold text-foreground tabular-nums">{total}</span>
      </p>
      <ResponsiveContainer width="100%" height={170}>
        <PieChart>
          <Pie
            data={filas}
            dataKey="total"
            nameKey="etiqueta"
            innerRadius={44}
            outerRadius={70}
            paddingAngle={2}
          >
            {filas.map((fila) => (
              <Cell key={fila.clave} fill={fila.color} />
            ))}
          </Pie>
          <Tooltip content={<TooltipDistribucion total={total} />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Detalle de distribución por semáforo">
        {filas.map((fila) => (
          <li key={fila.clave} className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
            <span className={cn("size-2.5 shrink-0 rounded-full", CLASES_INDICADOR[fila.clave])} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-xs text-foreground text-pretty">{fila.etiqueta}</span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{fila.total}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatearPorcentaje(fila.total, total)} %</span>
          </li>
        ))}
      </ul>
    </div>
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
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.etiqueta}</p>
      <p className="text-muted-foreground">
        {fila.total} leads ({formatearPorcentaje(fila.total, total)} % de los leads en gestión)
      </p>
    </div>
  );
}

function formatearPorcentaje(valor: number, total: number): number {
  return total === 0 ? 0 : Math.round((valor / total) * 1000) / 10;
}
