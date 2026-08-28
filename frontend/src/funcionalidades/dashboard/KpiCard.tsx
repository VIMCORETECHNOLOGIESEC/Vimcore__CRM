import { ArrowDown, ArrowUp } from "lucide-react";
import type { Comparativa } from "@/tipos/metricas";
import { cn } from "@/lib/utils";

type NivelKpi = "principal" | "secundario";
type UnidadComparativa = "leads" | "horas" | "días" | "porcentaje";

interface KpiCardProps {
  titulo: string;
  valor: string;
  detalle?: string;
  nivel?: NivelKpi;
  /** `undefined`/`null` cuando el indicador no tiene comparativa. */
  comparativa?: Comparativa | null;
  unidadComparativa?: UnidadComparativa;
  /** Indica si una subida en este KPI es favorable. */
  subidaFavorable?: boolean;
}

const FORMATO_NUMERO = new Intl.NumberFormat("es-EC");
const FORMATO_METRICA = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 });

/**
 * Tarjeta de KPI reusable para los 7 indicadores de resumen (docs/07 F5).
 * Componente de presentación: la lógica de cálculo del valor/comparativa ya
 * está resuelta y testeada del lado del backend real (`metricas.service.ts`,
 * worktree `dev-back`) -- acá solo se decide qué ícono mostrar según el
 * signo, sin recalcular nada de negocio.
 */
export function KpiCard({
  titulo,
  valor,
  detalle,
  nivel = "principal",
  comparativa,
  unidadComparativa = "leads",
  subidaFavorable = true,
}: KpiCardProps) {
  const esPrincipal = nivel === "principal";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card",
        esPrincipal ? "border-l-4 border-l-primary p-4 shadow-sm" : "bg-card/70 p-3",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground text-pretty">{titulo}</span>
      <span
        className={cn(
          "font-semibold text-foreground tabular-nums text-balance",
          esPrincipal ? "text-2xl" : "text-lg",
        )}
      >
        {valor}
      </span>
      {detalle ? <span className="text-xs text-muted-foreground text-pretty">{detalle}</span> : null}
      {comparativa ? (
        <ComparativaIndicador
          comparativa={comparativa}
          unidad={unidadComparativa}
          subidaFavorable={subidaFavorable}
        />
      ) : null}
    </div>
  );
}

function ComparativaIndicador({
  comparativa,
  unidad,
  subidaFavorable,
}: {
  comparativa: Comparativa;
  unidad: UnidadComparativa;
  subidaFavorable: boolean;
}) {
  const anterior = formatearAnterior(comparativa.anterior, unidad);

  if (comparativa.variacionPorcentual === null) {
    return (
      <span className="text-xs text-muted-foreground text-pretty">
        Período anterior: {anterior} (muestra insuficiente para mostrar variación %)
      </span>
    );
  }

  const subio = comparativa.variacionPorcentual >= 0;
  const esFavorable = subio === subidaFavorable;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        esFavorable ? "text-green-700" : "text-red-700",
      )}
    >
      {subio ? (
        <ArrowUp className="size-3" aria-hidden="true" />
      ) : (
        <ArrowDown className="size-3" aria-hidden="true" />
      )}
      {Math.abs(comparativa.variacionPorcentual).toFixed(1)} % vs. período anterior (
      {anterior})
    </span>
  );
}

function formatearAnterior(valor: number, unidad: UnidadComparativa): string {
  if (unidad === "porcentaje") return `${FORMATO_METRICA.format(valor)} %`;
  if (unidad === "horas") return `${FORMATO_METRICA.format(valor)} h`;
  if (unidad === "días") return `${FORMATO_METRICA.format(valor)} d`;
  return `${FORMATO_NUMERO.format(valor)} leads`;
}
