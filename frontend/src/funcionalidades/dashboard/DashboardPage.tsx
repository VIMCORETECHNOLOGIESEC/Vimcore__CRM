import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import type { Comparativa, ResumenMetricas } from "@/tipos/metricas";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { getCatalogoCampanias, getCatalogoResponsables } from "@/funcionalidades/leads/leads.api";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { DashboardFiltros } from "./DashboardFiltros";
import {
  buildMetricasFiltros,
  FILTROS_DASHBOARD_VACIOS,
  type DashboardFiltrosState,
  type RangoSeleccionado,
} from "./dashboard.utils";
import { FiltroRangoFechas } from "./FiltroRangoFechas";
import { formatFechaLocal } from "./rangoFechas";
import { GraficoCard } from "./GraficoCard";
import { GraficoDistribucionSemaforo } from "./GraficoDistribucionSemaforo";
import { GraficoEmbudo } from "./GraficoEmbudo";
import { GraficoPorAsesor } from "./GraficoPorAsesor";
import { GraficoPorCampania } from "./GraficoPorCampania";
import { GraficoPorRedSocial } from "./GraficoPorRedSocial";
import { GraficoRedSocialPorSemaforo } from "./GraficoRedSocialPorSemaforo";
import { KpiCard } from "./KpiCard";
import {
  useMetricasEmbudo,
  useMetricasPorAsesor,
  useMetricasPorCampania,
  useMetricasPorRedSocial,
  useRedSocialPorSemaforo,
  useResumenMetricas,
} from "./useMetricas";

/**
 * Dashboard de métricas (F5, docs/07 + docs/08-dashboard-kpis.md). Alcance
 * por rol (docs/08 §1): administrador/supervisor ven "Dashboard general"
 * (todos los leads), asesor/vendedor ven "Dashboard personal" (solo su
 * cartera) -- el recorte real de datos lo aplica el backend real desde el
 * JWT, no la UI.
 */
export function DashboardPage() {
  const { hasRole } = useAuth();
  const esGestorDeCartera = hasRole(["ADMINISTRADOR", "SUPERVISOR"]);

  usePageHeader({ title: esGestorDeCartera ? "Dashboard general" : "Dashboard personal" });

  const [rango, setRango] = useState<RangoSeleccionado>(() => {
    const hoy = formatFechaLocal(new Date());
    return { preset: "7d", desde: hoy, hasta: hoy };
  });
  const [filtrosDashboard, setFiltrosDashboard] = useState<DashboardFiltrosState>(FILTROS_DASHBOARD_VACIOS);

  const filtros = useMemo(() => buildMetricasFiltros(filtrosDashboard, rango), [filtrosDashboard, rango]);

  const campanias = useMemo(() => getCatalogoCampanias(), []);
  // `getCatalogoResponsables` es backend real (D-A2, integración F3/F4).
  const { data: responsables = [] } = useQuery({
    queryKey: ["catalogo-responsables", "TODOS"],
    queryFn: () => getCatalogoResponsables("TODOS"),
    enabled: esGestorDeCartera,
  });

  const resumen = useResumenMetricas(filtros);
  const porRedSocial = useMetricasPorRedSocial(filtros);
  const porAsesor = useMetricasPorAsesor(filtros, esGestorDeCartera);
  const embudo = useMetricasEmbudo(filtros);
  const porCampania = useMetricasPorCampania(filtros);
  const redSocialPorSemaforo = useRedSocialPorSemaforo(filtros);

  const embudoVacio = !embudo.data || (embudo.data.pasos.every((p) => p.total === 0) && embudo.data.noVenta === 0);
  const distribucionVacia =
    !resumen.data ||
    (resumen.data.distribucionSemaforo.rojo === 0 &&
      resumen.data.distribucionSemaforo.amarillo === 0 &&
      resumen.data.distribucionSemaforo.verde === 0 &&
      resumen.data.distribucionSemaforo.sinCalificar === 0);

  return (
    <div className="flex flex-col gap-4">
      {/*
        INTEGRACION-BACKEND: la actualización en tiempo real por SSE ya está
        resuelta -- no hace falta código acá. El backend emite
        "metricas.actualizadas" (debounce de 2s) ante ingreso de
        lead/cambio de etapa/cierre/asignación vía `EventBroker.broadcastAll`
        (`backend/src/lib/metricas-broadcast.ts`). El listener global
        `useNotificacionesRealtime` (montado en `layouts/AppLayout.tsx` para
        todas las rutas protegidas) decodifica ese evento e invalida
        `["metricas", ...]`; TanStack Query refetchea en segundo plano las
        queries ya montadas por `useMetricas.ts` sin polling. El indicador de
        reconexión ya lo expone `estado` de ese mismo hook (ver
        `CampanaNotificaciones.tsx`).
      */}

      <FiltroRangoFechas rango={rango} onChange={setRango} />
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
          isLoading={resumen.isLoading}
          isError={resumen.isError}
          error={resumen.error}
          onRetry={() => void resumen.refetch()}
          vacio={distribucionVacia}
        >
          {resumen.data ? <GraficoDistribucionSemaforo datos={resumen.data.distribucionSemaforo} /> : null}
        </GraficoCard>
      </div>
    </div>
  );
}

const FORMATO_NUMERO = new Intl.NumberFormat("es-EC");

/**
 * Arma un `Comparativa` a partir de un indicador cuyo `actual`/`anterior`
 * pueden venir `null` desde el backend (denominador 0, sin leads asignados,
 * etc. -- docs/08 §4). `Comparativa` exige `number`, así que sin dato
 * suficiente en alguno de los dos períodos no hay comparación posible: se
 * omite (`null`) en vez de mostrar un 0 engañoso.
 */
function toComparativa(actual: number | null, anterior: number | null, variacionPorcentual: number | null): Comparativa | null {
  if (actual === null || anterior === null) return null;
  return { actual, anterior, variacionPorcentual };
}

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
        valor={FORMATO_NUMERO.format(datos.totalIngresados.actual)}
        detalle="Incluye reingresos"
        comparativa={datos.totalIngresados}
      />
      <KpiCard
        titulo="Leads en gestión"
        valor={FORMATO_NUMERO.format(datos.enGestion.actual)}
        detalle="Etapa distinta de Venta/No Venta"
        comparativa={datos.enGestion}
      />
      <KpiCard
        titulo="Leads cerrados"
        valor={FORMATO_NUMERO.format(datos.cerrados.venta.actual + datos.cerrados.noVenta.actual)}
        detalle={`Venta: ${FORMATO_NUMERO.format(datos.cerrados.venta.actual)} · No Venta: ${FORMATO_NUMERO.format(datos.cerrados.noVenta.actual)}`}
        comparativa={datos.cerrados.total}
      />
      <KpiCard
        titulo="Tasa de conversión"
        valor={datos.tasaConversion.actual.porcentaje === null ? "Sin datos" : `${datos.tasaConversion.actual.porcentaje} %`}
        detalle={`${datos.tasaConversion.actual.venta} de ${datos.tasaConversion.actual.total} cerrados`}
        comparativa={toComparativa(
          datos.tasaConversion.actual.porcentaje,
          datos.tasaConversion.anterior.porcentaje,
          datos.tasaConversion.variacionPorcentual,
        )}
      />
      <KpiCard
        titulo="Tiempo promedio de primera respuesta"
        valor={
          datos.tiempoPrimeraRespuesta.horasPromedio === null
            ? "Sin datos"
            : `${datos.tiempoPrimeraRespuesta.horasPromedio} h`
        }
        detalle={`${FORMATO_NUMERO.format(datos.tiempoPrimeraRespuesta.sinPrimeraRespuesta)} leads sin primera respuesta`}
        comparativa={toComparativa(
          datos.tiempoPrimeraRespuesta.horasPromedio,
          datos.tiempoPrimeraRespuesta.anteriorHorasPromedio,
          datos.tiempoPrimeraRespuesta.variacionPorcentual,
        )}
      />
      <KpiCard
        titulo="Tiempo promedio de cierre (Venta)"
        valor={
          datos.tiempoPromedioCierre.diasPromedio === null
            ? "Sin datos"
            : `${datos.tiempoPromedioCierre.diasPromedio} d`
        }
        comparativa={toComparativa(
          datos.tiempoPromedioCierre.diasPromedio,
          datos.tiempoPromedioCierre.anteriorDiasPromedio,
          datos.tiempoPromedioCierre.variacionPorcentual,
        )}
      />
      <KpiCard
        titulo="Cumplimiento de SLA"
        valor={datos.cumplimientoSla.porcentaje === null ? "Sin datos" : `${datos.cumplimientoSla.porcentaje} %`}
        detalle={datos.cumplimientoSla.porcentaje === null ? "Sin leads asignados en el rango" : "Atendidos dentro de 24 h"}
        comparativa={toComparativa(
          datos.cumplimientoSla.porcentaje,
          datos.cumplimientoSla.anteriorPorcentaje,
          datos.cumplimientoSla.variacionPorcentual,
        )}
      />
    </div>
  );
}
