import { Info } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";
import type { MetricasRankingProductoPorEmpresa } from "@/tipos/metricas";
import { PaginadorGrafico } from "./PaginadorGrafico";
import { getColorCategorico } from "./paleta";
import { useVentanaGrafico } from "./useVentanaGrafico";

interface GraficoRankingProductosPorEmpresaProps {
  /** Lista PLANA, una fila por par (empresa, producto), sin recorte top-N -- ver `MetricasRankingProductoPorEmpresa`. */
  datos: MetricasRankingProductoPorEmpresa[];
}

const ALTO_VENTANA = 300;
const TAMANO_VENTANA = 8;

/**
 * Ranking de productos por empresa (docs/23 item 13,
 * `GET /metricas/ranking-productos-por-empresa`) -- mismo patrón de ranking
 * que `GraficoPorProducto.tsx`, etiquetando cada barra con "Empresa ·
 * Producto" porque un mismo producto puede repetirse entre empresas
 * distintas (fila por par, sin agrupar).
 *
 * GAP CONOCIDO (E5, `docs/blocks/e-dashboards.md` líneas 38-65): hay un test
 * de backend fallando donde una sesión holding-wide puede no ver la fila de
 * una segunda empresa. Decisión ya tomada (no relitigar): se integra esta
 * gráfica completa igual, sin ocultarla, y se muestra un aviso informativo
 * (no destructivo) SOLO para sesión `holding` -- mismo criterio visual que
 * `AvisoBridge.tsx` (`Alert`/`AlertTitle`/`AlertDescription`, componente de
 * presentación puro). Una sesión `company` no lo ve: el gap es
 * específicamente holding-wide, y un administrador de una sola empresa
 * siempre ve nada más su propia fila de todos modos.
 */
export function GraficoRankingProductosPorEmpresa({ datos }: GraficoRankingProductosPorEmpresaProps) {
  const { user } = useAuth();
  const esHoldingWide = user?.sessionScope === "holding";

  const filas = useMemo(
    () =>
      datos.map((d, indice) => ({
        ...d,
        id: `${d.empresaId}::${d.productoId}::${indice}`,
        nombre: `${d.nombreEmpresa} · ${d.nombreProducto}`,
      })),
    [datos],
  );
  const ventana = useVentanaGrafico(filas, TAMANO_VENTANA);

  return (
    <div className="flex flex-col gap-3">
      {esHoldingWide ? (
        <Alert>
          <Info className="size-4" aria-hidden="true" />
          <AlertTitle>Datos posiblemente incompletos</AlertTitle>
          <AlertDescription>
            Los datos de esta vista pueden estar incompletos para sesiones de holding — gap conocido, reportado al
            equipo de backend.
          </AlertDescription>
        </Alert>
      ) : null}

      <ResponsableCombobox
        ariaLabel="Buscar empresa o producto"
        placeholder="Buscar empresa o producto…"
        placeholderBusqueda="Nombre de empresa o producto…"
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
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipRankingProductoPorEmpresa />} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {ventana.visibles.map((fila) => (
              <Cell
                key={fila.id}
                fill={getColorCategorico(4)}
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

function TooltipRankingProductoPorEmpresa({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetricasRankingProductoPorEmpresa & { nombre: string } }[];
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
