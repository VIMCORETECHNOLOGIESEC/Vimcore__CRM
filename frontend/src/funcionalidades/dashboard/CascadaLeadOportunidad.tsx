import type { MetricasCascadaLeadOportunidad as CascadaLeadOportunidadDatos } from "@/tipos/metricas";

interface CascadaLeadOportunidadProps {
  datos: CascadaLeadOportunidadDatos;
}

const FORMATO_NUMERO = new Intl.NumberFormat("es-EC");
const FORMATO_PORCENTAJE = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 });

/**
 * Cascada Lead → Oportunidad (docs/23 item 13,
 * `GET /metricas/cascada-lead-oportunidad`) -- vista compacta de
 * estadísticas, NO un gráfico (el contrato solo trae 3 conteos + 2 tasas,
 * no una serie apta para barras/embudo). Cohorte: cuenta leads que
 * ingresaron en el rango seleccionado y si alguna vez llegaron a tener
 * Oportunidad / cerraron en Venta (sin un segundo filtro de fecha sobre
 * `Oportunidad`) -- por eso se etiqueta como "alguna vez", no "en el
 * período", para no insinuar una segunda ventana de tiempo que no existe.
 */
export function CascadaLeadOportunidad({ datos }: CascadaLeadOportunidadProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <EstadisticaCascada titulo="Leads del período" valor={FORMATO_NUMERO.format(datos.leads)} />
      <EstadisticaCascada
        titulo="Con Oportunidad (alguna vez)"
        valor={FORMATO_NUMERO.format(datos.conOportunidad)}
        detalle={formatearTasa(datos.tasaAperturaPct, "tasa de apertura")}
      />
      <EstadisticaCascada
        titulo="Con Venta (alguna vez)"
        valor={FORMATO_NUMERO.format(datos.ventaOportunidad)}
        detalle={formatearTasa(datos.tasaCierrePct, "tasa de cierre")}
      />
    </div>
  );
}

function formatearTasa(pct: number | null, etiqueta: string): string {
  if (pct === null) return "Sin datos suficientes para calcular la tasa";
  return `${FORMATO_PORCENTAJE.format(pct)} % de ${etiqueta}`;
}

interface EstadisticaCascadaProps {
  titulo: string;
  valor: string;
  detalle?: string;
}

function EstadisticaCascada({ titulo, valor, detalle }: EstadisticaCascadaProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card/70 p-3">
      <span className="text-xs font-medium text-muted-foreground text-pretty">{titulo}</span>
      <span className="text-2xl font-semibold text-foreground tabular-nums">{valor}</span>
      {detalle ? <span className="text-xs text-muted-foreground text-pretty">{detalle}</span> : null}
    </div>
  );
}
