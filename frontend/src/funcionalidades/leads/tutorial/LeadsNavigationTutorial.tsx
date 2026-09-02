import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData, type Step } from "react-joyride";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { CONFIGURACION_EMPRESA_DEFAULT } from "@/funcionalidades/configuracion-empresa/configuracion-empresa.api";
import { TourClickHint } from "./TourClickHint";
import { marcarTutorialFinalizadoEnSesion } from "./useTutorialEntryModal";

type TutorialTransitionAction = { action: "open-workspace" | "close-workspace" | "select-tab"; tab?: string };

interface LeadsNavigationTutorialContextValue {
  startTour: (leadId: string) => void;
  startTourIfNeeded: (leadId: string) => void;
  /** Solo lectura: `true` mientras Joyride está corriendo (ver `run` en el provider). */
  tourActivo: boolean;
}

const LEADS_NAVIGATION_TUTORIAL_DISABLED: LeadsNavigationTutorialContextValue = {
  startTour: () => undefined,
  startTourIfNeeded: () => undefined,
  tourActivo: false,
};

const LeadsNavigationTutorialContext = createContext<LeadsNavigationTutorialContextValue>(LEADS_NAVIGATION_TUTORIAL_DISABLED);

const TOUR_COMPLETED_KEY_PREFIX = "crm.leads-navigation-tour.completed.";
const APP_SCROLL_CONTAINER_SELECTOR = '[data-tour="app-scroll-container"]';
export const LEADS_TOUR_READY_EVENT = "leads-navigation-tour-ready";

type TutorialReadyTarget =
  | "list"
  | "detail"
  | "workspace"
  | "workspace-progreso"
  | "workspace-cita"
  | "workspace-cierre"
  | "workspace-oportunidad";

/**
 * Dispara el evento que le avisa al provider que un target del tour ya
 * existe en el DOM y puede recibir el siguiente `stepIndex` (ver
 * `queuePendingTransition`/`LEADS_TOUR_READY_EVENT` más abajo). Exportado
 * para que cualquier página que participe del tour (`LeadsPage.tsx`,
 * `LeadDetallePage.tsx`) lo use sin reimplementar el mismo `CustomEvent` a
 * mano -- evita que el nombre del evento quede duplicado como string suelto
 * en más de un archivo.
 */
export function dispatchTutorialReady(target: TutorialReadyTarget, selector: string) {
  if (typeof document === "undefined") return;
  if (!document.querySelector(selector)) return;
  window.dispatchEvent(new CustomEvent(LEADS_TOUR_READY_EVENT, { detail: { target } }));
}

interface PendingStepTransition {
  stepIndex: number;
  waitFor: TutorialReadyTarget;
  command?: TutorialTransitionAction;
}

function getAppScrollContainer(): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>(APP_SCROLL_CONTAINER_SELECTOR);
}

function alignStepTarget(selector: string, block: ScrollLogicalPosition = "start") {
  if (typeof document === "undefined") return;
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  const scrollContainer = getAppScrollContainer();
  if (!scrollContainer || !scrollContainer.contains(target)) {
    target.scrollIntoView({ block, inline: "nearest" });
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const spacingTop = block === "center" ? (scrollContainer.clientHeight - targetRect.height) / 2 : 88;
  const nextTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - Math.max(24, spacingTop);
  scrollContainer.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" });
}

function buildStepContent(lines: string[]): ReactNode {
  return (
    <ul className="space-y-2 text-sm text-foreground">
      {lines.map((line) => (
        <li key={line} className="leading-relaxed text-left">
          {line}
        </li>
      ))}
    </ul>
  );
}

export const LEADS_NAVIGATION_TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="leads-search"]',
    title: "Busca oportunidades",
    content: "Encuentra leads por nombre, teléfono o correo sin perder el contexto de tu cartera.",
    placement: "bottom",
    before: async () => alignStepTarget('[data-tour="leads-search"]', "start"),
  },
  {
    target: '[data-tour="leads-filters"]',
    title: "Combina filtros",
    content: "Acota la lista por etapa, prioridad, red social, responsable o estado de SLA.",
    placement: "bottom-end",
    before: async () => alignStepTarget('[data-tour="leads-filters"]', "start"),
  },
  {
    target: '[data-tour="leads-table-columns"]',
    title: "Lee las columnas de la lista",
    content: buildStepContent([
      "Cliente abre el detalle; Teléfono te da el contacto directo.",
      "Etapa muestra el avance; Semáforo, la prioridad; Estado de SLA, el tiempo de respuesta; y Fecha de ingreso, cuándo llegó al CRM.",
      "Si tu rol lo permite también vas a ver la casilla de selección y la columna Responsable. Si no aparecen, no son parte de tu flujo.",
    ]),
    placement: "bottom-start",
    skipScroll: false,
    scrollOffset: 112,
    targetWaitTimeout: 2000,
    before: async () => alignStepTarget('[data-tour="leads-table-columns"]', "start"),
  },
  {
    target: '[data-tour="leads-table-row"]',
    title: "Abre un lead para trabajarlo",
    content: "Cada fila es una oportunidad. Haz clic en el nombre del cliente para ver su información y registrar las acciones comerciales.",
    placement: "bottom",
    skipScroll: false,
    scrollOffset: 112,
    before: async () => alignStepTarget('[data-tour="leads-table-row"]', "center"),
  },
  {
    target: '[data-tour="lead-header"]',
    title: "Ubicate antes de actuar",
    content: buildStepContent([
      "El nombre te confirma a quién atiendes.",
      "El semáforo marca la prioridad comercial y el reloj de SLA cuánto tiempo queda para actuar.",
      "También ves la etapa actual y el responsable del lead antes de tomar cualquier acción.",
    ]),
    placement: "bottom",
    skipScroll: false,
    scrollOffset: 96,
    targetWaitTimeout: 2000,
    before: async () => alignStepTarget('[data-tour="lead-header"]', "start"),
  },
  {
    target: '[data-tour="lead-contact-origin-cards"]',
    title: "Confirma datos y origen",
    content: buildStepContent([
      "En Datos de contacto revisas el teléfono; si aparece la marca de inválido, frena el contacto y corrígelo.",
      "Acá también ves si el lead tiene correo o si quedó sin email registrado.",
      "En Origen confirmas red social, campaña, cuenta publicitaria y fecha de ingreso con los datos reales que trajo el lead.",
    ]),
    placement: "bottom",
    skipScroll: false,
    scrollOffset: 96,
    targetWaitTimeout: 2000,
    before: async () => alignStepTarget('[data-tour="lead-contact-origin-cards"]', "start"),
  },
  {
    target: '[data-tour="lead-summary"]',
    title: "Prioriza el siguiente paso",
    content: "El resumen ejecutivo transforma los datos en una guía: qué hacer ahora, cuánto tiempo lleva el lead en CRM, su avance y su calificación.",
    placement: "bottom",
    skipScroll: false,
    scrollOffset: 96,
    targetWaitTimeout: 2000,
    before: async () => alignStepTarget('[data-tour="lead-summary"]', "start"),
  },
  {
    target: '[data-tour="lead-whatsapp"]',
    title: "Abre el espacio de trabajo",
    content: "Este botón concentra el chat y las acciones operativas del lead para mantener el detalle despejado.",
    placement: "left",
    before: async () => alignStepTarget('[data-tour="lead-whatsapp"]', "center"),
  },
  {
    target: '[data-tour="lead-whatsapp-chat"]',
    title: "WhatsApp dentro del CRM",
    content: buildStepContent([
      "Este panel es el espacio de trabajo para conversaciones y acciones sobre el lead actual.",
      "Usa el contexto del contacto y teléfono del lead para que no pierdas el hilo comercial.",
      "No es una integración externa de WhatsApp: es la vista operativa del CRM para trabajar ese caso.",
    ]),
    placement: "left-start",
    skipScroll: false,
    scrollOffset: 32,
    targetWaitTimeout: 2000,
  },
  {
    target: '[data-tour="lead-workspace-tabs"]',
    title: "Gestiona el lead desde un solo lugar",
    content: "Desde estas pestañas cambias entre progreso, citas y cierre sin salir del contexto del lead.",
    placement: "bottom",
  },
  {
    target: '[data-tour="lead-workspace-progreso"]',
    title: "Actualiza el progreso",
    content: "Responde el formulario de la etapa para calificar el lead y avanzar por el embudo.",
    placement: "bottom",
  },
  {
    target: '[data-tour="lead-workspace-cita"]',
    title: "Agenda el siguiente contacto",
    content: "Registra una cita y su modalidad para que el equipo tenga continuidad comercial.",
    placement: "bottom",
  },
  {
    target: '[data-tour="lead-workspace-cierre"]',
    title: "Cierra cuando corresponda",
    content: "Registra una venta o un cierre sin venta solo después de confirmar el resultado con el cliente.",
    placement: "bottom",
  },
  {
    target: '[data-tour="lead-workspace-oportunidad"]',
    title: "Consulta o inicia una oportunidad",
    content: "Desde aquí ves las oportunidades ya registradas para este lead y puedes iniciar una nueva sin salir del espacio de trabajo.",
    placement: "bottom",
  },
];

function dispatchLeadTourEvent(detail: TutorialTransitionAction) {
  window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail }));
}

/**
 * Pasos cuyo target de Joyride es un control real que, sin
 * `options.blockTargetInteraction`, se podía clickear de verdad (fila del
 * lead mock, botón de espacio de trabajo, pestañas del workspace) -- ahora
 * ese clic queda bloqueado (ver `options` del `<Joyride>` más abajo), así que
 * estos pasos muestran `TourClickHint` como pista puramente decorativa de
 * "acá harías clic en el uso real". El resto de los pasos son de solo lectura
 * o ya no tienen un control real bajo el spotlight.
 */
const PASOS_CON_HINT_DE_CLIC = new Set([
  '[data-tour="leads-table-row"]',
  '[data-tour="lead-whatsapp"]',
  '[data-tour="lead-workspace-tabs"]',
]);

interface LeadsNavigationTutorialProviderProps {
  children: ReactNode;
  /**
   * Color de marca (hex) para el botón "Siguiente" de Joyride y sus estados
   * hover/focus -- `options.primaryColor` es el único valor del que Joyride
   * los deriva automáticamente. Lo resuelve `AppLayout.tsx` (único ancestro
   * de este provider) vía `resolveMarcaCompleta` (`lib/color-marca.ts`,
   * `--marca-color-2`), la misma fuente que ya usa el splash de bienvenida
   * -- se recibe como prop en vez de que este componente resuelva la marca
   * de cero, para no duplicar la jerarquía de 3 niveles (empresa propia ->
   * holding en vivo -> default) ya centralizada ahí. Sin prop (ej. tests que
   * montan el provider aislado), cae al azul de fábrica del CRM.
   */
  colorAcento?: string;
}

export function LeadsNavigationTutorialProvider({ children, colorAcento }: LeadsNavigationTutorialProviderProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<PendingStepTransition | null>(null);
  const pendingTransitionRef = useRef<PendingStepTransition | null>(null);

  const completedKey = user ? `${TOUR_COMPLETED_KEY_PREFIX}${user.id}` : null;

  function queuePendingTransition(nextTransition: PendingStepTransition | null) {
    pendingTransitionRef.current = nextTransition;
    setPendingTransition(nextTransition);
  }

  useEffect(() => {
    function handleReady(event: Event) {
      const detail = (event as CustomEvent<{ target?: TutorialReadyTarget }>).detail;
      const activeTransition = pendingTransitionRef.current;
      if (!activeTransition || !detail?.target) return;
      if (detail.target !== activeTransition.waitFor) return;
      setStepIndex(activeTransition.stepIndex);
      queuePendingTransition(null);
    }

    window.addEventListener(LEADS_TOUR_READY_EVENT, handleReady);
    return () => window.removeEventListener(LEADS_TOUR_READY_EVENT, handleReady);
  }, []);

  useEffect(() => {
    if (!pendingTransition?.command) return;
    dispatchLeadTourEvent(pendingTransition.command);
    queuePendingTransition(
      pendingTransition.command
        ? {
            ...pendingTransition,
            command: undefined,
          }
        : pendingTransition,
    );
  }, [pendingTransition]);

  function startTour(nextLeadId: string) {
    setLeadId(nextLeadId);
    queuePendingTransition(null);
    setStepIndex(0);
    setRun(true);
    if (location.pathname !== "/leads") {
      navigate("/leads");
    }
  }

  function startTourIfNeeded(nextLeadId: string) {
    if (!completedKey || localStorage.getItem(completedKey)) return;
    startTour(nextLeadId);
  }

  function finishTour() {
    if (completedKey) {
      localStorage.setItem(completedKey, "true");
    }
    marcarTutorialFinalizadoEnSesion();
    setRun(false);
    setLeadId(null);
    queuePendingTransition(null);
    navigate("/leads");
    toast.success("Tutorial finalizado", {
      description: "Puedes volver a verlo cuando quieras desde el botón \"Ver tutorial\", junto al título de Leads.",
    });
  }

  function handleTourEvent(data: EventData) {
    const { action, index, status, type } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      finishTour();
      return;
    }

    if (type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
      return;
    }

    if (type !== EVENTS.STEP_AFTER) return;

    const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
    if (action === ACTIONS.PREV) {
      // Reversas simétricas de los side-effects disparados al avanzar (ver
      // ramas de ACTIONS.NEXT más abajo): cerrar el chat, volver a /leads y
      // reseleccionar la pestaña anterior, replicando el mismo mecanismo de
      // CustomEvent ("leads-navigation-tour") que usan open-workspace y
      // select-tab. Sin esto el tutorial queda en un estado visual roto al
      // retroceder (chat abierto, ruta o pestaña desincronizada del paso).
      if (index === 8) {
        dispatchLeadTourEvent({ action: "close-workspace" });
        setStepIndex(nextIndex);
        return;
      }
      if (index === 4) {
        // Simétrico al avance 3->4 (más abajo, `waitFor: "detail"`): sin
        // esperar a que la tabla de leads vuelva a existir en el DOM tras la
        // navegación real a /leads, Joyride intentaba apuntar
        // `[data-tour="leads-table-row"]` antes de que React terminara de
        // renderizarla (bug real reportado: "Regresar" rompía el tutorial).
        queuePendingTransition({ stepIndex: nextIndex, waitFor: "list" });
        navigate("/leads");
        return;
      }
      if (index === 11) {
        queuePendingTransition({
          stepIndex: nextIndex,
          waitFor: "workspace-progreso",
          command: { action: "select-tab", tab: "progreso" },
        });
        return;
      }
      if (index === 12) {
        queuePendingTransition({
          stepIndex: nextIndex,
          waitFor: "workspace-cita",
          command: { action: "select-tab", tab: "cita" },
        });
        return;
      }
      if (index === 13) {
        queuePendingTransition({
          stepIndex: nextIndex,
          waitFor: "workspace-cierre",
          command: { action: "select-tab", tab: "cierre" },
        });
        return;
      }
      setStepIndex(nextIndex);
      return;
    }

    if (index === 3 && leadId) {
      queuePendingTransition({ stepIndex: nextIndex, waitFor: "detail" });
      navigate(`/leads/${leadId}`);
      return;
    }

    if (index === 7) {
      queuePendingTransition({
        stepIndex: nextIndex,
        waitFor: "workspace",
        command: { action: "open-workspace" },
      });
      return;
    }
    if (index === 10) {
      queuePendingTransition({
        stepIndex: nextIndex,
        waitFor: "workspace-cita",
        command: { action: "select-tab", tab: "cita" },
      });
      return;
    }
    if (index === 11) {
      queuePendingTransition({
        stepIndex: nextIndex,
        waitFor: "workspace-cierre",
        command: { action: "select-tab", tab: "cierre" },
      });
      return;
    }
    if (index === 12) {
      queuePendingTransition({
        stepIndex: nextIndex,
        waitFor: "workspace-oportunidad",
        command: { action: "select-tab", tab: "oportunidad" },
      });
      return;
    }

    setStepIndex(nextIndex);
  }

  return (
    <LeadsNavigationTutorialContext.Provider value={{ startTour, startTourIfNeeded, tourActivo: run }}>
      {children}
      <Joyride
        continuous
        run={run}
        stepIndex={stepIndex}
        steps={LEADS_NAVIGATION_TOUR_STEPS}
        onEvent={handleTourEvent}
        options={{
          buttons: ["back", "close", "primary", "skip"],
          primaryColor: colorAcento ?? CONFIGURACION_EMPRESA_DEFAULT.colorSecundario,
          showProgress: true,
          skipBeacon: true,
          skipScroll: false,
          scrollOffset: 96,
          offset: 18,
          spotlightRadius: 8,
          textColor: "#18181B",
          zIndex: 60,
          /**
           * Sin esto (default `false`), el elemento resaltado por el
           * spotlight queda 100% clickeable de verdad -- el overlay solo
           * bloquea el resto de la pantalla. Eso permitía clics reales fuera
           * de `handleTourEvent` (fila del lead mock, botón de espacio de
           * trabajo, pestañas del workspace, botón real "Ir a Bridges") que
           * desincronizaban `stepIndex` del estado real de la página.
           */
          blockTargetInteraction: true,
        }}
        locale={{
          back: "Atrás",
          close: "Cerrar",
          last: "Finalizar",
          next: "Siguiente",
          nextWithProgress: "Siguiente ({current}/{total})",
          skip: "Saltar tutorial",
        }}
        styles={{
          tooltip: { borderRadius: 8, padding: 20 },
          tooltipTitle: { fontSize: 16, fontWeight: 600 },
          tooltipContent: { fontSize: 14, lineHeight: 1.5 },
          buttonPrimary: { borderRadius: 8, fontSize: 13, fontWeight: 600 },
          buttonBack: { color: "#52525B", fontSize: 13 },
          buttonSkip: { color: "#52525B", fontSize: 13 },
        }}
      />
      {run && PASOS_CON_HINT_DE_CLIC.has(LEADS_NAVIGATION_TOUR_STEPS[stepIndex]?.target as string) ? (
        <TourClickHint targetSelector={LEADS_NAVIGATION_TOUR_STEPS[stepIndex].target as string} key={stepIndex} />
      ) : null}
    </LeadsNavigationTutorialContext.Provider>
  );
}

export function useLeadsNavigationTutorial() {
  return useContext(LeadsNavigationTutorialContext);
}
