import { useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import type { ResumenMetricas } from "@/tipos/metricas";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useAuth } from "@/funcionalidades/autenticacion/AuthContext";
import { getCatalogoCampanias, getCatalogoResponsables } from "@/funcionalidades/leads/leads.api";
import { DashboardFiltros } from "./DashboardFiltros";
import {
  buildMetricasFiltros,
  FILTROS_DASHBOARD_VACIOS,
  type DashboardFiltrosState,
} from "./dashboard.utils";
import { FiltroRangoFechas, type PresetSeleccionado } from "./FiltroRangoFechas";
import { GraficoCard } from "./GraficoCard";
import { GraficoDistribucionSemaforo } from "./GraficoDistribucionSemaforo";
import { GraficoEmbudo } from "./GraficoEmbudo";
import { GraficoPorAsesor } from "./GraficoPorAsesor";
import { GraficoPorCampania } from "./GraficoPorCampania";
import { GraficoPorRedSocial } from "./GraficoPorRedSocial";
import { GraficoRedSocialPorSemaforo } from "./GraficoRedSocialPorSemaforo";
import { KpiCard } from "./KpiCard";
import { calculateRangoPreset, type RangoFechas } from "./rangoFechas";
import {
  useDistribucionSemaforo,
  useMetricasPorAsesor,
  useMetricasPorCampania,
  useMetricasPorEtapa,
  useMetricasPorRedSocial,
  useRedSocialPorSemaforo,
  useResumenMetricas,
} from "./useMetricas";

const RANGO_INICIAL: PresetSeleccionado = "SIETE_DIAS";

/**
 * Dashboard de métricas (F5, docs/07 + docs/08-dashboard-kpis.md).
 * Alcance por rol (docs/08 §1): administrador/supervisor ven "Dashboard
 * general" (todos los leads), asesor/vendedor ven "Dashboard personal"
 * (solo su cartera) -- el recorte real de datos lo aplica el mock en
 * `metricas.utils.ts` a partir de `useAuth().user`, igual patrón que F3
 * (`LeadsPage.tsx`/`useLeads.ts`).
 */
export function DashboardPage() {
  const { hasRole } = useAuth();
  const esGestorDeCartera = hasRole(["ADMINISTRADOR", "SUPERVISOR"]);

  const [presetSeleccionado, setPresetSeleccionado] = useState<PresetSeleccionado>(RANGO_INICIAL);
  const [rango, setRango] = useState<RangoFechas>(() => calculateRangoPreset("SIETE_DIAS"));
  const [filtrosDashboard, setFiltrosDashboard] = useState<DashboardFiltrosState>(FILTROS_DASHBOARD_VACIOS);

  const filtros = useMemo(() => buildMetricasFiltros(filtrosDashboard, rango), [filtrosDashboard, rango]);

  const campanias = useMemo(() => getCatalogoCampanias(), []);
  const responsables = useMemo(() => getCatalogoResponsables(), []);

  const resumen = useResumenMetricas(filtros);
  const porRedSocial = useMetricasPorRedSocial(filtros);
  const porAsesor = useMetricasPorAsesor(filtros, esGestorDeCartera);
  const embudo = useMetricasPorEtapa(filtros);
  const porCampania = useMetricasPorCampania(filtros);
  const redSocialPorSemaforo = useRedSocialPorSemaforo(filtros);
  const distribucionSemaforo = useDistribucionSemaforo(filtros);

  function onChangeRango(preset: PresetSeleccionado, nuevoRango: RangoFechas) {
    setPresetSeleccionado(preset);
    setRango(nuevoRango);
  }

  const embudoVacio =
    !embudo.data || (embudo.data.pasos.every((p) => p.total === 0) && embudo.data.noVentaTotal === 0);
  const distribucionVacia = !distribucionSemaforo.data || distribucionSemaforo.data.every((d) => d.total === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">
          {esGestorDeCartera ? "Dashboard general" : "Dashboard personal"}
        </h1>
        {/*
          INTEGRACION-BACKEND: acá se conecta la actualización en tiempo real
          por SSE (docs/08 §5 -- M9/F5, todavía no existen ni el endpoint de
          eventos ni el motor de notificaciones en el backend). Cuando
          exista, el servidor reemite indicadores recalculados en ventanas
          de 2s ante ingreso de lead/cambio de etapa/cierre/asignación; el
          cliente debe invalidar las queries ["metricas", ...] (ver
          `useMetricas.ts`) en vez de hacer polling -- mismo criterio que el
          comentario SSE ya dejado en `LeadsPage.tsx` (F3), y con el mismo
          indicador de reconexión pedido en docs/08 §5 ante interrupción del
          canal.
        */}
      </div>

      <FiltroRangoFechas presetSeleccionado={presetSeleccionado} rango={rango} onChange={onChangeRango} />
      <DashboardFiltros
        filtros={filtrosDashboard}
        onChange={setFiltrosDashboard}
        campanias={campanias}
        responsables={responsables}
        mostrarFiltroResponsable={esGestorDeCartera}
      />

      <ResumenKpis
        isLoading={resumen.isLoading}
        isError={resumen.isError}
        error={resumen.error}
        onRetry={() => void resumen.refetch()}
        datos={resumen.data}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GraficoCard
          titulo="Leads por red social"
          descripcion="Conteo agrupado por red social del período"
          isLoading={porRedSocial.isLoading}
          isError={porRedSocial.isError}
          error={porRedSocial.error}
          onRetry={() => void porRedSocial.refetch()}
          vacio={!porRedSocial.data || porRedSocial.data.length === 0}
        >
          {porRedSocial.data ? <GraficoPorRedSocial datos={porRedSocial.data} /> : null}
        </GraficoCard>

        {esGestorDeCartera ? (
          <GraficoCard
            titulo="Leads por asesor"
            descripcion="Ordenado de mayor a menor"
            isLoading={porAsesor.isLoading}
            isError={porAsesor.isError}
            error={porAsesor.error}
            onRetry={() => void porAsesor.refetch()}
            vacio={!porAsesor.data || porAsesor.data.length === 0}
          >
            {porAsesor.data ? <GraficoPorAsesor datos={porAsesor.data} /> : null}
          </GraficoCard>
        ) : null}

        <GraficoCard
          titulo="Embudo por etapa"
          descripcion="Nuevo → Contactado → Cita → Venta. No Venta se muestra aparte."
          isLoading={embudo.isLoading}
          isError={embudo.isError}
          error={embudo.error}
          onRetry={() => void embudo.refetch()}
          vacio={embudoVacio}
        >
          {embudo.data ? <GraficoEmbudo datos={embudo.data} /> : null}
        </GraficoCard>

        <GraficoCard
          titulo="Leads por campaña"
          descripcion="Top 10 campañas del período"
          isLoading={porCampania.isLoading}
          isError={porCampania.isError}
          error={porCampania.error}
          onRetry={() => void porCampania.refetch()}
          vacio={!porCampania.data || porCampania.data.length === 0}
        >
          {porCampania.data ? <GraficoPorCampania datos={porCampania.data} /> : null}
        </GraficoCard>

        <GraficoCard
          titulo="Red social × semáforo"
          descripcion="De qué red llegan los leads con más probabilidad de cierre"
          isLoading={redSocialPorSemaforo.isLoading}
          isError={redSocialPorSemaforo.isError}
          error={redSocialPorSemaforo.error}
          onRetry={() => void redSocialPorSemaforo.refetch()}
          vacio={!redSocialPorSemaforo.data || redSocialPorSemaforo.data.length === 0}
        >
          {redSocialPorSemaforo.data ? (
            <GraficoRedSocialPorSemaforo datos={redSocialPorSemaforo.data} />
          ) : null}
        </GraficoCard>

        <GraficoCard
          titulo="Distribución por semáforo"
          descripcion="Solo leads en gestión (excluye Venta y No Venta)"
          isLoading={distribucionSemaforo.isLoading}
          isError={distribucionSemaforo.isError}
          error={distribucionSemaforo.error}
          onRetry={() => void distribucionSemaforo.refetch()}
          vacio={distribucionVacia}
        >
          {distribucionSemaforo.data ? (
            <GraficoDistribucionSemaforo datos={distribucionSemaforo.data} />
          ) : null}
        </GraficoCard>
      </div>
    </div>
  );
}

const FORMATO_NUMERO = new Intl.NumberFormat("es-EC");

interface ResumenKpisProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  datos: ResumenMetricas | undefined;
}

/** Las 7 tarjetas de resumen (docs/07 F5, docs/08 §2) con sus tres estados obligatorios. */
function ResumenKpis({ isLoading, isError, error, onRetry, datos }: ResumenKpisProps) {
  if (isLoading) {
    return <LoadingState rows={2} rowHeight="h-24" />;
  }
  if (isError) {
    return <ErrorState message={getErrorMessage(error)} onRetry={onRetry} />;
  }
  if (!datos) {
    return <EmptyState title="Sin datos para el rango y los filtros seleccionados." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        titulo="Total de leads ingresados"
        valor={FORMATO_NUMERO.format(datos.totalIngresados)}
        detalle="Incluye reingresos"
        comparativa={datos.comparativa.totalIngresados}
      />
      <KpiCard
        titulo="Leads en gestión"
        valor={FORMATO_NUMERO.format(datos.enGestion)}
        detalle="Etapa distinta de Venta/No Venta"
      />
      <KpiCard
        titulo="Leads cerrados"
        valor={FORMATO_NUMERO.format(datos.cerrados.venta + datos.cerrados.noVenta)}
        detalle={`Venta: ${FORMATO_NUMERO.format(datos.cerrados.venta)} · No Venta: ${FORMATO_NUMERO.format(datos.cerrados.noVenta)}`}
      />
      <KpiCard
        titulo="Tasa de conversión"
        valor={`${datos.tasaConversion.porcentaje} %`}
        detalle={`${datos.tasaConversion.numerador} de ${datos.tasaConversion.denominador} cerrados`}
      />
      <KpiCard
        titulo="Tiempo promedio de primera respuesta"
        valor={
          datos.tiempoPromedioPrimeraRespuestaHoras === null
            ? "Sin datos"
            : `${datos.tiempoPromedioPrimeraRespuestaHoras} h`
        }
        detalle={`${FORMATO_NUMERO.format(datos.leadsSinPrimeraRespuesta)} leads sin primera respuesta`}
      />
      <KpiCard
        titulo="Tiempo promedio de cierre (Venta)"
        valor={datos.tiempoPromedioCierreDias === null ? "Sin datos" : `${datos.tiempoPromedioCierreDias} d`}
        detalle={
          datos.tiempoPromedioCierreNoVentaDias === null
            ? "No Venta: sin datos"
            : `No Venta: ${datos.tiempoPromedioCierreNoVentaDias} d`
        }
      />
      <KpiCard
        titulo="Cumplimiento de SLA"
        valor={datos.cumplimientoSla === null ? "Sin datos" : `${datos.cumplimientoSla.porcentaje} %`}
        detalle={
          datos.cumplimientoSla === null
            ? "Sin leads asignados en el rango"
            : `${datos.cumplimientoSla.numerador} de ${datos.cumplimientoSla.denominador} atendidos en 24 h`
        }
      />
    </div>
  );
}
