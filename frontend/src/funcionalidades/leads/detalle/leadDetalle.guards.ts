import type { AuthenticatedUser } from "@/tipos/usuario";
import type { Lead } from "@/tipos/lead";
import { ETAPAS_TERMINALES } from "../etapas";

/**
 * Guards de UX para traspaso (`handoff`) y reasignación (`reassign`) de un
 * lead (docs/02-reglas-negocio.md §5). **Esto solo controla qué ve/puede
 * pulsar el usuario en la pantalla** -- la validación real de negocio es
 * responsabilidad del backend (M6/M7, todavía no implementado) cuando
 * reciba la petición; un usuario que manipule la petición HTTP directamente
 * podría saltarse estos guards, y el backend debe rechazarla igual. Cubierto
 * con tests (`tests/leads/detalle/leadDetalle.guards.test.ts`) por ser
 * lógica de reglas de negocio, aunque solo gobierne la UI.
 */

function esEtapaTerminal(etapa: Lead["etapa"]): boolean {
  return ETAPAS_TERMINALES.includes(etapa);
}

/**
 * Traspaso a vendedor: habilitado desde CONTACTADO en adelante (deshabilitado
 * en NUEVO), nunca en una etapa terminal. El asesor solo puede traspasar sus
 * propios leads; administrador y supervisor pueden traspasar cualquiera.
 * Vendedor nunca traspasa (no hay a quién traspasarle desde su rol).
 */
export function canHandoffToVendedor(lead: Lead, user: AuthenticatedUser): boolean {
  if (lead.etapa === "NUEVO" || esEtapaTerminal(lead.etapa)) return false;

  switch (user.rol) {
    case "ASESOR":
      return lead.asesor?.id === user.id;
    case "ADMINISTRADOR":
    case "SUPERVISOR":
    // Bloque F: bypass total, mismo criterio que ADMINISTRADOR (ver
    // el docblock de `RolUsuario` en `@/tipos/usuario`).
    case "SUPERVISOR_HOLDING":
    case "SUPER_ADMIN":
      return true;
    case "VENDEDOR":
      return false;
  }
}

/**
 * Reasignación: distinta del traspaso. El asesor solo puede reasignar SUS
 * leads, y solo si el semáforo es rojo o amarillo (nunca en verde -- un lead
 * caliente no se reasigna a mitad de camino). Vendedor nunca reasigna.
 * Administrador y supervisor reasignan cualquier lead sin condición.
 */
export function canReassignLead(lead: Lead, user: AuthenticatedUser): boolean {
  switch (user.rol) {
    case "ASESOR":
      return lead.asesor?.id === user.id && lead.semaforo !== "VERDE";
    case "ADMINISTRADOR":
    case "SUPERVISOR":
    case "SUPERVISOR_HOLDING":
    case "SUPER_ADMIN":
      return true;
    case "VENDEDOR":
      return false;
  }
}
