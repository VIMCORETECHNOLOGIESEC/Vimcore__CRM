import { httpClient, type QueryParamValue } from "@/api/httpClient";
import {
  assignLeadsMasivoApi,
  fetchLeadsApi,
  getCatalogoResponsablesConRol,
} from "@/funcionalidades/leads/leads.api";
import { ETAPAS_TERMINALES } from "@/funcionalidades/leads/etapas";
import type { AdminUsuario, RolUsuario } from "@/tipos/usuario";

/**
 * Capa de datos de administración de usuarios (F7, docs/07). A diferencia de
 * F3-F6, el backend real de usuarios **ya existe y está mergeado**
 * (`backend/src/routes/usuarios.routes.ts`, los 5 endpoints CRUD, todos
 * `requireRole("ADMINISTRADOR")`) -- las funciones de alta, listado,
 * edición, restablecimiento de contraseña y baja lógica llaman al backend
 * real, no a un mock.
 *
 * "Carga activa de leads" y la reasignación obligatoria de cartera en la
 * baja lógica (integración F3/F4) ya llaman al backend real de leads
 * (`GET /leads?responsableId=`, `POST /leads/asignar-lote`) -- ver la nota
 * INTEGRACION-BACKEND-GAP en `getCargaActivaDeUsuario` más abajo sobre el
 * límite de 100 leads activos por falta de un endpoint de agregación.
 */

export interface CreateUsuarioInput {
  nombre: string;
  correo: string;
  password: string;
  rol: RolUsuario;
}

export interface UpdateUsuarioInput {
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

interface UsuarioResponse {
  user: AdminUsuario;
}

/**
 * Query params de `GET /usuarios` (F7, listado con filtro y paginación
 * real). Contrato confirmado contra
 * `backend/src/schemas/usuarios.schema.ts`: `busqueda` filtra por nombre O
 * correo (insensible a mayúsculas), `activo` viaja como booleano y
 * `httpClient` lo serializa a `"true"|"false"` (ver
 * `api/httpClient.ts::buildQueryString`), `direccion` ordena por
 * `creadoEn` (default `"asc"` en el backend si se omite).
 */
export interface UsuariosQueryParams {
  /** 1-based, default 1 en el backend. */
  pagina: number;
  /** Default 20 en el backend, máximo 100. */
  limite: number;
  busqueda?: string;
  rol?: RolUsuario;
  activo?: boolean;
  direccion?: "asc" | "desc";
}

export interface UsuariosResponse {
  users: AdminUsuario[];
  total: number;
  pagina: number;
  limite: number;
}

/**
 * `GET /usuarios` -- backend real, ver
 * `backend/src/controllers/usuarios.controller.ts::getUsers`. Filtro y
 * paginación reales desde el backend (no un slice hecho en el frontend):
 * `total`/`pagina`/`limite` vienen de la misma respuesta para construir los
 * controles "Anterior/Siguiente" y "Mostrando X–Y de Z" (`UsuariosPage.tsx`),
 * mismo criterio que `leads.api.ts::fetchLeadsApi` (F3).
 */
export async function fetchUsuariosApi(params: UsuariosQueryParams): Promise<UsuariosResponse> {
  // El cast es solo de tipos: `UsuariosQueryParams` no declara un índice de
  // string explícito (TS lo exige para asignar una interfaz a
  // `Record<string, QueryParamValue>`), pero sus valores ya cumplen
  // `QueryParamValue` uno por uno -- `buildQueryString` en runtime no
  // depende de nada más que `Object.entries`.
  return httpClient.get<UsuariosResponse>("/usuarios", {
    params: params as unknown as Record<string, QueryParamValue>,
  });
}

/** `POST /usuarios` -- backend real (D9: alta exclusiva de ADMINISTRADOR). */
export async function createUsuarioApi(input: CreateUsuarioInput): Promise<AdminUsuario> {
  const { user } = await httpClient.post<UsuarioResponse>("/usuarios", input);
  return user;
}

/** `PATCH /usuarios/:id` -- backend real, edita nombre/correo/rol (sin contraseña). */
export async function updateUsuarioApi(
  id: string,
  input: UpdateUsuarioInput,
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
// "Carga activa de leads" y reasignación obligatoria de cartera (F7,
// checklist) -- backend real de leads (integración F3/F4, D-A1/D-A2), ya no
// dependen del mock en memoria que usaba `leads.api.ts::LEADS_MOCK`.
//
// INTEGRACION-BACKEND-GAP (documentado, no resuelto en este cambio): no
// existe un endpoint de agregación dedicado ("cantidad de leads activos por
// usuario") -- se deriva de `GET /leads?responsableId=` con el límite
// máximo permitido por el schema (100, `listLeadsQuerySchema.limite.max`).
// A la escala del MVP (~500 leads/mes, AGENTS.md §1) es correcto en la
// práctica, pero un usuario con más de 100 leads activos simultáneos
// subcontaría (no hay agregación server-side ni paginación completa acá).
// ---------------------------------------------------------------------------

async function fetchLeadsActivosIdsDeUsuario(usuarioId: string): Promise<string[]> {
  const { datos } = await fetchLeadsApi({ pagina: 1, porPagina: 100, responsableId: usuarioId });
  return datos.filter((lead) => !ETAPAS_TERMINALES.includes(lead.etapa)).map((lead) => lead.id);
}

/** Cantidad de leads activos (no en etapa terminal) de los que `usuarioId` es responsable. Backend real. */
export async function getCargaActivaDeUsuario(usuarioId: string): Promise<number> {
  const ids = await fetchLeadsActivosIdsDeUsuario(usuarioId);
  return ids.length;
}

/**
 * Candidatos válidos para recibir la cartera de un usuario dado de baja: del
 * mismo rol operativo (un asesor solo puede traspasar a otro asesor, un
 * vendedor solo a otro vendedor -- administrador/supervisor no cargan
 * cartera propia en este modelo), excluyendo al propio usuario. Backend real.
 */
export async function getCandidatosReasignacion(
  rol: RolUsuario,
  excluirUsuarioId: string,
): Promise<{ id: string; nombre: string }[]> {
  if (rol !== "ASESOR" && rol !== "VENDEDOR") {
    return [];
  }
  const responsables = await getCatalogoResponsablesConRol();
  return responsables
    .filter((responsable) => responsable.rol === rol && responsable.id !== excluirUsuarioId)
    .map(({ id, nombre }) => ({ id, nombre }));
}

/**
 * Reasigna la cartera activa de un usuario antes de darlo de baja. Backend
 * real: `assignLeadsMasivoApi` llama a `POST /leads/asignar-lote` (D-A1).
 *
 * IMPORTANTE (limitación conocida, no resuelta en silencio): esto y
 * `deactivateUsuarioApi` **no son una transacción atómica** -- son dos
 * llamadas HTTP independientes. Si `deactivateUsuarioApi` fallara después de
 * una reasignación exitosa, la cartera ya se movió pero el usuario seguiría
 * activo. Debería vivir en la misma transacción que `deactivateUser`
 * (`usuario.repository.ts`), igual que ya hace hoy con `revokeAllForUser` --
 * cambio de backend fuera del alcance de esta unidad (frontend-only).
 */
export async function reassignCarteraActiva(
  usuarioId: string,
  nuevoResponsableId: string,
): Promise<void> {
  const leadIds = await fetchLeadsActivosIdsDeUsuario(usuarioId);
  if (leadIds.length === 0) return;
  await assignLeadsMasivoApi(leadIds, nuevoResponsableId);
}
