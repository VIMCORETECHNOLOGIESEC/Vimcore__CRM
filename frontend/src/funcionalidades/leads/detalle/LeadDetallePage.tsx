import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { getErrorMessage } from "@/api/httpClient";
import { useAuth } from "@/funcionalidades/autenticacion/AuthContext";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import type { EtapaLead } from "@/tipos/lead";
import { ETAPA_ETIQUETAS } from "../catalogos";
import { AccionesResponsable } from "./AccionesResponsable";
import { CierreNoVentaForm } from "./CierreNoVentaForm";
import { CierreVentaForm } from "./CierreVentaForm";
import { isEtapaCalificable } from "./formulariosEtapa";
import { FormularioEtapaLead } from "./FormularioEtapaLead";
import { LeadDatosContacto } from "./LeadDatosContacto";
import { LeadDetalleEncabezado } from "./LeadDetalleEncabezado";
import { LeadOrigenInfo } from "./LeadOrigenInfo";
import { PanelCitas } from "./PanelCitas";
import { useLeadDetalle } from "./useLeadDetalle";

const TODAS_LAS_ETAPAS: EtapaLead[] = ["NUEVO", "CONTACTADO", "CITA", "VENTA", "NO_VENTA"];

/**
 * Detalle del lead (F4, docs/07-modulos-frontend.md). Muestra el **estado
 * actual** con su formulario, no un timeline de interacciones. Mock hasta
 * que exista el backend real -- ver `leadDetalle.api.ts` para los puntos de
 * integración pendientes (M6/M7).
 */
export function LeadDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: lead, isLoading, isError, error, refetch } = useLeadDetalle(id ?? "");

  const [etapaObjetivo, setEtapaObjetivo] = useState<EtapaLead | null>(null);

  // El selector de etapa arranca sincronizado con la etapa vigente; si el
  // envío de un formulario cambia la etapa del lead, se resincroniza para no
  // dejar seleccionada una etapa que ya no corresponde al estado real.
  useEffect(() => {
    if (lead) setEtapaObjetivo(lead.etapa);
  }, [lead?.etapa]);

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

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Cambiar etapa</span>
          <Select
            value={etapaObjetivo ?? lead.etapa}
            onValueChange={(valor) => setEtapaObjetivo(valor as EtapaLead)}
          >
            <SelectTrigger className="w-56" aria-label="Etapa a registrar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TODAS_LAS_ETAPAS.map((etapa) => (
                <SelectItem key={etapa} value={etapa}>
                  {ETAPA_ETIQUETAS[etapa]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Cambiar de etapa se confirma enviando el formulario correspondiente -- no hay un cambio de
            etapa sin formulario.
          </p>
        </div>

        {etapaObjetivo && isEtapaCalificable(etapaObjetivo) ? (
          <FormularioEtapaLead leadId={lead.id} etapa={etapaObjetivo} />
        ) : etapaObjetivo === "VENTA" ? (
          <CierreVentaForm leadId={lead.id} />
        ) : etapaObjetivo === "NO_VENTA" ? (
          <CierreNoVentaForm leadId={lead.id} />
        ) : null}
      </section>

      <PanelCitas leadId={lead.id} usuarioId={user.id} />
    </div>
  );
}
