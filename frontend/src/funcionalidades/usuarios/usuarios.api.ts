import { httpClient } from "@/api/httpClient";
import {
  assignLeadsMasivoApi,
  getCatalogoResponsablesConRol,
  getLeadsActivosDeUsuario,
} from "@/funcionalidades/leads/leads.api";
import type { AdminUsuario, RolUsuario } from "@/tipos/usuario";

/**
 * Capa de datos de administración de usuarios (F7, docs/07). A diferencia de
 * F3-F6, el backend real de usuarios **ya existe y está mergeado**
 * (`backend/src/routes/usuarios.routes.ts`, los 5 endpoints CRUD, todos
 * `requireRole("ADMINISTRADOR")`) -- las funciones de alta, listado,
 * edición, restablecimiento de contraseña y baja lógica llaman al backend
 * real, no a un mock.
 *
 * La única pieza que sigue siendo mock es la "carga activa de leads"
 * (listado) y la reasignación obligatoria de cartera en la baja lógica --
 * ver el comentario de brecha en `getCargaActivaDeUsuario` más abajo:
 * no existe ningún backend real de leads (M5) contra el cual consultarla o
 * reasignarla.
 */

export interface CrearUsuarioInput {
  nombre: string;
  correo: string;
  password: string;
  rol: RolUsuario;
}

export interface ActualizarUsuarioInput {
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

interface UsuarioResponse {
  user: AdminUsuario;
}

interface UsuariosResponse {
  users: AdminUsuario[];
}

/** `GET /usuarios` -- backend real, ver `backend/src/controllers/usuarios.controller.ts::getUsers`. */
export async function fetchUsuariosApi(): Promise<AdminUsuario[]> {
  const { users } = await httpClient.get<UsuariosResponse>("/usuarios");
  return users;
}

/** `POST /usuarios` -- backend real (D9: alta exclusiva de ADMINISTRADOR). */
export async function createUsuarioApi(input: CrearUsuarioInput): Promise<AdminUsuario> {
  const { user } = await httpClient.post<UsuarioResponse>("/usuarios", input);
  return user;
}

/** `PATCH /usuarios/:id` -- backend real, edita nombre/correo/rol (sin contraseña). */
export async function updateUsuarioApi(
  id: string,
  input: ActualizarUsuarioInput,
): Promise<AdminUsuario> {
  const { user } = await httpClient.patch<UsuarioResponse>(`/usuarios/${id}`, input);
  return user;
}

/**
 * Restablecimiento de contraseña por administrador (F7, distinto de la
 * brecha de F2). `PATCH /usuarios/:id` con `{ password }` es el mismo
 * endpoint que F2 reutiliza para el autoservicio, pero acá **sí funciona de
 * punta a punta para cualquier usuario objetivo**: el endpoint está
 * protegido con `requireRole("ADMINISTRADOR")` y, a diferencia del
 * autoservicio, no exige la contraseña actual -- fue diseñado justamente
 * para que un administrador reescriba la contraseña de otro usuario
 * (`backend/src/services/usuarios.service.ts::updateUser`). Sin brecha de
 * backend para este flujo.
 */
export async function resetPasswordApi(id: string, password: string): Promise<void> {
  await httpClient.patch<UsuarioResponse>(`/usuarios/${id}`, { password });
}

/**
 * Baja lógica -- `DELETE /usuarios/:id`, backend real
 * (`usuarioRepository.deactivateUser`): pone `activo=false` y revoca todos
 * los refresh tokens del usuario en una misma transacción. **No reasigna la
 * cartera activa**: confirmado leyendo
 * `backend/src/repositories/usuario.repository.ts::deactivateUser`, la
 * transacción solo hace el `update` de `activo` y `revokeAllForUser`, nada
 * de leads. La reasignación previa (`reassignCarteraActiva`, más abajo) es
 * responsabilidad exclusiva del frontend hoy.
 */
export async function deactivateUsuarioApi(id: string): Promise<void> {
  await httpClient.delete<void>(`/usuarios/${id}`);
}

// ---------------------------------------------------------------------------
// Brecha documentada: "carga activa de leads" y reasignación obligatoria de
// cartera (F7, checklist). No existe ningún backend real de leads -- se
// verificó explícitamente antes de escribir este archivo: `backend/src/
// {routes,controllers,services}` no tiene ningún archivo de leads, solo
// `usuarios`, `auth`, `salud` y `deduplicacion` (M5, docs/06-modulos-backend.md,
// no está implementado ni siquiera como esqueleto). No hay forma de
// consultar la cartera de un usuario real ni de reasignarla contra un
// backend real hoy.
//
// Para no inventar un segundo mock paralelo, se reutiliza el mismo fixture
// en memoria que ya usan F3/F4/F5 (`leads.api.ts::LEADS_MOCK`) a través de
// `getLeadsActivosDeUsuario`/`getCatalogoResponsablesConRol`/
// `assignLeadsMasivoApi`. Esos mocks usan ids sintéticos fijos (`asesor-1`,
// `asesor-2`, `vendedor-1`, `vendedor-2`), no los UUID que genera el backend
// real de usuarios -- en un ambiente real, salvo coincidencia, cualquier
// usuario mostrará "0 leads activos" no porque no tenga cartera, sino
// porque no hay ningún dato real contra el cual contarla. Cuando exista
// `GET /leads` (M5) o un endpoint de agregación por usuario, reemplazar el
// cuerpo de las tres funciones de esta sección.
// ---------------------------------------------------------------------------

/** Cantidad de leads activos (no en etapa terminal) de los que `usuarioId` es responsable. */
export function getCargaActivaDeUsuario(usuarioId: string): number {
  return getLeadsActivosDeUsuario(usuarioId).length;
}

/**
 * Candidatos válidos para recibir la cartera de un usuario dado de baja: del
 * mismo rol operativo (un asesor solo puede traspasar a otro asesor, un
 * vendedor solo a otro vendedor -- administrador/supervisor no cargan
 * cartera propia en este modelo), excluyendo al propio usuario.
 */
export function getCandidatosReasignacion(
  rol: RolUsuario,
  excluirUsuarioId: string,
): { id: string; nombre: string }[] {
  if (rol !== "ASESOR" && rol !== "VENDEDOR") {
    return [];
  }
  return getCatalogoResponsablesConRol()
    .filter((responsable) => responsable.rol === rol && responsable.id !== excluirUsuarioId)
    .map(({ id, nombre }) => ({ id, nombre }));
}

/**
 * Reasigna la cartera activa de un usuario antes de darlo de baja.
 *
 * IMPORTANTE (limitación conocida, no resuelta en silencio): esto y
 * `deactivateUsuarioApi` **no son una transacción atómica** -- uno muta un
 * mock en memoria, el otro es una llamada real al backend. Si
 * `deactivateUsuarioApi` fallara después de una reasignación exitosa, la
 * cartera ya se movió pero el usuario seguiría activo. Cuando exista el
 * backend real de leads, esta reasignación debería vivir en la misma
 * transacción que `deactivateUser` (`usuario.repository.ts`), igual que ya
 * hace hoy con `revokeAllForUser`.
 */
export function reassignCarteraActiva(
  usuarioId: string,
  nuevoResponsableId: string,
): Promise<void> {
  const leadIds = getLeadsActivosDeUsuario(usuarioId).map((lead) => lead.id);
  return assignLeadsMasivoApi(leadIds, nuevoResponsableId);
}
