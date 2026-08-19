import { ArrowDown, ArrowUp } from "lucide-react";
import type { Comparativa } from "@/tipos/metricas";

interface KpiCardProps {
  titulo: string;
  valor: string;
  detalle?: string;
  /** `undefined`/`null` cuando el indicador no tiene comparativa. */
  comparativa?: Comparativa | null;
}

const FORMATO_NUMERO = new Intl.NumberFormat("es-EC");

/**
 * Tarjeta de KPI reusable para los 7 indicadores de resumen (docs/07 F5).
 * Componente de presentación: la lógica de cálculo del valor/comparativa ya
 * está resuelta y testeada del lado del backend real (`metricas.service.ts`,
 * worktree `dev-back`) -- acá solo se decide qué ícono mostrar según el
 * signo, sin recalcular nada de negocio.
 */
export function KpiCard({ titulo, valor, detalle, comparativa }: KpiCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
      <span className="text-2xl font-semibold text-foreground">{valor}</span>
      {detalle ? <span className="text-xs text-muted-foreground">{detalle}</span> : null}
      {comparativa ? <ComparativaIndicador comparativa={comparativa} /> : null}
    </div>
  );
}

function ComparativaIndicador({ comparativa }: { comparativa: Comparativa }) {
  if (comparativa.variacionPorcentual === null) {
    return (
      <span className="text-xs text-muted-foreground">
        Período anterior: {FORMATO_NUMERO.format(comparativa.anterior)} leads (muestra insuficiente
        para mostrar variación %)
      </span>
    );
  }

  const subio = comparativa.variacionPorcentual >= 0;
  return (
    <span
      className={`flex items-center gap-1 text-xs font-medium ${subio ? "text-green-700" : "text-red-700"}`}
    >
      {subio ? (
        <ArrowUp className="size-3" aria-hidden="true" />
      ) : (
        <ArrowDown className="size-3" aria-hidden="true" />
      )}
      {Math.abs(comparativa.variacionPorcentual).toFixed(1)} % vs. período anterior (
      {FORMATO_NUMERO.format(comparativa.anterior)})
    </span>
  );
}
