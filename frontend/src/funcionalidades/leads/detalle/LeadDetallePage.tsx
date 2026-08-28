import { useParams } from "react-router";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { getErrorMessage } from "@/api/httpClient";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { AccionesResponsable } from "./AccionesResponsable";
import { LeadDatosContacto } from "./LeadDatosContacto";
import { LeadDetalleEncabezado } from "./LeadDetalleEncabezado";
import { LeadOrigenInfo } from "./LeadOrigenInfo";
import { LeadTimeline } from "./LeadTimeline";
import { PanelCitas } from "./PanelCitas";
import { useLeadDetalle } from "./useLeadDetalle";

/**
 * Detalle del lead (F4, docs/07-modulos-frontend.md). Muestra el **estado
 * actual** con su formulario, no un timeline de interacciones libres --
 * `LeadTimeline` (docs/02 §6) sí visualiza el progreso como línea de tiempo,
 * pero solo permite avanzar linealmente, nunca retroceder. Mock hasta que
 * exista el backend real -- ver `leadDetalle.api.ts` para los puntos de
 * integración pendientes (M6/M7).
 */
export function LeadDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: lead, isLoading, isError, error, refetch } = useLeadDetalle(id ?? "");

  usePageHeader(
    lead ? { title: lead.cliente.nombre, backTo: { label: "Leads", href: "/leads" } } : null,
  );

  if (!id) {
    return <ErrorState message="Falta el identificador del lead en la URL." />;
  }

  if (isLoading) {
    return <LoadingState rows={5} rowHeight="h-16" />;
  }

  if (isError || !lead) {
    return (
      <ErrorState
        message={error ? getErrorMessage(error) : "No se encontró el lead solicitado."}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!user) {
    return <EmptyState title="Sesión no disponible" description="Iniciá sesión nuevamente." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <LeadDetalleEncabezado lead={lead} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LeadDatosContacto cliente={lead.cliente} />
        <LeadOrigenInfo lead={lead} />
      </div>

      <AccionesResponsable lead={lead} user={user} />

      <LeadTimeline lead={lead} />

      <PanelCitas leadId={lead.id} usuarioId={user.id} />
    </div>
  );
}
