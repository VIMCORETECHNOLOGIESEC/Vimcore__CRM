import type { EtapaLead, RolUsuario, Semaforo } from "@prisma/client";

export interface UsuarioAcceso {
  id: string;
  rol: RolUsuario;
  // Bloque C (D2/D6, Fase 2/Stage 2 — cutover bloqueante): `null` = alcance
  // holding-wide (ADMINISTRADOR/SUPERVISOR sin `Membresia` propia, D2 —
  // preserva su comportamiento actual sin restricción). Cualquier otro
  // valor exige coincidencia exacta con `LeadAcceso.empresaId` en TODAS las
  // funciones de este archivo, incluida la vía de acceso total.
  empresaId: string | null;
}

/** Subconjunto exacto de `Lead` que las reglas de acceso necesitan. */
export interface LeadAcceso {
  asesorId: string | null;
  vendedorId: string | null;
  empresaId: string;
}

const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

/**
 * Bloque C (Fase 2/Stage 2, D-cutover): único punto de la compuerta de
 * empresa reutilizado por las 5 funciones de este archivo — `null` en el
 * usuario es holding-wide (sin restricción, D2); cualquier otro valor exige
 * coincidencia EXACTA con la empresa del lead. Aplica IGUAL a la vía de
 * acceso total (Admin/Supervisor) que al resto — un Admin/Supervisor de
 * empresa (no holding-wide) no puede escalar fuera de su propia empresa.
 */
function empresaCoincide(usuario: UsuarioAcceso, lead: LeadAcceso): boolean {
  return usuario.empresaId === null || usuario.empresaId === lead.empresaId;
}

/**
 * Bloque C (Fase 2/Stage 2, task 2.12 REFACTOR): consolida el patrón
 * "`empresaId === null` (holding-wide, sin restricción) o filtrar por esa
 * empresa exacta" en un único punto reutilizable por `leads.service.ts::buildWhere`
 * y `metricas.access.ts::resolveAlcanceBase` — antes duplicado idéntico en
 * ambos archivos. Mutación in-place deliberada (mismo patrón que el resto de
 * `buildWhere`/`resolveAlcanceBase`, que arman su `where` incrementalmente).
 */
export function aplicarFiltroEmpresa<T extends { empresaId?: string }>(
  where: T,
  usuario: Pick<UsuarioAcceso, "empresaId">,
): T {
  if (usuario.empresaId !== null) {
    where.empresaId = usuario.empresaId;
  }
  return where;
}

/**
 * DD5 (diseño M5): autorización por recurso, no expresable con
 * `requireRole(...)`. Vive en el servicio, no en middleware — las rutas
 * solo montan `requireAuthentication` y el `where` de rol se inyecta aquí,
 * nunca desde query params del cliente.
 *
 * Lectura (spec, "Detalle con verificación de acceso"): Admin/Supervisor
 * siempre; además `asesorId` o `vendedorId` del lead — el asesor que
 * traspasó un lead a un vendedor conserva acceso de lectura (D4).
 *
 * Bloque C (Fase 2/Stage 2): la compuerta de empresa se evalúa PRIMERO y
 * bloquea a TODOS los roles por igual — spec "Direct id access is denied,
 * not leaked": un lead de otra empresa nunca llega a evaluarse por rol.
 */
export function canRead(usuario: UsuarioAcceso, lead: LeadAcceso): boolean {
  if (!empresaCoincide(usuario, lead)) return false;
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return true;
  return usuario.id === lead.asesorId || usuario.id === lead.vendedorId;
}

/**
 * Edición (spec, "Transición de etapa transaccional"): Admin/Supervisor
 * siempre; si no, solo el responsable operativo actual —
 * `vendedorId ?? asesorId` (D4). Tras un traspaso, el asesor original
 * pierde edición aunque conserve lectura.
 *
 * Bloque C (Fase 2/Stage 2): mismo orden que `canRead` — la compuerta de
 * empresa corta antes de cualquier chequeo de rol/titularidad.
 */
export function canEdit(usuario: UsuarioAcceso, lead: LeadAcceso): boolean {
  if (!empresaCoincide(usuario, lead)) return false;
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
export type MotivoDenegacion =
  | "rol"
  | "no_es_titular"
  | "semaforo_verde"
  | "etapa_no_traspasable"
  | "ya_traspasado"
  | "etapa_no_cerrable";

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
 *
 * Bloque C (Fase 2/Stage 2): compuerta de empresa PRIMERO, antes de
 * cualquier otro chequeo — reutiliza `no_es_titular` (no se agrega un motivo
 * nuevo, spec "Direct id access is denied, not leaked": el HTTP mapper de
 * `asignacion.service.ts::throwForMotivoDenegacion` ya colapsa todo motivo
 * que no sea `etapa_no_traspasable` al mismo 403 genérico).
 */
export function canReassign(usuario: UsuarioAcceso, lead: LeadReasignacion): MotivoDenegacion | null {
  if (!empresaCoincide(usuario, lead)) return "no_es_titular";
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
 *
 * Bloque C (Fase 2/Stage 2): compuerta de empresa ANTES de la compuerta de
 * etapa — deliberado: si el gate de etapa corriera primero, un llamador de
 * otra empresa podría distinguir `etapa_no_traspasable` (409, revela que el
 * lead existe y está en NUEVO) de un 403 genérico para un lead que ni
 * siquiera puede ver, filtrando información de un recurso ajeno (spec,
 * "Direct id access is denied, not leaked").
 */
export function canTransfer(usuario: UsuarioAcceso, lead: LeadTraspaso): MotivoDenegacion | null {
  if (!empresaCoincide(usuario, lead)) return "no_es_titular";
  if (lead.etapa === "NUEVO") return "etapa_no_traspasable";
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return null;
  if (usuario.rol !== "ASESOR") return "rol";
  if (usuario.id !== lead.asesorId) return "no_es_titular";
  // M-hardening Bloque A (D4, corrige docs/06 P0): el asesor origen agota su
  // única autoridad de traspaso una vez que el lead ya tiene vendedorId —
  // Admin/Supervisor (arriba) no tienen este límite.
  if (lead.vendedorId !== null) return "ya_traspasado";
  return null;
}

export interface LeadCierre extends LeadAcceso {
  etapa: EtapaLead;
}

/**
 * M-hardening Bloque A (D1-D3, memoria #82): autoridad de cierre, distinta de
 * `canEdit`. Orden de evaluación DELIBERADO: (1) compuerta de etapa — `NUEVO`
 * deniega para TODOS los roles sin excepción, incluido ADMINISTRADOR, porque
 * es una regla del lead, no del actor (mismo patrón que `canTransfer` con
 * `etapa_no_traspasable`); (2) SUPERVISOR nunca cierra; (3) ADMINISTRADOR
 * cierra sin chequeo de titularidad (no entra al pool de asignación); (4)
 * ASESOR/VENDEDOR: solo el responsable operativo actual (`vendedorId ??
 * asesorId`). NO reutiliza `ROLES_ACCESO_TOTAL` — es la primera regla donde
 * admin y supervisor divergen.
 *
 * Bloque C (Fase 2/Stage 2): compuerta de empresa ANTES de la compuerta de
 * etapa — mismo criterio anti-filtración que `canTransfer` (`etapa_no_cerrable`
 * también es un 409 que revelaría la etapa de un lead ajeno).
 */
export function canClose(usuario: UsuarioAcceso, lead: LeadCierre): MotivoDenegacion | null {
  if (!empresaCoincide(usuario, lead)) return "no_es_titular";
  if (lead.etapa === "NUEVO") return "etapa_no_cerrable";
  if (usuario.rol === "SUPERVISOR") return "rol";
  if (usuario.rol === "ADMINISTRADOR") return null;
  const responsable = lead.vendedorId ?? lead.asesorId;
  return responsable !== null && usuario.id === responsable ? null : "no_es_titular";
}
