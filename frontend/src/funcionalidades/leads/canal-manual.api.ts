import { httpClient } from "@/api/httpClient";

/**
 * Canal de ingreso manual y catálogo dinámico (Bloque D, diseño en
 * `docs/blocks/d-routing-oportunidad.md`, "Canal de ingreso manual y
 * catálogo dinámico"). Backend real, ya mergeado -- contrato verificado
 * contra:
 * - `backend/prisma/schema.prisma:522-534` (modelo `CanalManual`).
 * - `backend/src/routes/canal-manual.routes.ts` (rutas + roles requeridos).
 * - `backend/src/controllers/canal-manual.controller.ts` (forma exacta de
 *   request/response).
 * - `backend/src/services/canal-manual.service.ts` (resolución de
 *   `empresaId`: una sesión `company` la ignora siempre, una sesión
 *   holding-wide sin `Membresia` propia la exige).
 * - `backend/src/schemas/canal-manual.schema.ts` (validación de `nombre`,
 *   `activo`).
 * - `backend/src/routes/leads.routes.ts` (`POST /leads`) y
 *   `backend/src/schemas/leads.schema.ts::crearLeadManualBodySchema` para el
 *   alta de lead manual (`createLeadManualApi`).
 */

/** Forma exacta de `CanalManual` (Prisma), ver `backend/prisma/schema.prisma:522-534`. */
export interface CanalManual {
  id: string;
  empresaId: string;
  nombre: string;
  activo: boolean;
  /** ISO 8601 (UTC) -- `DateTime` de Prisma serializado por `res.json`. */
  creadoEn: string;
}

export interface CrearCanalManualInput {
  nombre: string;
}

export interface ActualizarCanalManualInput {
  nombre?: string;
  activo?: boolean;
}

/**
 * Payload de "Cargar lead manual" (`POST /leads`, `crearLeadManualBodySchema`):
 * `nombre` es obligatorio (no confundir con `Cliente.nombre`, que sí es
 * opcional en el modelo -- el endpoint de alta manual exige `nombre` no
 * vacío). `telefono`/`correo` son individualmente opcionales pero el backend
 * exige al menos uno (`.refine` del schema citado). `canalManualId` es
 * opcional a nivel de contrato del backend, pero esta pantalla (Administrador/
 * Supervisor/Asesor cargando un lead manual desde el catálogo) siempre pide
 * elegir uno -- ver `CargarLeadManualDialog.tsx`.
 */
export interface CrearLeadManualInput {
  empresaId: string;
  nombre: string;
  telefono?: string;
  correo?: string;
  canalManualId?: string;
}

interface CanalManualResponse {
  canalManual: CanalManual;
}

interface CanalesManualesResponse {
  canalesManuales: CanalManual[];
}

interface LeadManualResponse {
  lead: { id: string };
}

/**
 * `GET /canales-manuales?empresaId=` -- Administrador/Supervisor/Asesor
 * (y holding vía bypass de `requireRole`) listan para elegir canal al cargar
 * un lead manual. Una sesión `company` ignora `empresaId` de query (el
 * backend usa la de la sesión); se manda igual, mismo criterio que
 * `leads.api.ts::fetchLeadsApi`.
 */
export async function fetchCanalesManualesApi(empresaId: string): Promise<CanalManual[]> {
  const { canalesManuales } = await httpClient.get<CanalesManualesResponse>("/canales-manuales", {
    params: { empresaId },
  });
  return canalesManuales;
}

/** `POST /canales-manuales` -- gestión del catálogo, exclusivo ADMINISTRADOR. */
export async function createCanalManualApi(
  empresaId: string,
  input: CrearCanalManualInput,
): Promise<CanalManual> {
  const { canalManual } = await httpClient.post<CanalManualResponse>("/canales-manuales", {
    ...input,
    empresaId,
  });
  return canalManual;
}

/**
 * `PATCH /canales-manuales/:id` -- rename y/o activar/desactivar, exclusivo
 * ADMINISTRADOR. `empresaId` no viaja en el body: el backend resuelve la
 * empresa del canal a partir del `:id` (`canalManualRepository.findById`) y
 * la compara contra la sesión (`canal-manual.service.ts::editarCanalManual`)
 * -- se mantiene como parámetro acá solo por compatibilidad de firma con
 * `useActualizarCanalManual.ts` (clave de invalidación de la query).
 */
export async function updateCanalManualApi(
  empresaId: string,
  canalId: string,
  input: ActualizarCanalManualInput,
): Promise<CanalManual> {
  void empresaId;
  const { canalManual } = await httpClient.patch<CanalManualResponse>(
    `/canales-manuales/${canalId}`,
    input,
  );
  return canalManual;
}

/**
 * `POST /leads` (`origen: "MANUAL"`, resuelto por el backend a partir de la
 * ausencia de bridge). 201 si `deduplicateLead` creó un lead nuevo, 200 si
 * ancló el evento a uno existente -- en ambos casos la respuesta es
 * `{ lead }`; acá solo se necesita `lead.id`.
 */
export async function createLeadManualApi(
  input: CrearLeadManualInput,
): Promise<{ id: string }> {
  const { lead } = await httpClient.post<LeadManualResponse>("/leads", input);
  return { id: lead.id };
}
