import { useState } from "react";
import { CalendarDays, Check, Send, X } from "lucide-react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
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
import { CierreNoVentaForm } from "./CierreNoVentaForm";
import { CierreVentaForm } from "./CierreVentaForm";
import { useLeadDetalle } from "./useLeadDetalle";

type VistaDetalle = "progreso" | "cita" | "cierre";

const VISTAS: Array<{ id: VistaDetalle; label: string; icon: typeof Check }> = [
  { id: "progreso", label: "Progreso", icon: Check },
  { id: "cita", label: "Agendar cita", icon: CalendarDays },
  { id: "cierre", label: "Cerrar lead", icon: X },
];

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 fill-current" aria-hidden="true">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.53 0 .2 5.33.2 11.88c0 2.1.55 4.15 1.6 5.96L.1 23.8l6.1-1.6a11.87 11.87 0 0 0 5.87 1.54h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.18-1.24-6.16-3.44-8.38Zm-8.44 18.2h-.01a9.85 9.85 0 0 1-5.03-1.38l-.36-.21-3.62.95.97-3.53-.23-.36a9.86 9.86 0 0 1-1.5-5.27C2.3 6.43 6.69 2.04 12.09 2.04a9.8 9.8 0 0 1 6.98 2.9 9.83 9.83 0 0 1 2.89 6.99c0 5.4-4.4 9.8-9.88 9.8Zm5.38-7.35c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.28-.47-2.44-1.5a9.16 9.16 0 0 1-1.69-2.1c-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.31 1.27.5 1.7.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
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
          <p className="mt-1 text-sm text-muted-foreground">Elegí cómo finalizó la oportunidad.</p>
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

function WhatsAppChat({
  leadName,
  onClose,
  expanded = false,
}: {
  leadName: string;
  onClose: () => void;
  expanded?: boolean;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden border-border bg-background ${
        expanded ? "h-full rounded-none border-0 border-l border-idec/20 shadow-none" : "h-[min(680px,calc(100vh-15rem))] min-h-[520px] rounded-lg border shadow-sm"
      }`}
      aria-label="Chat de WhatsApp"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-idec/20 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-idec text-sm font-semibold text-idec-foreground">
            {leadName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{leadName}</h2>
            <p className="text-xs text-muted-foreground">WhatsApp</p>
          </div>
        </div>
        {!expanded ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar chat de WhatsApp"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-[#fafafa] p-4">
        <p className="mx-auto rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground">Hoy</p>
        <div className="flex items-end gap-2">
          <span className="size-6 shrink-0 rounded-full bg-secondary" aria-hidden="true" />
          <p className="max-w-[82%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-foreground shadow-sm">
            Hola, ¿cómo estás? Vi que pediste información.
            <span className="mt-1 block text-right text-[10px] text-muted-foreground">10:42</span>
          </p>
        </div>
        <div className="flex items-end justify-end gap-2">
          <p className="max-w-[82%] rounded-2xl rounded-br-sm bg-idec/10 px-3 py-2 text-sm text-foreground">
            Hola, sí. Me gustaría conocer más detalles.
            <span className="mt-1 block text-right text-[10px] text-muted-foreground">10:44</span>
          </p>
        </div>
        <div className="flex items-end gap-2">
          <span className="size-6 shrink-0 rounded-full bg-secondary" aria-hidden="true" />
          <p className="max-w-[82%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-foreground shadow-sm">
            Perfecto. Puedo ayudarte a coordinar una llamada cuando te quede cómodo.
            <span className="mt-1 block text-right text-[10px] text-muted-foreground">10:45</span>
          </p>
        </div>
      </div>

      <form className="flex items-center gap-2 border-t border-border bg-background p-3" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="mensaje-whatsapp" className="sr-only">Escribir mensaje</label>
        <input
          id="mensaje-whatsapp"
          type="text"
          placeholder="Escribí un mensaje..."
          className="h-10 min-w-0 flex-1 rounded-md border border-idec/40 bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-idec/50"
        />
        <button
          type="submit"
          aria-label="Enviar mensaje"
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md bg-idec text-idec-foreground transition-colors hover:bg-idec/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-idec/50"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </form>
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
export function LeadDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [vistaActiva, setVistaActiva] = useState<VistaDetalle>("progreso");
  const [chatAbierto, setChatAbierto] = useState(false);
  const [puntuacionActual, setPuntuacionActual] = useState<number | null>(null);
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
    <>
      <div className="flex flex-col gap-4">
        <LeadDetalleEncabezado
          lead={lead}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LeadDatosContacto cliente={lead.cliente} />
          <LeadOrigenInfo lead={lead} />
        </div>
        <AccionesResponsable lead={lead} user={user} />
        <LeadTimeline
          lead={lead}
          puntuacionActual={puntuacionActual ?? lead.puntuacion}
          onPuntuacionChange={setPuntuacionActual}
        />
        <PanelCitas leadId={lead.id} usuarioId={user.id} />
      </div>
      {chatAbierto ? (
        <div className="modo-idec fixed inset-0 z-40 flex flex-col overflow-hidden bg-background md:left-60">
          <div className="flex shrink-0 items-center gap-3 p-3 md:p-4 md:pl-5">
            {/*
             * Navbar flotante (solo en la vista de chat): la información del
             * lead vive en una tarjeta elevada con halo azul IDEC, separada
             * del botón de cierre, en vez de pegada al borde superior.
             */}
            <div className="min-w-0 flex-1 rounded-2xl border border-border bg-background shadow-[0_10px_26px_-16px_rgb(var(--idec)/0.35)]">
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
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-idec/40 hover:text-idec focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-idec/50"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background" aria-label="Módulos del lead">
            <nav className="grid h-14 shrink-0 grid-cols-3 border-b border-border bg-background" aria-label="Secciones del lead" role="tablist">
              {VISTAS.map(({ id: vista, label, icon: Icon }) => {
                const activa = vistaActiva === vista;
                return (
                  <button
                    key={vista}
                    type="button"
                    role="tab"
                    aria-selected={activa}
                    onClick={() => setVistaActiva(vista)}
                    className={`group relative flex h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 px-2 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-idec/50 ${activa ? "text-idec" : "text-muted-foreground"}`}
                  >
                    <span className="inline-flex items-center gap-2 truncate">
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{label}</span>
                    </span>
                    <span className={`absolute inset-x-0 bottom-0 h-1 ${activa ? "bg-idec" : "bg-transparent"}`} aria-hidden="true" />
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
            </div>
          </section>
          <WhatsAppChat leadName={lead.cliente.nombre} onClose={() => setChatAbierto(false)} expanded />
          </div>
        </div>
      ) : null}
      {!chatAbierto ? (
        <button
          type="button"
          onClick={() => setChatAbierto(true)}
          aria-label="Abrir chat de WhatsApp"
          title="Abrir chat de WhatsApp"
          className="fixed bottom-6 right-6 z-30 flex size-14 cursor-pointer items-center justify-center rounded-full bg-idec text-idec-foreground shadow-[0_12px_28px_-8px_rgb(var(--idec)/0.55)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-idec/50 focus-visible:ring-offset-2 active:scale-95"
        >
          <WhatsAppIcon />
        </button>
      ) : null}
    </>
  );
}
