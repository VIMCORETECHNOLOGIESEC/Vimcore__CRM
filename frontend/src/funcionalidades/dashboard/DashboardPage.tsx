import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import type { Comparativa, ResumenMetricas } from "@/tipos/metricas";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
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
import { DashboardExportar } from "./DashboardExportar";
import { SelectorEmpresaDashboard } from "./SelectorEmpresaDashboard";
import { formatFechaLocal } from "./rangoFechas";
import { CascadaLeadOportunidad } from "./CascadaLeadOportunidad";
import { GraficoCard } from "./GraficoCard";
import { GraficoDistribucionSemaforo } from "./GraficoDistribucionSemaforo";
import { GraficoEmbudo } from "./GraficoEmbudo";
import { GraficoEmbudoOportunidad } from "./GraficoEmbudoOportunidad";
import { GraficoPorAsesor } from "./GraficoPorAsesor";
import { GraficoPorCampania } from "./GraficoPorCampania";
import { GraficoPorProducto } from "./GraficoPorProducto";
import { GraficoPorRedSocial } from "./GraficoPorRedSocial";
import { GraficoRankingProductosPorEmpresa } from "./GraficoRankingProductosPorEmpresa";
import { GraficoRedSocialPorSemaforo } from "./GraficoRedSocialPorSemaforo";
import { KpiCard } from "./KpiCard";
import {
  useMetricasCascadaLeadOportunidad,
  useMetricasEmbudo,
  useMetricasEmbudoOportunidad,
  useMetricasPorAsesor,
  useMetricasPorCampania,
  useMetricasPorProducto,
  useMetricasPorRedSocial,
  useMetricasRankingProductosPorEmpresa,
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
  const { hasRole, user } = useAuth();
  const esGestorDeCartera = hasRole(["ADMINISTRADOR", "SUPERVISOR"]);
  // docs/23 item 14 -- "Dashboard con filtro por empresa (holding)". Gate
  // deliberadamente MÁS ESTRECHO que "cualquier rol holding-wide": la fuente
  // del listado de empresas del selector (`GET /empresas`, ver
  // `SelectorEmpresaDashboard.tsx`) es exclusiva de `ADMINISTRADOR` en el
  // backend -- un `SUPERVISOR` holding-wide recibiría un 403 si se intentara
  // poblar igual. Ese rol simplemente ve el dashboard consolidado del
  // holding completo, sin selector, sin perder nada frente a hoy.
  const esAdministradorHoldingWide = hasRole(["ADMINISTRADOR"]) && user?.sessionScope === "holding";
  const { empresaVistaId } = useVistaEmpresa();

  usePageHeader({ title: esGestorDeCartera ? "Dashboard general" : "Dashboard personal" });

  const [rango, setRango] = useState<RangoSeleccionado>(() => {
    const hoy = formatFechaLocal(new Date());
    return { preset: "7d", desde: hoy, hasta: hoy };
  });
  const [filtrosDashboard, setFiltrosDashboard] = useState<DashboardFiltrosState>(FILTROS_DASHBOARD_VACIOS);

  // `empresaVistaId` solo tiene efecto real para una sesión holding-wide
  // (`resolveEmpresaId` en `metricas.access.ts`, backend); para una sesión
  // `company` el backend ya fuerza su propia empresa e ignora este campo, así
  // que da igual que nunca esté seteado en ese caso (el selector ni se
  // renderiza). `undefined` (no `null`) para que `toParams` lo omita del
  // query string igual que el resto de filtros opcionales.
  const filtros = useMemo(
    () => ({ ...buildMetricasFiltros(filtrosDashboard, rango), empresaId: empresaVistaId ?? undefined }),
    [filtrosDashboard, rango, empresaVistaId],
  );

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
  // docs/23 item 13 -- extensión de dashboard con métricas de `Oportunidad`.
  const embudoOportunidad = useMetricasEmbudoOportunidad(filtros);
  const porProducto = useMetricasPorProducto(filtros);
  const cascadaLeadOportunidad = useMetricasCascadaLeadOportunidad(filtros);
  const rankingProductosPorEmpresa = useMetricasRankingProductosPorEmpresa(filtros);
  const metricasActualizando = [
    resumen.isFetching,
    porRedSocial.isFetching,
    porAsesor.isFetching,
    embudo.isFetching,
    porCampania.isFetching,
    redSocialPorSemaforo.isFetching,
    embudoOportunidad.isFetching,
    porProducto.isFetching,
    cascadaLeadOportunidad.isFetching,
    rankingProductosPorEmpresa.isFetching,
  ].some(Boolean);

  const embudoVacio = !embudo.data || (embudo.data.pasos.every((p) => p.total === 0) && embudo.data.noVenta === 0);
  const distribucionVacia =
    !resumen.data ||
    (resumen.data.distribucionSemaforo.rojo === 0 &&
      resumen.data.distribucionSemaforo.amarillo === 0 &&
      resumen.data.distribucionSemaforo.verde === 0 &&
      resumen.data.distribucionSemaforo.sinCalificar === 0);
  const embudoOportunidadVacio =
    !embudoOportunidad.data ||
    (embudoOportunidad.data.pasos.every((p) => p.total === 0) && embudoOportunidad.data.noVenta === 0);
  const cascadaLeadOportunidadVacia = !cascadaLeadOportunidad.data || cascadaLeadOportunidad.data.leads === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6">
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

      <section
        aria-labelledby="dashboard-contexto"
        className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm md:p-5"
      >
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">Panel ejecutivo</p>
            <h2 id="dashboard-contexto" className="mt-1 text-xl font-semibold text-foreground text-balance">
              Contexto de la lectura
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
              Ajusta el período y la segmentación para leer el desempeño comercial del período.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-fit rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
              {esGestorDeCartera ? "Vista consolidada" : "Vista de cartera"}
            </span>
            <DashboardExportar
              data={{
                resumen: resumen.data,
                porRedSocial: porRedSocial.data,
                porAsesor: porAsesor.data,
                porCampania: porCampania.data,
                embudo: embudo.data,
                redSocialPorSemaforo: redSocialPorSemaforo.data,
                embudoOportunidad: embudoOportunidad.data,
                porProducto: porProducto.data,
                cascadaLeadOportunidad: cascadaLeadOportunidad.data,
                rankingProductosPorEmpresa: rankingProductosPorEmpresa.data,
              }}
              contexto={{
                rango: rango.preset === "personalizado" ? `${rango.desde} a ${rango.hasta}` : rango.preset,
                empresa: {
                  nombre: "CRM Comercial",
                  usuario: user?.nombre ?? "Sesión actual",
                  correo: user?.correo ?? "",
                },
                filtros: [
                  `Red social: ${filtrosDashboard.redSocial === "TODOS" ? "Todas" : filtrosDashboard.redSocial}`,
                  `Campaña: ${filtrosDashboard.campania === "TODOS" ? "Todas" : filtrosDashboard.campania}`,
                  ...(esGestorDeCartera ? [`Responsable: ${filtrosDashboard.responsableId === "TODOS" ? "Todos" : responsables.find((responsable) => responsable.id === filtrosDashboard.responsableId)?.nombre ?? "Seleccionado"}`] : []),
                ],
              }}
              filtros={filtros}
              rangoReal={resumen.data?.rango}
            />
          </div>
        </div>

        {esAdministradorHoldingWide ? (
          <div className="mt-4 min-w-0 max-w-xs">
            <SelectorEmpresaDashboard />
          </div>
        ) : null}

        <div className="mt-4 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.8fr)]">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Período</p>
            <FiltroRangoFechas rango={rango} onChange={setRango} />
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Segmentación</p>
            <DashboardFiltros
              filtros={filtrosDashboard}
              onChange={setFiltrosDashboard}
              campanias={campanias}
              responsables={responsables}
              mostrarFiltroResponsable={esGestorDeCartera}
            />
          </div>
        </div>
      </section>

      {metricasActualizando ? (
        <div
          className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Actualizando métricas…
        </div>
      ) : null}

      <section aria-labelledby="dashboard-resumen" className="flex flex-col gap-3">
        <EncabezadoSeccion
          id="dashboard-resumen"
          titulo="Resumen ejecutivo"
          descripcion="Las cuatro señales principales primero; los tiempos y el SLA quedan como lectura operativa."
        />
        <ResumenKpis
          isLoading={resumen.isLoading}
          isError={resumen.isError}
          error={resumen.error}
          onRetry={() => void resumen.refetch()}
          datos={resumen.data}
        />
      </section>

      <section aria-labelledby="dashboard-operacion" className="flex flex-col gap-3">
        <EncabezadoSeccion
          id="dashboard-operacion"
          titulo="Operación"
          descripcion="Sigue el avance del embudo y detecta dónde se concentra la calidad pendiente."
        />
        <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
          <GraficoCard
            className="min-w-0"
            destacado
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
            className="min-w-0"
            compacto
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

          <GraficoCard
            className="min-w-0"
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
            className="min-w-0"
            compacto
            titulo="Red social × semáforo"
            descripcion="Calidad por origen, con el porcentaje verde visible por red"
            isLoading={redSocialPorSemaforo.isLoading}
            isError={redSocialPorSemaforo.isError}
            error={redSocialPorSemaforo.error}
            onRetry={() => void redSocialPorSemaforo.refetch()}
            vacio={!redSocialPorSemaforo.data || redSocialPorSemaforo.data.length === 0}
          >
            {redSocialPorSemaforo.data ? <GraficoRedSocialPorSemaforo datos={redSocialPorSemaforo.data} /> : null}
          </GraficoCard>
        </div>
      </section>

      <section aria-labelledby="dashboard-adquisicion" className="flex flex-col gap-3">
        <EncabezadoSeccion
          id="dashboard-adquisicion"
          titulo="Adquisición / calidad"
          descripcion="Compara el volumen que trae cada origen con las campañas y responsables que lo convierten en gestión."
        />
        <div
          className="grid min-w-0 items-stretch gap-4 md:grid-cols-2"
        >
          <GraficoCard
            className="h-full min-w-0"
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
              className="h-full min-w-0"
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

        </div>
      </section>

      <section aria-labelledby="dashboard-negociacion" className="flex flex-col gap-3">
        <EncabezadoSeccion
          id="dashboard-negociacion"
          titulo="Negociación / producto"
          descripcion="Embudo y rendimiento de Oportunidad, y qué tan bien convierte cada producto (docs/23 item 13)."
        />
        {/*
          NOTA DE ASIMETRÍA DE FILTROS (a propósito, no un bug): `redSocial`/
          `campania` de `filtros` son ignorados en silencio por el backend
          para `embudo-oportunidad`/`por-producto`/`ranking-productos-por-
          empresa` -- son métricas `Oportunidad`-scoped, sin join a `Lead`.
          Sí aplican para `cascada-lead-oportunidad`, que está `Lead`-scoped.
          Ver detalle en `metricas.api.ts`.
        */}
        <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
          <GraficoCard
            className="min-w-0"
            destacado
            titulo="Embudo de Oportunidad"
            descripcion="Nuevo → Contactado → Cita → Venta, sobre Oportunidad. No Venta se muestra aparte."
            isLoading={embudoOportunidad.isLoading}
            isError={embudoOportunidad.isError}
            error={embudoOportunidad.error}
            onRetry={() => void embudoOportunidad.refetch()}
            vacio={embudoOportunidadVacio}
          >
            {embudoOportunidad.data ? <GraficoEmbudoOportunidad datos={embudoOportunidad.data} /> : null}
          </GraficoCard>

          <GraficoCard
            className="min-w-0"
            compacto
            titulo="Cascada Lead → Oportunidad"
            descripcion="Leads del período que alguna vez llegaron a Oportunidad / Venta"
            isLoading={cascadaLeadOportunidad.isLoading}
            isError={cascadaLeadOportunidad.isError}
            error={cascadaLeadOportunidad.error}
            onRetry={() => void cascadaLeadOportunidad.refetch()}
            vacio={cascadaLeadOportunidadVacia}
          >
            {cascadaLeadOportunidad.data ? (
              <CascadaLeadOportunidad datos={cascadaLeadOportunidad.data} />
            ) : null}
          </GraficoCard>

          <GraficoCard
            className="min-w-0"
            titulo="Rendimiento por producto"
            descripcion="Ranking global de oportunidades por producto"
            isLoading={porProducto.isLoading}
            isError={porProducto.isError}
            error={porProducto.error}
            onRetry={() => void porProducto.refetch()}
            vacio={!porProducto.data || porProducto.data.length === 0}
          >
            {porProducto.data ? <GraficoPorProducto datos={porProducto.data} /> : null}
          </GraficoCard>

          <GraficoCard
            className="min-w-0"
            titulo="Ranking de productos por empresa"
            descripcion="Una fila por cada par empresa · producto"
            isLoading={rankingProductosPorEmpresa.isLoading}
            isError={rankingProductosPorEmpresa.isError}
            error={rankingProductosPorEmpresa.error}
            onRetry={() => void rankingProductosPorEmpresa.refetch()}
            vacio={!rankingProductosPorEmpresa.data || rankingProductosPorEmpresa.data.length === 0}
          >
            {rankingProductosPorEmpresa.data ? (
              <GraficoRankingProductosPorEmpresa datos={rankingProductosPorEmpresa.data} />
            ) : null}
          </GraficoCard>
        </div>
      </section>
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

function resumenSinConteosActuales(datos: ResumenMetricas): boolean {
  const conteosActuales = [
    datos.totalIngresados.actual,
    datos.enGestion.actual,
    datos.cerrados.total.actual,
    datos.cerrados.venta.actual,
    datos.cerrados.noVenta.actual,
    datos.tasaConversion.actual.venta,
    datos.tasaConversion.actual.total,
    datos.tiempoPrimeraRespuesta.sinPrimeraRespuesta,
    datos.distribucionSemaforo.rojo,
    datos.distribucionSemaforo.amarillo,
    datos.distribucionSemaforo.verde,
    datos.distribucionSemaforo.sinCalificar,
  ];

  return conteosActuales.every((conteo) => conteo === 0);
}

interface ResumenKpisProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  datos: ResumenMetricas | undefined;
}

/** Los 7 indicadores de resumen (docs/07 F5, docs/08 §2) con sus tres estados obligatorios. */
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
  if (resumenSinConteosActuales(datos)) {
    return <EmptyState title="Sin datos para el rango y los filtros seleccionados." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          nivel="principal"
          titulo="Total de leads ingresados"
          valor={FORMATO_NUMERO.format(datos.totalIngresados.actual)}
          detalle="Incluye reingresos"
          comparativa={datos.totalIngresados}
          unidadComparativa="leads"
        />
        <KpiCard
          nivel="principal"
          titulo="Leads en gestión"
          valor={FORMATO_NUMERO.format(datos.enGestion.actual)}
          detalle="Etapa distinta de Venta/No Venta"
          comparativa={datos.enGestion}
          unidadComparativa="leads"
        />
        <KpiCard
          nivel="principal"
          titulo="Leads cerrados"
          valor={FORMATO_NUMERO.format(datos.cerrados.venta.actual + datos.cerrados.noVenta.actual)}
          detalle={`Venta: ${FORMATO_NUMERO.format(datos.cerrados.venta.actual)} · No Venta: ${FORMATO_NUMERO.format(datos.cerrados.noVenta.actual)}`}
          comparativa={datos.cerrados.total}
          unidadComparativa="leads"
        />
        <KpiCard
          nivel="principal"
          titulo="Tasa de conversión"
          valor={
            datos.tasaConversion.actual.porcentaje === null
              ? "Sin datos"
              : `${datos.tasaConversion.actual.porcentaje} %`
          }
          detalle={`${datos.tasaConversion.actual.venta} de ${datos.tasaConversion.actual.total} cerrados`}
          comparativa={toComparativa(
            datos.tasaConversion.actual.porcentaje,
            datos.tasaConversion.anterior.porcentaje,
            datos.tasaConversion.variacionPorcentual,
          )}
          unidadComparativa="porcentaje"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 border-t border-border/70 pt-3 sm:grid-cols-3">
        <KpiCard
          nivel="secundario"
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
          unidadComparativa="horas"
          subidaFavorable={false}
        />
        <KpiCard
          nivel="secundario"
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
          unidadComparativa="días"
          subidaFavorable={false}
        />
        <KpiCard
          nivel="secundario"
          titulo="Cumplimiento de SLA"
          valor={datos.cumplimientoSla.porcentaje === null ? "Sin datos" : `${datos.cumplimientoSla.porcentaje} %`}
          detalle={datos.cumplimientoSla.porcentaje === null ? "Sin leads asignados en el rango" : "Atendidos dentro de 24 h"}
          comparativa={toComparativa(
            datos.cumplimientoSla.porcentaje,
            datos.cumplimientoSla.anteriorPorcentaje,
            datos.cumplimientoSla.variacionPorcentual,
          )}
          unidadComparativa="porcentaje"
        />
      </div>
    </div>
  );
}

interface EncabezadoSeccionProps {
  id: string;
  titulo: string;
  descripcion: string;
}

function EncabezadoSeccion({ id, titulo, descripcion }: EncabezadoSeccionProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <h2 id={id} className="text-lg font-semibold text-foreground text-balance">
        {titulo}
      </h2>
      <p className="max-w-2xl text-xs text-muted-foreground text-pretty sm:text-right">{descripcion}</p>
    </div>
  );
}
