import type { EtapaLead, RolUsuario, Semaforo } from "@prisma/client";
import type { ListLeadsQuery } from "../schemas/leads.schema.js";

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
 * Bloque F (aditivo, decisión cerrada con el usuario): constante LOCAL y
 * DISTINTA de `ROLES_ACCESO_TOTAL` de arriba a propósito — `canEdit` queda
 * explícitamente FUERA de este batch (el propio diseño original la deja
 * pendiente para antes de F, ver `docs/blocks/d-routing-oportunidad.md`).
 * Agregar los roles nuevos acá en vez de a `ROLES_ACCESO_TOTAL` evita cambiar
 * el comportamiento de `canEdit` como efecto secundario de este cambio.
 * `canReassign`/`canTransfer`/`canClose` (abajo) la usan desde este batch;
 * `canRead` se sumó después (fix "Ver en vivo" 403 determinístico, roadmap
 * backend pre-deploy) — sigue siendo el mismo criterio "acceso total de
 * lectura", `canEdit` es la única función que la deja fuera a propósito.
 */
const ROLES_HOLDING_TOTAL: readonly RolUsuario[] = ["SUPERVISOR_HOLDING", "SUPER_ADMIN"];

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
 *
 * Fix (drill-down holding-wide, vista de empresa desde el panel de holding):
 * mismo criterio de 3 ramas que `metricas.access.ts::resolveEmpresaId` — (1)
 * sesión company-scoped: forzada a su propia empresa, `query.empresaId` se
 * ignora (nunca puede escalar a otra empresa); (2) sesión holding-wide con
 * `query.empresaId`: drill-down opcional a UNA empresa puntual del holding;
 * (3) sesión holding-wide sin `query.empresaId`: sin filtro, agregado de todo
 * el holding (D2/D6, comportamiento previo sin cambios). Esto NO es una
 * relajación del aislamiento — `Lead.empresaId` sigue NOT NULL/indexado y RLS
 * sigue protegiendo la vía company-scoped igual que antes; la rama nueva solo
 * habilita que una sesión YA sin restricción (`empresaId: null`) elija acotar
 * su propio agregado a una empresa puntual.
 */
export function aplicarFiltroEmpresa<T extends { empresaId?: string }>(
  where: T,
  usuario: Pick<UsuarioAcceso, "empresaId">,
  query: Pick<ListLeadsQuery, "empresaId">,
): T {
  if (usuario.empresaId !== null) {
    where.empresaId = usuario.empresaId;
  } else if (query.empresaId) {
    where.empresaId = query.empresaId;
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
 *
 * Fix ("Ver en vivo" 403 determinístico, roadmap backend pre-deploy):
 * `ROLES_ACCESO_TOTAL` no incluye `SUPERVISOR_HOLDING`/`SUPER_ADMIN`, así que
 * una sesión holding-wide caía siempre al fallback de titularidad
 * (`asesorId`/`vendedorId`), falso para cualquier lead no asignado
 * directamente. Se agrega `ROLES_HOLDING_TOTAL` (mismo criterio que
 * `canReassign`/`canTransfer`/`canClose` más abajo) SOLO acá — `canEdit`
 * queda deliberadamente sin este bypass (modo solo lectura de "Ver en vivo").
 */
export function canRead(usuario: UsuarioAcceso, lead: LeadAcceso): boolean {
  if (!empresaCoincide(usuario, lead)) return false;
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol) || ROLES_HOLDING_TOTAL.includes(usuario.rol)) return true;
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
  | "etapa_no_cerrable"
  // Fix (bug P0, docs/16-hallazgos-y-preguntas.md §4.4: "Admin y supervisor
  // pueden entregar a vendedor un lead sin asesor"): la excepción de acceso
  // total de `canTransfer` (abajo) permitía traspasar a un lead que nunca
  // tuvo un asesor titular -- el gate de etapa NUEVO no alcanza a cubrir este
  // caso porque nada impide que un Admin/Supervisor avance la etapa de un
  // lead sin asesor (`canEdit` los deja editar cualquier lead sin importar
  // `asesorId`). Reproducido y confirmado con el modelo actual de
  // `habilitadoParaVenta` -- el bug es de `canTransfer`, no del corte de
  // rol/Membresia, así que se corrige acá sin reabrir esa migración.
  | "sin_asesor_previo";

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
 *
 * Bloque D (batch de negociación, decisión documentada): esta función queda
 * DECLARADA superseded por `oportunidad.access.ts` (D7/D9), pero su único
 * caller real (`asignacion.service.ts::reassignLead`, `POST
 * /leads/:id/reasignar`) NO se retira — documentado como GAP, no rewrite: el
 * equivalente `POST /oportunidades/:id/reasignar` (D9) solo cubre la
 * excepción ADMINISTRADOR/SUPERVISOR; no existe ningún equivalente para el
 * auto-servicio de un ASESOR reasignando su propio lead (rama `semaforo_verde`
 * de abajo), así que retirar el endpoint completo eliminaría una capacidad
 * real sin reemplazo. Queda vigente hasta que el negocio decida si ese
 * auto-servicio migra a Oportunidad o permanece como operación de "contacto"
 * de `Lead`, independiente de la negociación.
 */
export function canReassign(usuario: UsuarioAcceso, lead: LeadReasignacion): MotivoDenegacion | null {
  if (!empresaCoincide(usuario, lead)) return "no_es_titular";
  // Bloque F (aditivo): SUPERVISOR_HOLDING/SUPER_ADMIN comparten el mismo
  // "acceso total" que ADMINISTRADOR/SUPERVISOR acá, pero vía una constante
  // separada (`ROLES_HOLDING_TOTAL`) para no alterar `canRead`/`canEdit`.
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol) || ROLES_HOLDING_TOTAL.includes(usuario.rol)) return null;
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
 *
 * Bloque D (batch de negociación, decisión documentada): esta función queda
 * DECLARADA superseded por `oportunidad.access.ts`, pero su único caller real
 * (`asignacion.service.ts::transferLead`, `POST /leads/:id/traspasar`) NO se
 * retira — documentado como GAP, no rewrite: `Oportunidad.vendedorId` existe
 * en el esquema pero, por diseño explícito de este mismo batch, "sin pool ni
 * endpoint de traspaso" todavía (ver `oportunidad.access.ts`). No hay ningún
 * equivalente de `/oportunidades/*` a redirigir — retirar este endpoint hoy
 * eliminaría el handoff asesor→vendedor sin reemplazo.
 */
export function canTransfer(usuario: UsuarioAcceso, lead: LeadTraspaso): MotivoDenegacion | null {
  if (!empresaCoincide(usuario, lead)) return "no_es_titular";
  if (lead.etapa === "NUEVO") return "etapa_no_traspasable";
  // Bloque F (aditivo): mismo criterio que `canReassign` — constante separada
  // para no alterar `canRead`/`canEdit`.
  //
  // Fix (bug P0, docs/16 §4.4): la excepción de acceso total NO es
  // incondicional -- exige que el lead ya tenga un asesor titular
  // (`asesorId !== null`). Sin esto, un Admin/Supervisor podía avanzar la
  // etapa de un lead nunca asignado (`canEdit` los deja editar cualquiera) y
  // traspasarlo directo a un vendedor, saltándose por completo la
  // intervención del asesor que D9/docs/02 exigen. La rama ASESOR de abajo ya
  // exige titularidad (`usuario.id !== lead.asesorId`), así que un asesor
  // nunca pudo alcanzar esta ruta con `asesorId: null` -- el hueco era
  // exclusivo de la excepción de acceso total.
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol) || ROLES_HOLDING_TOTAL.includes(usuario.rol)) {
    return lead.asesorId === null ? "sin_asesor_previo" : null;
  }
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
 *
 * Bloque D (batch de negociación, decisión documentada): esta función queda
 * SUPERSEDIDA y RETIRADA de producción — su único caller real
 * (`leads.service.ts::transitionEtapa`, rama VENTA/NO_VENTA de `PATCH
 * /leads/:id/etapa`) ya no la invoca: el cierre de negociación ahora tiene un
 * equivalente completo en `POST /oportunidades/:id/cerrar`
 * (`oportunidad.access.ts::canCerrarOportunidad`, D7), que es exactamente el
 * criterio de salida esencial de Bloque D ("la autoridad de cierre usa
 * Membresia... no depende de Usuario.rol"). Se conserva exportada (no se
 * borra el archivo/función) porque `shadow-authorization.service.ts` y sus
 * pruebas todavía la referencian — inerte en producción, no dead code sin
 * dueño.
 */
/**
 * Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico",
 * docs/blocks/d-routing-oportunidad.md:286): "Administrador, Supervisor y
 * Asesor pueden cargar un lead manual — requiere Membresia activa en la
 * empresa destino". VENDEDOR queda deliberadamente excluido (spec, no
 * gestiona ingreso de leads, solo su cartera ya asignada). Solo chequeo de
 * rol, a diferencia de `canRead`/`canEdit`/etc: no hay `LeadAcceso` que
 * evaluar todavía (el lead no existe) — "Membresia activa en la empresa
 * destino" ya está garantizada por cómo `require-authentication.middleware.ts`
 * resuelve `usuario.empresaId` en la sesión (Bloque C, D2), así que no hace
 * falta un query adicional acá.
 */
export function canCreateManual(usuario: UsuarioAcceso): boolean {
  const ROLES_INGRESO_MANUAL: readonly RolUsuario[] = [
    "ADMINISTRADOR",
    "SUPERVISOR",
    "ASESOR",
    "SUPERVISOR_HOLDING",
    "SUPER_ADMIN",
  ];
  return ROLES_INGRESO_MANUAL.includes(usuario.rol);
}

export function canClose(usuario: UsuarioAcceso, lead: LeadCierre): MotivoDenegacion | null {
  if (!empresaCoincide(usuario, lead)) return "no_es_titular";
  if (lead.etapa === "NUEVO") return "etapa_no_cerrable";
  // Bloque F (aditivo): mismo criterio que `canReassign`/`canTransfer` —
  // constante separada para no alterar `canRead`/`canEdit`. Ningún
  // ADMINISTRADOR/SUPERVISOR de empresa tiene hoy este bypass (D7): estos dos
  // roles nuevos sí, porque su alcance es "el máximo posible", igual que
  // `ADMINISTRADOR` en el resto de los chequeos "acceso total" de este
  // archivo.
  if (ROLES_HOLDING_TOTAL.includes(usuario.rol)) return null;
  if (usuario.rol === "SUPERVISOR") return "rol";
  if (usuario.rol === "ADMINISTRADOR") return null;
  const responsable = lead.vendedorId ?? lead.asesorId;
  return responsable !== null && usuario.id === responsable ? null : "no_es_titular";
}
