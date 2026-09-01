import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  descargarExcel,
  descargarPdf,
  obtenerLeadsParaExportacion,
  type DashboardExportContext,
  type DashboardExportData,
} from "./exportarDashboard";
import type { MetricasFiltros } from "@/tipos/metricas";

interface DashboardExportarProps {
  data: DashboardExportData;
  contexto: DashboardExportContext;
  filtros: MetricasFiltros;
  rangoReal?: { desde: string; hasta: string };
}

function DescargaToast({ progreso }: { progreso: number }) {
  const completado = progreso >= 100;
  const radio = 15;
  const circunferencia = 2 * Math.PI * radio;

  return (
    <div className="flex min-w-72 items-center gap-3 rounded-lg border bg-background p-3 text-foreground shadow-lg" role="status" aria-live="polite">
      <span className="relative flex size-10 shrink-0 items-center justify-center">
        <svg className="size-10 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r={radio} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
          <circle
            cx="20"
            cy="20"
            r={radio}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-primary transition-[stroke-dashoffset] duration-300 ease-out"
            strokeDasharray={circunferencia}
            strokeDashoffset={circunferencia - (progreso / 100) * circunferencia}
          />
        </svg>
        <span className="absolute text-[10px] font-semibold tabular-nums">{completado ? "✓" : `${progreso}%`}</span>
      </span>
      <div>
        <p className="text-sm font-semibold">{completado ? "Archivo descargado" : "Descargando archivo…"}</p>
        <p className="text-xs text-muted-foreground">{completado ? "La exportación está lista." : "Preparando datos filtrados"}</p>
      </div>
    </div>
  );
}

export function DashboardExportar({ data, contexto, filtros, rangoReal }: DashboardExportarProps) {
  async function exportar(tipo: "excel" | "pdf") {
    const toastId = `exportacion-${Date.now()}`;
    const ventanaPdf = tipo === "pdf" ? window.open("", "_blank") : null;
    const actualizarToast = (progreso: number) =>
      toast.custom(() => <DescargaToast progreso={progreso} />, { id: toastId, duration: Infinity });

    actualizarToast(12);
    try {
      if (tipo === "pdf" && !ventanaPdf) throw new Error("popup bloqueado");
      const leads = await obtenerLeadsParaExportacion(filtros, rangoReal, (progreso) => actualizarToast(progreso));
      actualizarToast(82);
      const datosCompletos = { ...data, leads };
      if (tipo === "excel") descargarExcel(datosCompletos, contexto);
      else descargarPdf(datosCompletos, contexto, ventanaPdf);
      actualizarToast(100);
      window.setTimeout(() => toast.dismiss(toastId), 2200);
    } catch {
      ventanaPdf?.close();
      toast.error("No se pudo preparar la exportación. Intenta nuevamente.", { id: toastId });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 border-border/70 bg-background px-3 text-xs font-semibold">
          <Download className="size-3.5" aria-hidden="true" />
          Exportar vista actual
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Descarga rápida de datos filtrados</DropdownMenuLabel>
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          Descarga instantánea de lo que ves en pantalla ahora. Para un reporte formal
          con más alcance, usá{" "}
          <Link to="/reportes" className="font-medium text-primary underline-offset-2 hover:underline">
            Reportes
          </Link>
          .
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void exportar("excel")}>
          <FileSpreadsheet className="text-success" aria-hidden="true" />
          Descargar Excel
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exportar("pdf")}>
          <FileText className="text-destructive" aria-hidden="true" />
          Descargar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
