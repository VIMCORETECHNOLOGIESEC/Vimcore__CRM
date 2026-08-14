import type { EtapaLead, RolUsuario, Semaforo } from "@prisma/client";

export interface UsuarioAcceso {
  id: string;
  rol: RolUsuario;
}

/** Subconjunto exacto de `Lead` que las reglas de acceso necesitan. */
export interface LeadAcceso {
  asesorId: string | null;
  vendedorId: string | null;
}

const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

/**
 * DD5 (diseño M5): autorización por recurso, no expresable con
 * `requireRole(...)`. Vive en el servicio, no en middleware — las rutas
 * solo montan `requireAuthentication` y el `where` de rol se inyecta aquí,
 * nunca desde query params del cliente.
 *
 * Lectura (spec, "Detalle con verificación de acceso"): Admin/Supervisor
 * siempre; además `asesorId` o `vendedorId` del lead — el asesor que
 * traspasó un lead a un vendedor conserva acceso de lectura (D4).
 */
export function canRead(usuario: UsuarioAcceso, lead: LeadAcceso): boolean {
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return true;
  return usuario.id === lead.asesorId || usuario.id === lead.vendedorId;
}

/**
 * Edición (spec, "Transición de etapa transaccional"): Admin/Supervisor
 * siempre; si no, solo el responsable operativo actual —
 * `vendedorId ?? asesorId` (D4). Tras un traspaso, el asesor original
 * pierde edición aunque conserve lectura.
 */
export function canEdit(usuario: UsuarioAcceso, lead: LeadAcceso): boolean {
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return true;
  const responsableOperativo = lead.vendedorId ?? lead.asesorId;
  return responsableOperativo !== null && usuario.id === responsableOperativo;
}

/**
 * M6 (diseño, DD9): `MotivoDenegacion` distingue la causa exacta de rechazo
 * porque el servicio necesita mapear a códigos HTTP distintos —
 * `etapa_no_traspasable` es 409, el resto es 403 — algo que un `boolean` no
 * puede expresar sin obligar al servicio a re-derivar la causa.
 */
export type MotivoDenegacion = "rol" | "no_es_titular" | "semaforo_verde" | "etapa_no_traspasable";

export interface LeadReasignacion extends LeadAcceso {
  semaforo: Semaforo | null;
}

export interface LeadTraspaso extends LeadAcceso {
  etapa: EtapaLead;
}

/**
 * docs/02 §4 (diseño M6, D8/DD6): Admin/Supervisor reasignan cualquier lead
 * sin condición. Asesor: solo los suyos y solo si el semáforo NO es verde —
 * `null` no bloquea (DD6: un lead sin calificar nunca está "caliente en curso
 * de cierre"). Vendedor nunca reasigna. `null` de retorno = permitido.
 */
export function canReassign(usuario: UsuarioAcceso, lead: LeadReasignacion): MotivoDenegacion | null {
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return null;
  if (usuario.rol !== "ASESOR") return "rol";
  if (usuario.id !== lead.asesorId) return "no_es_titular";
  if (lead.semaforo === "VERDE") return "semaforo_verde";
  return null;
}

/**
 * docs/02 §5 (diseño M6, D9): la compuerta de etapa aplica a TODOS los roles
 * — `NUEVO` no es traspasable ni para un administrador, es una regla del
 * lead, no del actor. Fuera de `NUEVO`: mismo patrón que `canReassign` pero
 * sin la restricción de semáforo (el traspaso no la tiene).
 */
export function canTransfer(usuario: UsuarioAcceso, lead: LeadTraspaso): MotivoDenegacion | null {
  if (lead.etapa === "NUEVO") return "etapa_no_traspasable";
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return null;
  if (usuario.rol !== "ASESOR") return "rol";
  if (usuario.id !== lead.asesorId) return "no_es_titular";
  return null;
}
