import { useMemo } from "react";
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RED_SOCIAL_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";
import type { MetricasPorCampania } from "@/tipos/metricas";
import { PaginadorGrafico } from "./PaginadorGrafico";
import { getColorCategorico } from "./paleta";
import { useVentanaGrafico } from "./useVentanaGrafico";

interface GraficoPorCampaniaProps {
  /** Ya viene como top 10 ordenado (`getPorCampaniaTop10`, `ORDER BY total DESC LIMIT 10`, `metricas.repository.ts`) -- el backend acota el volumen de la CONSULTA, la ventana de abajo acota el ALTO del gráfico; son dos límites independientes. */
  datos: MetricasPorCampania[];
}

const ALTO_VENTANA = 300;
const TAMANO_VENTANA = 8;

/**
 * 3.4 Leads por campaña (docs/08 §3.4): barras horizontales, top 10 del
 * período. Etiqueta con nombre de campaña **y** red social juntos, porque
 * una misma campaña puede correr en redes distintas y son registros
 * independientes. `redSocial` puede ser `null` (leads previos a M5 sin ese
 * dato, mismo gap que `leads.api.ts::mapLeadFromApi`).
 *
 * Ventana fija (F5, mismo patrón que `GraficoPorAsesor`): con el top 10 ya
 * acotado por el backend, la ventana de `TAMANO_VENTANA` filas por página es
 * un ajuste de consistencia visual (nunca más de 2 páginas hoy), no una
 * corrección de un bug de altura infinita -- ese límite ya lo pone el
 * `LIMIT 10` del backend, a diferencia de `GraficoPorAsesor` (sin techo).
 * El buscador solo alcanza esas 10 campañas ya cargadas -- buscar una
 * campaña fuera del top 10 del período no encuentra resultado, misma
 * limitación que ya tenía el gráfico antes de este cambio.
 */
export function GraficoPorCampania({ datos }: GraficoPorCampaniaProps) {
  const filas = useMemo(
    () =>
      datos.map((d, indice) => ({
        ...d,
        id: `${d.nombreCampania}::${d.redSocial ?? "sin-red"}::${indice}`,
        nombre: `${d.nombreCampania} · ${d.redSocial ? RED_SOCIAL_ETIQUETAS[d.redSocial] : "Sin red social"}`,
      })),
    [datos],
  );
  const ventana = useVentanaGrafico(filas, TAMANO_VENTANA);

  return (
    <div className="flex flex-col gap-3">
      <ResponsableCombobox
        ariaLabel="Buscar campaña"
        placeholder="Buscar campaña…"
        placeholderBusqueda="Nombre de la campaña…"
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
          <YAxis type="category" dataKey="nombre" width={180} tick={{ fontSize: 12 }} />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipCampania />} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {ventana.visibles.map((fila) => (
              <Cell
                key={fila.id}
                fill={getColorCategorico(2)}
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

function TooltipCampania({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetricasPorCampania & { nombre: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.nombre}</p>
      <p className="text-muted-foreground">{fila.total} leads</p>
    </div>
  );
}
