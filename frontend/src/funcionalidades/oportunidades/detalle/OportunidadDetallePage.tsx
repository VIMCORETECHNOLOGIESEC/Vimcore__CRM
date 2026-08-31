import { useParams } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { OportunidadCierrePanel } from "./OportunidadCierrePanel";
import { OportunidadEncabezado } from "./OportunidadEncabezado";
import { OportunidadEtapaAcciones } from "./OportunidadEtapaAcciones";
import { OportunidadReasignarPanel } from "./OportunidadReasignarPanel";
import { useOportunidadDetalle } from "./useOportunidadDetalle";

/**
 * Detalle de una oportunidad (Bloque D). Muestra el estado actual
 * (encabezado) y los paneles de acción -- avance de etapa (slice 8), cierre
 * VENTA/NO_VENTA (slice 9) y reasignación administrativa (slice 10). Cuando
 * la oportunidad está en etapa terminal la página sigue renderizando en modo
 * solo lectura: el encabezado con la fecha de cierre y, en lugar del panel de
 * cierre, un resumen de "Oportunidad cerrada".
 */
export function OportunidadDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useOportunidadDetalle(id ?? "");

  usePageHeader({
    title: "Detalle de oportunidad",
    backTo: { label: "Oportunidades", href: "/oportunidades" },
  });

  if (!id) {
    return <ErrorState message="Falta el identificador de la oportunidad en la URL." />;
  }

  if (isLoading) {
    return <LoadingState rows={5} rowHeight="h-16" />;
  }

  if (isError) {
    return <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />;
  }

  if (!data) {
    return (
      <EmptyState
        title="No se encontró la oportunidad solicitada."
        description="Puede que se haya cerrado o que ya no tengas acceso a ella."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <OportunidadEncabezado oportunidad={data} />
      <OportunidadEtapaAcciones oportunidad={data} />
      <OportunidadCierrePanel oportunidad={data} />
      <OportunidadReasignarPanel oportunidad={data} />
    </div>
  );
}
