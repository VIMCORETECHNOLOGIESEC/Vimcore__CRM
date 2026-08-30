import { httpClient, type QueryParamValue } from "@/api/httpClient";
import { fetchLeadsApi } from "@/funcionalidades/leads/leads.api";
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
 * La reasignación de la cartera activa al dar de baja un usuario es
 * responsabilidad exclusiva del backend (M2, atómica dentro de la misma
 * transacción de baja) -- el frontend no orquesta ninguna llamada adicional
 * para eso, ver el JSDoc de `deactivateUsuarioApi`. "Carga activa de leads"
 * (columna de solo lectura de la tabla) sí sigue llamando al backend real de
 * leads (`GET /leads?responsableId=`) -- ver la nota
 * INTEGRACION-BACKEND-GAP en `getCargaActivaDeUsuario` más abajo sobre el
 * límite de 100 leads activos por falta de un endpoint de agregación.
 */

export interface CreateUsuarioInput {
  nombre: string;
  correo: string;
  password: string;
  rol: RolUsuario;
}

export interface CreateEmpresaAdministradorInput {
  nombre: string;
  correo: string;
  password: string;
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
  /**
   * Vista de empresa de un holding-wide (`useVistaEmpresa`, GestorEmpresasPage
   * -> EmpresaDetallePage). El backend TODAVÍA no filtra por esto (mismo
   * hallazgo de scope reportado a Mateo) -- se manda igual, forward-compatible:
   * el día que el backend lo soporte (mismo patrón que ya usa
   * `producto.service.ts::listarProductos`), esta pantalla empieza a filtrar
   * de verdad sin ningún cambio de frontend.
   */
  empresaId?: string;
  /**
   * Bloque F (tarea 2), Item 25: filtra el listado a SOLO los usuarios sin
   * ninguna `Membresia` (roles holding-wide: ADMINISTRADOR/SUPERVISOR/
   * SUPERVISOR_HOLDING/SUPER_ADMIN sin empresa). Gana sobre `empresaId` si
   * ambos viajan (`usuarios.service.ts::buildWhere`,
   * `listUsuariosQuerySchema` en `backend/src/schemas/usuarios.schema.ts`).
   * Igual que `empresaId` arriba, contrato confirmado en `origin/main`
   * (commit a76c62b) TODAVÍA no mergeado a `test/gpt` -- se manda igual,
   * forward-compatible: sin efecto hasta que el merge llegue.
   */
  soloHoldingWide?: boolean;
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

/**
 * Alta de administrador de empresa (Item 23, docs/23) -- `POST
 * /empresas/:empresaId/administradores`, `requireRole("ADMINISTRADOR")`.
 * SIN prefijo `/usuarios/`: `usuariosRouter` se monta sin prefijo en
 * `backend/src/routes/index.ts` (`apiRouter.use(usuariosRouter)`) y la ruta
 * se registra tal cual en `usuarios.routes.ts` -- mismo patrón que
 * `empresa-apariencia-holding.api.ts::updateEmpresaAparienciaHolding`
 * (`/empresas/${empresaId}/apariencia`). El rol del usuario creado es
 * implícito ADMINISTRADOR, fijado por el backend
 * (`createEmpresaAdministradorBodySchema` no tiene campo `rol`).
 *
 * Contrato confirmado contra `origin/main` (commit a76c62b) -- TODAVÍA no
 * existe en este branch (`test/gpt`, bloqueado por el merge pendiente de
 * Mateo, no relacionado con este cambio). Se llama igual, forward-compatible
 * (mismo criterio que `empresaId`/`soloHoldingWide` en `UsuariosQueryParams`
 * más arriba).
 */
export async function createEmpresaAdministradorApi(
  empresaId: string,
  input: CreateEmpresaAdministradorInput,
): Promise<AdminUsuario> {
  const { user } = await httpClient.post<UsuarioResponse>(
    `/empresas/${empresaId}/administradores`,
    input,
  );
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
 * (`usuarios.service.ts::deactivateUsuario`): pone `activo=false`, revoca
 * todos los refresh tokens del usuario **y reasigna automáticamente su
 * cartera activa** cuando corresponde, todo en una única transacción. Si el
 * usuario dado de baja es ASESOR/VENDEDOR con leads activos, cada lead se
 * reasigna al candidato del mismo rol con menor carga activa (desempate FIFO
 * por `ultimaAsignacionEn`, mismo criterio que la asignación automática M6).
 * Si no hay ningún candidato disponible, el backend aborta con
 * `409 baja_sin_candidato_reasignacion` y no persiste nada (ni la baja ni
 * reasignaciones parciales) -- el frontend no orquesta ninguna llamada
 * previa, solo muestra ese error accionable si ocurre.
 */
export async function deactivateUsuarioApi(id: string): Promise<void> {
  await httpClient.delete<void>(`/usuarios/${id}`);
}

/**
 * Reactivación de un usuario dado de baja -- `PATCH /usuarios/:id` con
 * `{ activo: true }`, mismo endpoint que edición/restablecimiento de
 * contraseña, que ahora también acepta `activo` (backend real). Arranca con
 * cartera vacía: no restaura los leads reasignados durante la baja. No-op
 * idempotente si el usuario ya está activo. Mismo criterio que
 * `bridges/bridges.api.ts::reactivateBridgeApi`.
 */
export async function reactivateUsuarioApi(id: string): Promise<AdminUsuario> {
  const { user } = await httpClient.patch<UsuarioResponse>(`/usuarios/${id}`, { activo: true });
  return user;
}

// ---------------------------------------------------------------------------
// "Carga activa de leads" (F7, checklist) -- backend real de leads
// (integración F3/F4), ya no depende del mock en memoria que usaba
// `leads.api.ts::LEADS_MOCK`. Es una columna de solo lectura de la tabla;
// no participa de la baja lógica (ver `deactivateUsuarioApi` más arriba).
//
// INTEGRACION-BACKEND-GAP (documentado, no resuelto en este cambio): no
// existe un endpoint de agregación dedicado ("cantidad de leads activos por
// usuario") -- se deriva de `GET /leads?responsableId=` con el límite
// máximo permitido por el schema (100, `listLeadsQuerySchema.limite.max`).
// A la escala del MVP (~500 leads/mes, AGENTS.md §1) es correcto en la
// práctica, pero un usuario con más de 100 leads activos simultáneos
// subcontaría (no hay agregación server-side ni paginación completa acá).
// ---------------------------------------------------------------------------

/** Cantidad de leads activos (no en etapa terminal) de los que `usuarioId` es responsable. Backend real. */
export async function getCargaActivaDeUsuario(usuarioId: string): Promise<number> {
  const { datos } = await fetchLeadsApi({ pagina: 1, porPagina: 100, responsableId: usuarioId });
  return datos.filter((lead) => !ETAPAS_TERMINALES.includes(lead.etapa)).length;
}
