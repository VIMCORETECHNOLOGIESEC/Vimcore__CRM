import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ETAPA_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { EmbudoPaso, MetricasEmbudoOportunidad } from "@/tipos/metricas";
import { getColorCategorico } from "./paleta";

interface GraficoEmbudoOportunidadProps {
  datos: MetricasEmbudoOportunidad;
}

/**
 * Embudo de negociación sobre `Oportunidad` (docs/23 item 13,
 * `GET /metricas/embudo-oportunidad`) -- adaptación de `GraficoEmbudo.tsx`
 * con el mismo criterio (Recharts sin componente de embudo nativo, se arma
 * con un `BarChart` horizontal con las 4 etapas en orden, No Venta aparte).
 *
 * Se clona en vez de reusar `GraficoEmbudo` tal cual porque ambos embudos
 * (Lead y Oportunidad) conviven en la misma página (`DashboardPage.tsx`,
 * secciones "Operación" y "Negociación / producto") -- reusar el mismo
 * `aria-label`/texto fijo de "No Venta" hubiera colisionado para lectores de
 * pantalla (dos listas con el mismo nombre accesible).
 */
export function GraficoEmbudoOportunidad({ datos }: GraficoEmbudoOportunidadProps) {
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
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipEmbudoOportunidad />} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {filas.map((fila) => (
              <Cell key={fila.etapa} fill={fila.color} />
            ))}
            <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: "#334155" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Detalle de caídas del embudo de Oportunidad">
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
        <span className="font-medium text-foreground">No Venta</span> (fuera del embudo de Oportunidad, es una salida): {datos.noVenta} oportunidades
      </p>
    </div>
  );
}

function TooltipEmbudoOportunidad({
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
      <p className="text-muted-foreground">{fila.total} oportunidades</p>
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
