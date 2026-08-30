import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getErrorMessage } from "@/api/httpClient";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import {
  buildMetricasFiltros,
  FILTROS_DASHBOARD_VACIOS,
  type DashboardFiltrosState,
  type RangoSeleccionado,
} from "@/funcionalidades/dashboard/dashboard.utils";
import { DashboardFiltros } from "@/funcionalidades/dashboard/DashboardFiltros";
import { FiltroRangoFechas } from "@/funcionalidades/dashboard/FiltroRangoFechas";
import { formatFechaLocal } from "@/funcionalidades/dashboard/rangoFechas";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { getCatalogoCampanias, getCatalogoResponsables } from "@/funcionalidades/leads/leads.api";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import type { ReporteParametros, TipoReporte } from "@/tipos/reporte";
import { DescargarReporteButton } from "./DescargarReporteButton";
import { EstadoReporteJobBadge } from "./EstadoReporteJobBadge";
import { useCrearReporteJob, useReporteJob, useReporteJobActivo } from "./useReportes";

const TIPOS_REPORTE: { valor: TipoReporte; etiqueta: string }[] = [
  { valor: "pdf", etiqueta: "PDF" },
  { valor: "xlsx", etiqueta: "Excel" },
];

/**
 * `tipo` es el único campo de este formulario que necesita validación real
 * (AGENTS.md §4 -- React Hook Form + Zod; `ReporteParametros`/
 * `reporteParametrosSchema` vive solo en
 * `backend/src/schemas/reportes/reporte.schema.ts`, fuera de cualquier
 * paquete compartido, así que se duplica localmente el único campo que
 * corresponde -- mismo criterio que `crearBridgeSchema` en
 * `NuevoBridgeDialog.tsx`). `rango`/`filtrosDashboard` quedan FUERA de este
 * schema a propósito: no son texto libre, los maneja
 * `FiltroRangoFechas`/`DashboardFiltros` -- los mismos componentes
 * controlados que `DashboardPage.tsx` ya usa sin `<form>`/RHF -- forzarlos
 * por `Controller` duplicaría una validación que esos componentes ya
 * resuelven.
 */
const generarReporteSchema = z.object({
  tipo: z.enum(["pdf", "xlsx"]),
});
type GenerarReporteValues = z.infer<typeof generarReporteSchema>;

/**
 * Exportación de reportes (docs/23 item 15, PDF/XLSX) -- ruta exclusiva
 * `ADMINISTRADOR`/`SUPERVISOR` (el gate real de rol lo aplica el router,
 * ver `router.tsx`; el backend igual revalida en cada endpoint). Reusa
 * `FiltroRangoFechas`/`DashboardFiltros`/`buildMetricasFiltros` del
 * dashboard tal cual, sin duplicarlos -- son los mismos 6 filtros
 * (`MetricasFiltros`) que exige `ReporteParametros`.
 *
 * Diseño de estado (ver `useReportes.ts`): `useReporteJobActivo()` solo
 * resincroniza el `jobIdActivo` al montar; el seguimiento en vivo de un job
 * puntual (incluso tras LISTO/ERROR) pasa siempre por
 * `useReporteJob(jobIdActivo)`, refrescado por la invalidación SSE ya
 * cableada en `useNotificacionesRealtime.ts` -- esta página nunca hace
 * polling.
 *
 * Sesión holding-wide: reusa la MISMA técnica que
 * `ConectarWhatsAppCard.tsx`/`GraficoRankingProductosPorEmpresa.tsx`
 * (`user?.sessionScope === "holding"` + `useVistaEmpresa()` sobre
 * `?empresaId=` en la URL) en vez de construir un selector de empresa
 * nuevo -- a diferencia de WhatsApp, acá `empresaId` es opcional (el
 * backend real no lo exige), así que sin `?empresaId=` el reporte
 * simplemente cubre todo el holding.
 */
export function ReportesPage() {
  const { hasRole, user } = useAuth();
  const esGestorDeCartera = hasRole(["ADMINISTRADOR", "SUPERVISOR"]);
  const esHoldingWide = user?.sessionScope === "holding";
  const { empresaVistaId } = useVistaEmpresa();

  usePageHeader({ title: "Reportes" });

  const { handleSubmit, watch, setValue } = useForm<GenerarReporteValues>({
    resolver: zodResolver(generarReporteSchema),
    defaultValues: { tipo: "pdf" },
  });
  const tipo = watch("tipo");
  const [rango, setRango] = useState<RangoSeleccionado>(() => {
    const hoy = formatFechaLocal(new Date());
    return { preset: "7d", desde: hoy, hasta: hoy };
  });
  const [filtrosDashboard, setFiltrosDashboard] = useState<DashboardFiltrosState>(FILTROS_DASHBOARD_VACIOS);
  const [jobIdActivo, setJobIdActivo] = useState<string | null>(null);

  const campanias = useMemo(() => getCatalogoCampanias(), []);
  const { data: responsables = [] } = useQuery({
    queryKey: ["catalogo-responsables", "TODOS"],
    queryFn: () => getCatalogoResponsables("TODOS"),
    enabled: esGestorDeCartera,
  });

  // Paso 1 del diseño de estado: resync inicial, solo si todavía no hay un
  // `jobIdActivo` propio (ej. uno recién creado en esta misma sesión).
  const jobActivoQuery = useReporteJobActivo();
  useEffect(() => {
    if (jobIdActivo === null && jobActivoQuery.data) {
      setJobIdActivo(jobActivoQuery.data.id);
    }
  }, [jobIdActivo, jobActivoQuery.data]);

  // Paso 2: al crear un job (nuevo o uno idéntico ya activo, misma forma de
  // respuesta), pasa a ser el job rastreado.
  const crearJob = useCrearReporteJob();
  useEffect(() => {
    if (crearJob.data) {
      setJobIdActivo(crearJob.data.id);
    }
  }, [crearJob.data]);

  // Paso 3: fuente de verdad del job rastreado, refrescada por SSE.
  const trackedJob = useReporteJob(jobIdActivo);

  const enviar = handleSubmit((valores) => {
    const parametros: ReporteParametros = { ...buildMetricasFiltros(filtrosDashboard, rango) };
    if (esHoldingWide && empresaVistaId) {
      parametros.empresaId = empresaVistaId;
    }
    crearJob.mutate({ tipo: valores.tipo, parametros });
  });

  const mostrandoResyncInicial = jobIdActivo === null && jobActivoQuery.isLoading;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <form
        onSubmit={enviar}
        noValidate
        className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm md:p-5"
      >
        <div>
          <h2 className="text-xl font-semibold text-foreground">Generar reporte</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Elegí el formato y los filtros del reporte que querés generar.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Formato</span>
          <div className="flex gap-1.5" role="group" aria-label="Formato del reporte">
            {TIPOS_REPORTE.map((opcion) => (
              <Button
                key={opcion.valor}
                type="button"
                size="sm"
                variant={tipo === opcion.valor ? "default" : "outline"}
                aria-pressed={tipo === opcion.valor}
                onClick={() => setValue("tipo", opcion.valor)}
              >
                {opcion.etiqueta}
              </Button>
            ))}
          </div>
        </div>

        <FiltroRangoFechas rango={rango} onChange={setRango} />
        <DashboardFiltros
          filtros={filtrosDashboard}
          onChange={setFiltrosDashboard}
          campanias={campanias}
          responsables={responsables}
          mostrarFiltroResponsable={esGestorDeCartera}
        />

        {esHoldingWide ? (
          <p className="text-sm text-muted-foreground">
            {empresaVistaId
              ? "Se generará para la empresa seleccionada en «Empresas»."
              : "Se generará para todo el holding (sin acotar a una empresa). Elegí una empresa desde «Empresas» para acotarlo."}
          </p>
        ) : null}

        <Button type="submit" disabled={crearJob.isPending} className="w-fit">
          {crearJob.isPending ? "Generando…" : "Generar reporte"}
        </Button>
      </form>

      <section
        aria-labelledby="reportes-estado"
        className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm md:p-5"
      >
        <h2 id="reportes-estado" className="text-lg font-semibold text-foreground">
          Estado del reporte
        </h2>

        <div className="mt-3">
          {mostrandoResyncInicial ? (
            <LoadingState rows={2} />
          ) : jobIdActivo === null ? (
            <EmptyState
              title="Todavía no generaste ningún reporte"
              description="Completá el formulario y generá tu primer reporte."
            />
          ) : trackedJob.isLoading ? (
            <LoadingState rows={2} />
          ) : trackedJob.isError ? (
            <ErrorState
              message={getErrorMessage(trackedJob.error)}
              onRetry={() => void trackedJob.refetch()}
            />
          ) : trackedJob.data ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <EstadoReporteJobBadge estado={trackedJob.data.estado} />
                <span className="text-sm text-muted-foreground">
                  {trackedJob.data.tipo === "pdf" ? "PDF" : "Excel"}
                </span>
              </div>
              {trackedJob.data.estado === "ERROR" && trackedJob.data.error ? (
                <p className="text-sm text-destructive">{trackedJob.data.error}</p>
              ) : null}
              <DescargarReporteButton job={trackedJob.data} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
