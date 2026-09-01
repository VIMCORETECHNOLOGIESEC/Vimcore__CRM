import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, Check, CircleGauge, Clock3, Handshake, X } from "lucide-react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { getErrorMessage } from "@/api/httpClient";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { NuevaOportunidadButton } from "@/funcionalidades/oportunidades/NuevaOportunidadButton";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { AccionesResponsable } from "./AccionesResponsable";
import { LeadDatosContacto } from "./LeadDatosContacto";
import { LeadDetalleEncabezado } from "./LeadDetalleEncabezado";
import { LeadOrigenInfo } from "./LeadOrigenInfo";
import { LeadTimeline } from "./LeadTimeline";
import { OportunidadesLeadTab } from "./OportunidadesLeadTab";
import { PanelCitas } from "./PanelCitas";
import { CierreNoVentaForm } from "./CierreNoVentaForm";
import { CierreVentaForm } from "./CierreVentaForm";
import { useLeadDetalle } from "./useLeadDetalle";
import { ETAPA_ETIQUETAS } from "../catalogos";
import { ConversacionAbierta } from "@/funcionalidades/whatsapp/ConversacionAbierta";
import { useConversaciones } from "@/funcionalidades/whatsapp/useConversaciones";
import { useWhatsAppEstadoActual } from "@/funcionalidades/whatsapp/useWhatsApp";
import { WhatsAppIcon } from "@/funcionalidades/whatsapp/WhatsAppIcon";
import { WhatsAppSinConexion } from "@/funcionalidades/whatsapp/WhatsAppSinConexion";
import type { Lead, EtapaLead } from "@/tipos/lead";

type VistaDetalle = "progreso" | "cita" | "cierre" | "oportunidad";

const VISTAS: Array<{ id: VistaDetalle; label: string; icon: typeof Check }> = [
  { id: "progreso", label: "Progreso", icon: Check },
  { id: "cita", label: "Agendar cita", icon: CalendarDays },
  { id: "cierre", label: "Cerrar lead", icon: X },
  { id: "oportunidad", label: "Oportunidad", icon: Handshake },
];

const ETAPAS_EMBUDO: EtapaLead[] = ["NUEVO", "CONTACTADO", "CITA", "VENTA", "NO_VENTA"];

function formatFechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function getSiguientePaso(etapa: EtapaLead): { titulo: string; detalle: string } {
  switch (etapa) {
    case "NUEVO":
      return { titulo: "Completar el formulario de contacto", detalle: "Califica este lead para avanzar a Contactado." };
    case "CONTACTADO":
      return { titulo: "Coordinar una cita", detalle: "Registra el próximo contacto para avanzar a Cita." };
    case "CITA":
      return { titulo: "Completar el resultado de la cita", detalle: "Usa el formulario de progreso para registrar lo conversado." };
    case "VENTA":
      return { titulo: "Lead convertido", detalle: "La venta quedó registrada en el embudo." };
    case "NO_VENTA":
      return { titulo: "Lead cerrado", detalle: "Este lead no tiene acciones pendientes." };
  }
}

function ResumenEjecutivo({ lead, puntuacionActual }: { lead: Lead; puntuacionActual: number | null }) {
  const etapaActual = ETAPAS_EMBUDO.indexOf(lead.etapa);
  const siguientePaso = getSiguientePaso(lead.etapa);
  const diasEnCrm = Math.max(0, Math.floor((Date.now() - new Date(lead.ingresadoEn).getTime()) / 86_400_000));
  const puntuacion = puntuacionActual ?? lead.puntuacion;
  const porcentajePuntuacion = puntuacion === null ? 0 : Math.min(100, Math.max(0, puntuacion));

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-background p-4 md:p-5" aria-labelledby="resumen-ejecutivo-titulo">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-marca-texto">Lectura rápida</p>
          <h2 id="resumen-ejecutivo-titulo" className="text-lg font-semibold text-foreground">Resumen ejecutivo</h2>
        </div>
        <span className="text-xs text-muted-foreground">Ingreso: {formatFechaCorta(lead.ingresadoEn)}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex items-start justify-between gap-4 rounded-lg bg-secondary/60 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marca-texto/10 text-marca-texto">
              <CalendarClock className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Siguiente paso</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{siguientePaso.titulo}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{siguientePaso.detalle}</p>
            </div>
          </div>
          <ArrowRight className="mt-1 size-4 shrink-0 text-marca-texto" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Etapa</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{ETAPA_ETIQUETAS[lead.etapa]}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">En CRM</p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-foreground">{diasEnCrm} {diasEnCrm === 1 ? "día" : "días"}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Puntaje</p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-foreground">{puntuacion ?? "—"}<span className="text-xs font-normal text-muted-foreground">/100</span></p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_220px] md:items-center">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-marca-texto/10 text-marca-texto">
                <Clock3 className="size-3.5" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-foreground">Avance del embudo</span>
            </div>
            <span className="text-xs text-muted-foreground">{lead.etapa === "VENTA" || lead.etapa === "NO_VENTA" ? "Etapa final" : `${Math.max(1, etapaActual + 1)} de 3`}</span>
          </div>
          <div className="relative px-2">
            <div className="absolute inset-x-2 top-3 h-0.5 bg-border" aria-hidden="true" />
            <div className="absolute left-2 top-3 h-0.5 bg-primary transition-[width]" style={{ width: `${Math.min(100, (Math.max(0, Math.min(etapaActual, 2)) / 2) * 100)}%` }} aria-hidden="true" />
            <ol className="relative grid grid-cols-3">
              {ETAPAS_EMBUDO.slice(0, 3).map((etapa, indice) => {
                const completada = etapaActual >= indice;
                return (
                  <li key={etapa} className="flex flex-col items-center gap-2 text-center">
                    <span className={`flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${completada ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}>
                      {completada ? <Check className="size-3" aria-hidden="true" /> : indice + 1}
                    </span>
                    <span className={`text-xs ${completada ? "font-medium text-foreground" : "text-muted-foreground"}`}>{ETAPA_ETIQUETAS[etapa]}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <CircleGauge className="size-8 shrink-0 text-marca-texto" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Calificación</span>
              <span className="font-semibold tabular-nums text-foreground">{puntuacion === null ? "Sin calificar" : `${puntuacion}/100`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Puntuación del lead" aria-valuemin={0} aria-valuemax={100} aria-valuenow={puntuacion ?? 0}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${porcentajePuntuacion}%` }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CierreLeadPanel({ leadId, cerrado }: { leadId: string; cerrado: boolean }) {
  const [tipoCierre, setTipoCierre] = useState<"VENTA" | "NO_VENTA" | null>(null);

  if (cerrado) {
    return (
      <section className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background p-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
          <Check className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Lead cerrado</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Este lead ya tiene un resultado final y no se puede volver a abrir.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Resultado del lead</h2>
          <p className="mt-1 text-sm text-muted-foreground">Elige cómo finalizó la oportunidad.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={tipoCierre === "VENTA" ? "secondary" : "success"}
            onClick={() => setTipoCierre((actual) => (actual === "VENTA" ? null : "VENTA"))}
          >
            Cerrar como venta
          </Button>
          <Button
            variant={tipoCierre === "NO_VENTA" ? "secondary" : "destructive"}
            onClick={() => setTipoCierre((actual) => (actual === "NO_VENTA" ? null : "NO_VENTA"))}
          >
            Cerrar como no venta
          </Button>
        </div>
      </section>
      {tipoCierre === "VENTA" ? <CierreVentaForm leadId={leadId} /> : null}
      {tipoCierre === "NO_VENTA" ? <CierreNoVentaForm leadId={leadId} /> : null}
    </div>
  );
}

/**
 * `empresaId` para `useWhatsAppEstadoActual` sigue el MISMO criterio que
 * `ConectarWhatsAppCard.tsx`: solo se manda explícito para un actor
 * holding-wide (`sessionScope === "holding"`, tomado de `useVistaEmpresa()`,
 * el mismo `?empresaId=` que ya resuelve la página); para una sesión
 * `company` se manda `undefined` y el backend lo resuelve del JWT.
 */
function WhatsAppChat({ clienteId }: { clienteId: string }) {
  const { user, hasRole } = useAuth();
  const { empresaVistaId } = useVistaEmpresa();
  const empresaIdWhatsApp = user?.sessionScope === "holding" ? (empresaVistaId ?? undefined) : undefined;
  const estadoWhatsApp = useWhatsAppEstadoActual(empresaIdWhatsApp);
  const { data, isLoading } = useConversaciones({ clienteId, pagina: 1, limite: 10 });

  if (isLoading || estadoWhatsApp.isLoading) {
    return (
      <section
        data-tour="lead-whatsapp-chat"
        className="flex min-h-0 flex-col overflow-hidden h-full rounded-none border-0 border-l border-primary/20 shadow-none"
        aria-label="Chat de WhatsApp"
      >
        <LoadingState rows={5} rowHeight="h-12" className="p-4" />
      </section>
    );
  }

  const conectado = estadoWhatsApp.data?.estado === "ACTIVA";
  const conversacion = data?.conversaciones[0] ?? null;

  return (
    <section
      data-tour="lead-whatsapp-chat"
      className="flex min-h-0 flex-col overflow-hidden h-full rounded-none border-0 border-l border-primary/20 shadow-none"
      aria-label="Chat de WhatsApp"
    >
      {!conectado ? (
        <WhatsAppSinConexion
          puedeIrABridges={hasRole(["ADMINISTRADOR"])}
          empresaVistaId={empresaVistaId}
        />
      ) : conversacion ? (
        <ConversacionAbierta conversacionId={conversacion.id} encabezado={conversacion} />
      ) : (
        <EmptyState
          title="Todavía no hay conversación"
          description="Este cliente todavía no escribió por WhatsApp."
          className="m-4"
        />
      )}
    </section>
  );
}

/**
 * Detalle del lead (F4, docs/07-modulos-frontend.md). Muestra el **estado
 * actual** con su formulario, no un timeline de interacciones libres --
 * `LeadTimeline` (docs/02 §6) sí visualiza el progreso como línea de tiempo,
 * pero solo permite avanzar linealmente, nunca retroceder. Mock hasta que
 * exista el backend real -- ver `leadDetalle.api.ts` para los puntos de
 * integración pendientes (M6/M7).
 */
function dispatchTutorialReady(target: "detail" | "workspace" | `workspace-${VistaDetalle}`, selector: string) {
  if (typeof document === "undefined") return;
  if (!document.querySelector(selector)) return;
  window.dispatchEvent(new CustomEvent("leads-navigation-tour-ready", { detail: { target } }));
}

export function LeadDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { empresaVistaId, esVistaSoloLectura } = useVistaEmpresa();
  const [vistaActiva, setVistaActiva] = useState<VistaDetalle>("progreso");
  const [chatAbierto, setChatAbierto] = useState(false);
  const [puntuacionActual, setPuntuacionActual] = useState<number | null>(null);
  const {
    data: lead,
    isLoading,
    isError,
    error,
    refetch,
  } = useLeadDetalle(id ?? "", empresaVistaId ?? undefined);

  useEffect(() => {
    function handleTutorialEvent(event: Event) {
      const detail = (
        event as CustomEvent<{ action: "open-workspace" | "close-workspace" | "select-tab"; tab?: VistaDetalle }>
      ).detail;
      if (detail.action === "open-workspace") {
        setChatAbierto(true);
      }
      if (detail.action === "close-workspace") {
        setChatAbierto(false);
      }
      if (detail.action === "select-tab" && detail.tab) {
        setChatAbierto(true);
        setVistaActiva(detail.tab);
      }
    }

    window.addEventListener("leads-navigation-tour", handleTutorialEvent);
    return () => window.removeEventListener("leads-navigation-tour", handleTutorialEvent);
  }, []);

  useEffect(() => {
    if (lead) {
      dispatchTutorialReady("detail", '[data-tour="lead-header"]');
    }
  }, [lead]);

  useEffect(() => {
    if (!chatAbierto) return;
    dispatchTutorialReady("workspace", '[data-tour="lead-whatsapp-chat"]');
  }, [chatAbierto]);

  useEffect(() => {
    if (!chatAbierto) return;
    dispatchTutorialReady(`workspace-${vistaActiva}`, `[data-tour="lead-workspace-${vistaActiva}"]`);
  }, [chatAbierto, vistaActiva]);

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
    return <EmptyState title="Sesión no disponible" description="Inicia sesión nuevamente." />;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div data-tour="lead-header">
          <LeadDetalleEncabezado lead={lead} />
        </div>
        <div data-tour="lead-information">
          <div data-tour="lead-contact-origin-cards" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LeadDatosContacto cliente={lead.cliente} />
            <LeadOrigenInfo lead={lead} />
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {/*
             * Reasignación/traspaso es una acción de escritura: un
             * holding-wide en "Ver en vivo" de una empresa
             * (`useVistaEmpresa().esVistaSoloLectura`) puede navegar el
             * detalle pero no reasignar (no soportado en esta versión de
             * despliegue). El gate vive acá, no dentro de
             * `AccionesResponsable` (que no llama `useVistaEmpresa()` para
             * no exigir Router en sus propios tests).
             */}
            {esVistaSoloLectura ? null : <AccionesResponsable lead={lead} user={user} />}
            <NuevaOportunidadButton leadId={lead.id} />
          </div>
        </div>
        <div data-tour="lead-summary">
          <ResumenEjecutivo lead={lead} puntuacionActual={puntuacionActual} />
        </div>
      </div>
      {chatAbierto ? (
        <div className="modo-idec fixed inset-0 z-40 flex flex-col overflow-hidden bg-background md:left-[--sidebar-width]">
          <div className="flex shrink-0 items-center gap-3 p-3 md:p-4 md:pl-5">
            {/*
             * Navbar flotante (solo en la vista de chat): la información del
             * lead vive en una tarjeta elevada con halo azul IDEC, separada
             * del botón de cierre, en vez de pegada al borde superior.
             */}
            <div className="min-w-0 flex-1 rounded-2xl border border-border bg-background shadow-[0_10px_26px_-16px_rgb(var(--primary)/0.35)]">
              <LeadDetalleEncabezado
                lead={lead}
                sinBorde
                mostrarEtapa={false}
              />
            </div>
            <button
              type="button"
              onClick={() => setChatAbierto(false)}
              aria-label="Cerrar vista de WhatsApp"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-marca-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background" aria-label="Módulos del lead">
              <nav className="grid h-14 shrink-0 grid-cols-4 border-b border-border bg-background" data-tour="lead-workspace-tabs" aria-label="Secciones del lead" role="tablist">
                {VISTAS.map(({ id: vista, label, icon: Icon }) => {
                  const activa = vistaActiva === vista;
                  return (
                    <button
                      key={vista}
                      type="button"
                      role="tab"
                      data-tour={`lead-workspace-${vista}`}
                      aria-selected={activa}
                      onClick={() => setVistaActiva(vista)}
                      className={`group relative flex h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 px-2 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 ${activa ? "text-marca-texto" : "text-muted-foreground"}`}
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{label}</span>
                      </span>
                      <span className={`absolute inset-x-0 bottom-0 h-1 ${activa ? "bg-primary" : "bg-transparent"}`} aria-hidden="true" />
                    </button>
                  );
                })}
              </nav>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                {vistaActiva === "progreso" ? (
                  <LeadTimeline
                    lead={lead}
                    mostrarCierre={false}
                    onPuntuacionChange={setPuntuacionActual}
                  />
                ) : null}
                {vistaActiva === "cita" ? <PanelCitas leadId={lead.id} usuarioId={user.id} /> : null}
                {vistaActiva === "cierre" ? <CierreLeadPanel leadId={lead.id} cerrado={Boolean(lead.cerradoEn)} /> : null}
                {vistaActiva === "oportunidad" ? <OportunidadesLeadTab leadId={lead.id} /> : null}
              </div>
            </section>
            <div className="min-h-0 min-w-0">
              <WhatsAppChat clienteId={lead.cliente.id} />
            </div>
          </div>
        </div>
      ) : null}
      {!chatAbierto ? (
        <button
          type="button"
          onClick={() => setChatAbierto(true)}
          data-tour="lead-whatsapp"
          aria-label="Abrir chat de WhatsApp"
          title="Abrir chat de WhatsApp"
          className="fixed bottom-6 right-6 z-30 flex size-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_28px_-8px_rgb(var(--primary)/0.55)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 active:scale-95"
        >
          <WhatsAppIcon />
        </button>
      ) : null}
    </>
  );
}
