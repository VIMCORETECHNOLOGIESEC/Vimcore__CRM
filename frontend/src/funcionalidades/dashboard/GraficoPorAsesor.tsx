import { useMemo } from "react";
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";
import type { MetricasPorAsesor } from "@/tipos/metricas";
import { PaginadorGrafico } from "./PaginadorGrafico";
import { getColorCategorico } from "./paleta";
import { useVentanaGrafico } from "./useVentanaGrafico";

interface GraficoPorAsesorProps {
  /** Ya viene ordenado de mayor a menor (`getPorAsesorConSla`, `ORDER BY total DESC`, `metricas.repository.ts`), sin techo -- todos los asesores activos, no un top acotado. */
  datos: MetricasPorAsesor[];
}

/** Altura del área de gráfica dentro de la ventana fija (8 filas × 32px + margen), independiente de cuántos asesores existan. */
const ALTO_VENTANA = 300;
const TAMANO_VENTANA = 8;

/**
 * 3.2 Leads por responsable (asesor o vendedor traspasado, `getResponsable`
 * en `leads.utils.ts`): barras horizontales, orden mayor a menor
 * (docs/08 §3.2). Tasa de conversión y cumplimiento de SLA por responsable
 * en el tooltip. Visibilidad restringida a administrador/supervisor: se
 * controla en `DashboardPage.tsx`, este componente no conoce roles.
 *
 * Ventana fija (F5, feedback QA: con muchos asesores activos el alto del
 * contenedor crecía sin techo -- `Math.max(120, datos.length * 44)` sin
 * tope). Se muestran como máximo `TAMANO_VENTANA` barras por página; el
 * buscador (mismo `ResponsableCombobox` del filtro de responsable) salta a
 * la página del asesor elegido y lo resalta -- nunca reordena ni recorta
 * datos, solo cambia qué porción de la lista ya ordenada se ve.
 */
export function GraficoPorAsesor({ datos }: GraficoPorAsesorProps) {
  const filas = useMemo(
    () => datos.map((d) => ({ ...d, id: d.responsableId })),
    [datos],
  );
  const ventana = useVentanaGrafico(filas, TAMANO_VENTANA);

  return (
    <div className="flex flex-col gap-3">
      <ResponsableCombobox
        ariaLabel="Buscar asesor"
        placeholder="Buscar asesor…"
        placeholderBusqueda="Nombre del asesor…"
        valor={ventana.resaltadoId ?? ""}
        onChange={ventana.seleccionar}
        responsables={filas}
      />

      <ResponsiveContainer width="100%" height={ALTO_VENTANA}>
        <BarChart
          data={ventana.visibles}
          layout="vertical"
          barSize={24}
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 12 }} />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipAsesor />} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {ventana.visibles.map((fila) => (
              <Cell
                key={fila.id}
                fill={getColorCategorico(1)}
                opacity={ventana.resaltadoId === null || ventana.resaltadoId === fila.id ? 1 : 0.45}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <PaginadorGrafico
        pagina={ventana.pagina}
        totalPaginas={ventana.totalPaginas}
        onCambiarPagina={ventana.irAPagina}
      />
    </div>
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
