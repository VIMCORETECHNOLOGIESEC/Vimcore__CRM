import { useMemo } from "react";
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";
import type { MetricasPorProducto } from "@/tipos/metricas";
import { PaginadorGrafico } from "./PaginadorGrafico";
import { getColorCategorico } from "./paleta";
import { useVentanaGrafico } from "./useVentanaGrafico";

interface GraficoPorProductoProps {
  /** Ranking GLOBAL, sin `empresaId` (el backend ya acota a la empresa del caller) -- ver `MetricasPorProducto`. */
  datos: MetricasPorProducto[];
}

const ALTO_VENTANA = 300;
const TAMANO_VENTANA = 8;

/**
 * Rendimiento por producto (docs/23 item 13, `GET /metricas/por-producto`):
 * mismo patrón `ResponsableCombobox` + `useVentanaGrafico` + `PaginadorGrafico`
 * que `GraficoPorCampania.tsx`/`GraficoPorAsesor.tsx` -- a diferencia de
 * campañas (top 10 ya acotado por el backend), acá no hay techo documentado
 * en el contrato, así que la ventana fija sí es la única defensa contra un
 * alto de contenedor sin límite (mismo motivo que `GraficoPorAsesor`).
 */
export function GraficoPorProducto({ datos }: GraficoPorProductoProps) {
  const filas = useMemo(
    () => datos.map((d) => ({ ...d, id: d.productoId, nombre: d.nombreProducto })),
    [datos],
  );
  const ventana = useVentanaGrafico(filas, TAMANO_VENTANA);

  return (
    <div className="flex flex-col gap-3">
      <ResponsableCombobox
        ariaLabel="Buscar producto"
        placeholder="Buscar producto…"
        placeholderBusqueda="Nombre del producto…"
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
          <YAxis type="category" dataKey="nombre" width={140} tick={{ fontSize: 12 }} />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipProducto />} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {ventana.visibles.map((fila) => (
              <Cell
                key={fila.id}
                fill={getColorCategorico(3)}
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

function TooltipProducto({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetricasPorProducto & { nombre: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.nombre}</p>
      <p className="text-muted-foreground">{fila.total} oportunidades</p>
      <p className="text-muted-foreground">
        Conversión:{" "}
        {fila.tasaConversionPct === null
          ? "sin cerradas en el rango"
          : `${fila.tasaConversionPct} % (${fila.ventas} de ${fila.ventas + fila.noVentas})`}
      </p>
    </div>
  );
}
