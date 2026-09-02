import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";

/**
 * Independiente de `TOUR_COMPLETED_KEY_PREFIX` (`LeadsNavigationTutorial.tsx`,
 * "crm.leads-navigation-tour.completed.<userId>"): ese flag legado gateaba el
 * auto-inicio silencioso del tour (una sola vez por usuario). Este modal de
 * entrada reemplaza ese comportamiento -- reaparece en cada visita a /leads
 * hasta que el usuario tilda explícitamente "No volver a mostrar este aviso".
 */
const MODAL_DISMISSED_KEY_PREFIX = "crm.leads-navigation-tour.modal-dismissed.";

/**
 * Bug real reportado: terminar o saltar el tour navega de vuelta a /leads
 * (`finishTour()`), lo que desmonta y remonta `LeadsPage` -- y con eso, el
 * `useState` de este hook se recalcula desde cero. Sin este flag, el modal
 * reaparecía en el acto apenas se terminaba de recorrer, dentro de la MISMA
 * sesión, porque nunca se tildó "no volver a mostrar" (ese es un flag
 * PERMANENTE, a propósito, distinto de este). `sessionStorage` (no
 * `localStorage`): dura lo que dura la pestaña/sesión del navegador, que es
 * exactamente "hasta la próxima sesión" pedido por el usuario -- una sesión
 * nueva (pestaña nueva, navegador reabierto) sí vuelve a ver el modal si
 * nunca tildó el flag permanente.
 */
const SESSION_FINISHED_KEY = "crm.leads-navigation-tour.session-finished";

/** Llamado desde `LeadsNavigationTutorial.tsx::finishTour()` al terminar o saltar el tour. */
export function marcarTutorialFinalizadoEnSesion() {
  sessionStorage.setItem(SESSION_FINISHED_KEY, "true");
}

function sesionYaFinalizoTutorial(): boolean {
  return sessionStorage.getItem(SESSION_FINISHED_KEY) === "true";
}

export interface UseTutorialEntryModalResult {
  /** `true` en cuanto hay usuario autenticado y esa key no está en localStorage. */
  mostrarModal: boolean;
  /** Persiste la key en localStorage y oculta el modal de inmediato. */
  marcarNoMostrar: () => void;
  /** Oculta el modal SIN persistir nada -- reaparece en la próxima visita a /leads. */
  cerrar: () => void;
}

function calcularMostrarModal(dismissedKey: string | null): boolean {
  if (!dismissedKey) return false;
  if (sesionYaFinalizoTutorial()) return false;
  return !localStorage.getItem(dismissedKey);
}

/**
 * Persistencia del modal de entrada del tutorial guiado de Leads (F3). Ver
 * `TutorialEntryDialog.tsx` para el componente que lo consume.
 */
export function useTutorialEntryModal(): UseTutorialEntryModalResult {
  const { user } = useAuth();
  const dismissedKey = user ? `${MODAL_DISMISSED_KEY_PREFIX}${user.id}` : null;

  const [mostrarModal, setMostrarModal] = useState(() => calcularMostrarModal(dismissedKey));

  // Recalcula si cambia el usuario (mismo criterio que `completedKey` en
  // `LeadsNavigationTutorial.tsx`) -- p.ej. login/logout sin recargar la app.
  useEffect(() => {
    setMostrarModal(calcularMostrarModal(dismissedKey));
  }, [dismissedKey]);

  const marcarNoMostrar = useCallback(() => {
    if (dismissedKey) {
      localStorage.setItem(dismissedKey, "true");
    }
    setMostrarModal(false);
  }, [dismissedKey]);

  const cerrar = useCallback(() => {
    setMostrarModal(false);
  }, []);

  return { mostrarModal, marcarNoMostrar, cerrar };
}
