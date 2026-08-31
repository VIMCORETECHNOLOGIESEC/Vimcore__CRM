import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReporteJob } from "@/tipos/reporte";
import { useDescargarReporte } from "./useReportes";

interface DescargarReporteButtonProps {
  job: ReporteJob;
}

/**
 * Acción de descarga de un reporte ya `LISTO` (docs/23 item 15,
 * `GET /reportes/jobs/:id/descargar`). Aislada de `ReportesPage.tsx` porque
 * es la única pieza de la pantalla con lógica de descarga binaria
 * autenticada -- ver `reportes.api.ts::descargarReporteApi`. Sin `onError`
 * propio: un fallo (409/404) ya se muestra vía el toast global del
 * `MutationCache` (`api/queryClient.ts`).
 */
export function DescargarReporteButton({ job }: DescargarReporteButtonProps) {
  const descargar = useDescargarReporte();

  if (job.estado !== "LISTO") return null;

  return (
    <Button
      type="button"
      onClick={() => descargar.mutate({ jobId: job.id, tipo: job.tipo })}
      disabled={descargar.isPending}
      className="w-fit gap-2"
    >
      <Download className="size-4" aria-hidden="true" />
      {descargar.isPending ? "Descargando…" : "Descargar reporte"}
    </Button>
  );
}
