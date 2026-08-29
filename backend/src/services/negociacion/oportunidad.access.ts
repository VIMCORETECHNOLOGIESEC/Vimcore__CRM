import type { RolUsuario } from "@prisma/client";
import type { PrismaClientOrTransaction } from "../../lib/prisma.js";
import * as membresiaPoolRepository from "../../repositories/negociacion/membresia-pool.repository.js";
import type { AuthenticatedUser } from "../../types/authenticated-user.js";

/**
 * negociacion (Bloque D): mirror de FORMA de `leads.access.ts` -- misma idea
 * de "compuerta de empresa + rol/titularidad", NUEVA a propósito porque el
 * negocio pidió que la autoridad de cierre (D7, `canCerrarOportunidad` abajo)
 * ya no dependa de `Usuario.rol` como el `canClose` viejo, sino de
 * `Membresia`. `leads.access.ts` no se importa ni se modifica.
 */
export interface OportunidadAcceso {
  asesorId: string | null;
  /**
   * Presente en el modelo (`Oportunidad.vendedorId`, mismo shape que `Lead`)
   * pero sin pool ni endpoint de traspaso en este batch -- siempre `null`
   * hoy. Se conserva en esta interfaz por completitud/compatibilidad futura
   * con un eventual traspaso de Oportunidad, sin efecto práctico todavía.
   */
  vendedorId: string | null;
  empresaId: string;
}

// Bloque F (aditivo, decisión cerrada con el usuario): SUPERVISOR_HOLDING/
// SUPER_ADMIN comparten el mismo alcance máximo que ADMINISTRADOR/SUPERVISOR
// acá -- acceso total holding-wide, sin restricción de empresaId. A
// diferencia de `leads.access.ts` (donde esta lista también la usa
// `canEdit`, fuera de alcance de F), acá `canReadOportunidad`/
// `canEditOportunidad` son las DOS únicas funciones que la consumen y ambas
// están en alcance de este batch, así que se agrega directo sin necesitar
// una constante separada.
const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
];

function empresaCoincide(usuario: AuthenticatedUser, oportunidad: OportunidadAcceso): boolean {
  return usuario.empresaId === null || usuario.empresaId === oportunidad.empresaId;
}

/** Mismo criterio que `leads.access.ts::aplicarFiltroEmpresa`, reescrito localmente. */
export function aplicarFiltroEmpresaOportunidad<T extends { empresaId?: string }>(
  where: T,
  usuario: Pick<AuthenticatedUser, "empresaId">,
): T {
  if (usuario.empresaId !== null) {
    where.empresaId = usuario.empresaId;
  }
  return where;
}

export function canReadOportunidad(usuario: AuthenticatedUser, oportunidad: OportunidadAcceso): boolean {
  if (!empresaCoincide(usuario, oportunidad)) return false;
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return true;
  return usuario.id === oportunidad.asesorId || usuario.id === oportunidad.vendedorId;
}

/**
 * Decisión propia (no especificada explícitamente por el negocio en este
 * batch): edición de la etapa intermedia (`PATCH /oportunidades/:id/etapa`,
 * CONTACTADO/CITA) sigue el mismo criterio "Admin/Supervisor siempre, o el
 * responsable actual" que `leads.access.ts::canEdit` -- consistente con el
 * resto del sistema, sin inventar una regla nueva. Distinta de la autoridad
 * de cierre (D7, `canCerrarOportunidad` abajo), que el negocio SÍ especificó
 * de forma literal.
 */
export function canEditOportunidad(usuario: AuthenticatedUser, oportunidad: OportunidadAcceso): boolean {
  if (!empresaCoincide(usuario, oportunidad)) return false;
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return true;
  return usuario.id === oportunidad.asesorId;
}

/**
 * D7 (regla de negocio cerrada con el usuario, implementada tal cual): solo
 * un `Usuario` con `Membresia` activa en la empresa, `rol: ASESOR`,
 * `habilitadoParaVenta: true`, y que sea el `asesorId` ACTUAL de la
 * `Oportunidad`, puede cerrarla. A diferencia de `leads.access.ts::canClose`,
 * acá NO hay excepción para ADMINISTRADOR/SUPERVISOR por `Usuario.rol` --
 * la única forma en que un Administrador/Supervisor adquiere esta autoridad
 * es tomando la Oportunidad vía la excepción D9 (`reasignarOportunidadExcepcion`),
 * que le crea al vuelo la `Membresia(ASESOR, habilitadoParaVenta: true)`
 * necesaria -- en ese punto satisface esta misma regla como cualquier asesor,
 * sin necesidad de un camino de cierre especial para administradores.
 *
 * Requiere I/O (consulta `Membresia`), a diferencia del resto de este
 * archivo -- por eso es async y recibe el `client`/`tx` del llamador.
 */
export async function canCerrarOportunidad(
  usuario: AuthenticatedUser,
  oportunidad: OportunidadAcceso,
  client: PrismaClientOrTransaction,
): Promise<boolean> {
  if (usuario.rol !== "ASESOR") return false;
  if (usuario.id !== oportunidad.asesorId) return false;

  const membresia = await membresiaPoolRepository.findMembresiaAsesorHabilitada(
    usuario.id,
    oportunidad.empresaId,
    client,
  );
  return membresia !== null;
}
