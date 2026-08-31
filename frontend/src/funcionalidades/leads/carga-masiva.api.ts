import { httpClient } from "@/api/httpClient";

/**
 * Carga masiva de leads vía Excel, por empresa (Bloque D, mismo bloque que
 * `canal-manual.api.ts`: "Canal de ingreso manual y catálogo dinámico").
 * Backend real, ya mergeado -- contrato verificado contra:
 * - `backend/src/routes/leads.routes.ts` (`POST /leads/carga-masiva`).
 * - `backend/src/controllers/leads.controller.ts::postLeadsCargaMasiva`.
 * - `backend/src/schemas/leads.schema.ts::cargaMasivaLeadsBodySchema` (y
 *   `leadManualItemSchema` para cada fila).
 * - `backend/src/services/leads-manual.service.ts::crearLeadsManualEnLote`.
 *
 * Body real:
 * ```json
 * {
 *   "empresaId": "uuid opcional -- solo obligatorio para una sesión holding-wide sin Membresia propia; una sesión company la ignora",
 *   "canalManualId": "uuid opcional -- canal por default para TODO el lote",
 *   "leads": [
 *     {
 *       "nombre": "string, requerido",
 *       "telefono": "string, opcional si viene correo",
 *       "correo": "string, opcional si viene telefono",
 *       "canalManualId": "uuid opcional -- pisa el del lote SOLO para esta fila"
 *     }
 *   ]
 * }
 * ```
 * `canalManualId` coexiste a los dos niveles (confirmado en
 * `leads-manual.service.ts:141-147`: `canalManualId: item.canalManualId ??
 * body.canalManualId`) -- el de fila gana cuando está presente, el de lote
 * es el default para toda fila que no traiga el suyo.
 *
 * - Sin `empresaId` obligatorio (sesión holding-wide) y sin mandarlo: CADA
 *   fila del lote vuelve como `error` (`empresa_requerida`), sin romper el
 *   resto del request (el backend igual responde 200).
 * - Máximo 100 leads por request (`cargaMasivaLeadsBodySchema.leads.max(100)`)
 *   -- el cliente particiona en tandas de 100 y manda varios POST seguidos
 *   (`useCargaMasiva.ts::useCargaMasivaLeads`).
 * - `origen: MANUAL` y `etapa: NUEVO` los pone el backend por default.
 * - Cada fila necesita AL MENOS `telefono` o `correo` -- también se valida
 *   del lado del cliente ANTES de mandar nada
 *   (`carga-masiva.utils.ts::parsearExcelCargaMasiva`), para no gastar una
 *   tanda entera con filas que el usuario podría corregir antes.
 *
 * Response real: siempre 200 (JSON válido -> 200, nunca all-or-nothing).
 * ```json
 * {
 *   "resumen": { "solicitados": 50, "creados": 47, "duplicados": 2, "fallidos": 1 },
 *   "resultados": [
 *     { "fila": 1, "estado": "creado", "leadId": "uuid" },
 *     { "fila": 2, "estado": "duplicado", "leadId": "uuid-del-lead-existente" },
 *     { "fila": 3, "estado": "error", "motivo": "telefono y correo ausentes" }
 *   ]
 * }
 * ```
 * `fila` es el índice del array que el cliente mandó EN ESE REQUEST (1-based),
 * NO el número real de fila del Excel -- el mapeo de vuelta al número real
 * (offset de encabezado + offset de tanda) vive en
 * `useCargaMasiva.ts::useCargaMasivaLeads`, nunca acá.
 */

/** Máximo de leads por request que acepta el endpoint real -- particionar en tandas de esta longitud. */
export const CARGA_MASIVA_MAX_LEADS_POR_TANDA = 100;

export interface CargaMasivaLeadInput {
  nombre: string;
  telefono?: string;
  correo?: string;
  /** Pisa `CargaMasivaBody.canalManualId` para esta fila puntual, ver el docblock de arriba. */
  canalManualId?: string;
}

export interface CargaMasivaBody {
  /**
   * Solo obligatorio para un usuario holding-wide (sesión sin empresa fija)
   * -- una sesión `company` normal lo omite y el backend usa la empresa de
   * su sesión. Ver el docblock del archivo.
   */
  empresaId?: string;
  /** Canal por default para todo el lote -- cualquier fila puede pisarlo con su propio `canalManualId`. */
  canalManualId?: string;
  leads: CargaMasivaLeadInput[];
}

export interface CargaMasivaResumen {
  solicitados: number;
  creados: number;
  duplicados: number;
  fallidos: number;
}

export type CargaMasivaEstadoFila = "creado" | "duplicado" | "error";

export interface CargaMasivaResultadoFila {
  /** Índice 1-based dentro del array `leads` de ESTE request -- no el número real de fila del Excel. */
  fila: number;
  estado: CargaMasivaEstadoFila;
  leadId?: string;
  motivo?: string;
}

export interface CargaMasivaResponse {
  resumen: CargaMasivaResumen;
  resultados: CargaMasivaResultadoFila[];
}

/** `POST /leads/carga-masiva` -- siempre 200, el reporte por fila nunca es all-or-nothing. */
export async function crearLeadsMasivoApi(body: CargaMasivaBody): Promise<CargaMasivaResponse> {
  return httpClient.post<CargaMasivaResponse>("/leads/carga-masiva", body);
}
