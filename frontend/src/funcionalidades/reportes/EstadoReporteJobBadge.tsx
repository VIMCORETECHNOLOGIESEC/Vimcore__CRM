import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { EstadoReporteJob } from "@/tipos/reporte";

/**
 * Indicador de estado de un job de reporte (docs/23 item 15). El contrato
 * real (`reportes.service.ts`) NO expone progreso/porcentaje -- solo estos 4
 * valores discretos -- así que la UI representa el avance como este badge,
 * nunca como una barra de progreso.
 *
 * Color + etiqueta de texto SIEMPRE juntos (docs/07, criterios transversales
 * -- el semáforo nunca es solo color): cada variante de `Badge` ya trae su
 * propio texto fijo acá, nunca se usa el color solo.
 */
const ESTADO_CONFIG: Record<EstadoReporteJob, { etiqueta: string; variant: BadgeProps["variant"] }> = {
  PENDIENTE: { etiqueta: "Pendiente", variant: "neutral" },
  PROCESANDO: { etiqueta: "Generando…", variant: "warning" },
  LISTO: { etiqueta: "Listo", variant: "success" },
  ERROR: { etiqueta: "Error", variant: "destructive" },
};

interface EstadoReporteJobBadgeProps {
  estado: EstadoReporteJob;
}

export function EstadoReporteJobBadge({ estado }: EstadoReporteJobBadgeProps) {
  const config = ESTADO_CONFIG[estado];
  return <Badge variant={config.variant}>{config.etiqueta}</Badge>;
}
