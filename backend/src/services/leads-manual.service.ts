import type { Lead } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import * as canalManualRepository from "../repositories/canal-manual.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { CargaMasivaLeadsBody } from "../schemas/leads.schema.js";
import { assignAfterCommit } from "./asignacion.service.js";
import { canCreateManual, type UsuarioAcceso } from "./leads.access.js";
import { deduplicateLead, type DeduplicacionInput } from "./deduplicacion.service.js";

/**
 * Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico",
 * docs/blocks/d-routing-oportunidad.md:259-299): mismo criterio
 * anti-escalamiento que `producto.service.ts::resolveEmpresaId` (duplicado
 * deliberadamente por archivo, no un helper compartido — mismo patrón que el
 * resto del código base).
 */
function resolveEmpresaId(usuario: UsuarioAcceso, empresaIdInput: string | undefined): string {
  if (usuario.empresaId !== null) return usuario.empresaId;
  if (!empresaIdInput) {
    throw new AppError(
      "empresa_requerida",
      400,
      "Debes indicar empresaId explícitamente para una sesión holding-wide",
    );
  }
  return empresaIdInput;
}

export interface CrearLeadManualInput {
  empresaId?: string;
  nombre: string;
  telefono?: string;
  correo?: string;
  canalManualId?: string;
}

export interface CrearLeadManualResult {
  lead: Lead;
  /** `true` cuando `deduplicateLead` ancló el evento a un lead existente en vez de crear uno nuevo (D2, dedup sin cambios). */
  duplicado: boolean;
}

/**
 * Punto de entrada compartido de `POST /leads` y `POST /leads/carga-masiva`
 * (esta última la invoca en loop, ver `crearLeadsManualEnLote` abajo) — cero
 * lógica de negocio duplicada entre los dos endpoints.
 *
 * Reutiliza sin cambios la dedup de D2 (`deduplicateLead`) y el
 * auto-assignment de D3 (`assignAfterCommit`, fire-and-forget, nunca lanza —
 * mismo criterio que `ingesta.service.ts::procesarRecepcion`). El único
 * camino nuevo que `deduplicateLead` gana para este llamador es el fallback
 * sin-bridge (`entrada.empresaId`) — el camino de webhook/bridge no cambia.
 */
export async function crearLeadManual(
  usuario: UsuarioAcceso,
  input: CrearLeadManualInput,
  ahora: Date = new Date(),
): Promise<CrearLeadManualResult> {
  if (!canCreateManual(usuario)) {
    throw new AppError("permiso_denegado", 403, "No tienes permiso para esta acción");
  }

  const empresaId = resolveEmpresaId(usuario, input.empresaId);

  // Mismo criterio de "no encontrado o de otra empresa" que
  // `oportunidad.service.ts::crearOportunidad` (`producto_invalido`, 409) —
  // acá además cubre "inactivo": un canal retirado del catálogo
  // (`activo: false`) ya no es un destino válido para un ingreso nuevo,
  // aunque los leads históricos que lo referencian se conserven intactos.
  if (input.canalManualId !== undefined) {
    const canal = await canalManualRepository.findById(input.canalManualId);
    if (!canal || canal.empresaId !== empresaId || !canal.activo) {
      throw new AppError(
        "canal_manual_invalido",
        409,
        "El canal manual indicado no es válido para esta empresa",
      );
    }
  }

  const entrada: DeduplicacionInput = {
    nombre: input.nombre,
    telefono: input.telefono ?? null,
    correo: input.correo ?? null,
    ingresadoEn: ahora,
    empresaId,
    canalManualId: input.canalManualId,
    origenOverride: "MANUAL",
  };

  const dedup = await deduplicateLead(entrada, ahora);

  // D3 (auto-assignment): mismo criterio que `ingesta.service.ts::procesarRecepcion`
  // -- solo dispara si `deduplicateLead` de verdad creó un lead nuevo, nunca
  // para una interacción repetida sobre un lead ya asignado.
  if (dedup.leadCreado) {
    await assignAfterCommit(dedup.leadId, ahora);
  }

  const lead = await leadRepository.findById(dedup.leadId);
  if (!lead) {
    throw new AppError("lead_no_encontrado", 500, "Error interno al crear el lead manual");
  }

  return { lead, duplicado: !dedup.leadCreado };
}

export interface CargaMasivaResultadoFila {
  fila: number;
  estado: "creado" | "duplicado" | "error";
  leadId?: string;
  motivo?: string;
}

export interface CargaMasivaLeadsResult {
  resumen: { solicitados: number; creados: number; duplicados: number; fallidos: number };
  resultados: CargaMasivaResultadoFila[];
}

/**
 * `POST /leads/carga-masiva` (diseño aditivo, no está en
 * docs/blocks/d-routing-oportunidad.md -- contrato JSON ya comunicado a
 * frontend). N llamadas SECUENCIALES a `crearLeadManual`, mismo criterio que
 * `asignacion.service.ts::assignLeadsBatch`: reporte por fila, nunca
 * all-or-nothing. Solo `AppError` se captura por fila; un error NO-`AppError`
 * (infra) se relanza y aborta el request completo -- un fallo de
 * infraestructura no debe reportarse como "estas filas son inválidas".
 */
export async function crearLeadsManualEnLote(
  usuario: UsuarioAcceso,
  body: CargaMasivaLeadsBody,
): Promise<CargaMasivaLeadsResult> {
  const resultados: CargaMasivaResultadoFila[] = [];
  let creados = 0;
  let duplicados = 0;
  let fallidos = 0;

  for (const [index, item] of body.leads.entries()) {
    const fila = index + 1;
    try {
      const { lead, duplicado } = await crearLeadManual(usuario, {
        empresaId: body.empresaId,
        nombre: item.nombre,
        telefono: item.telefono,
        correo: item.correo,
        canalManualId: item.canalManualId ?? body.canalManualId,
      });
      if (duplicado) {
        duplicados += 1;
        resultados.push({ fila, estado: "duplicado", leadId: lead.id });
      } else {
        creados += 1;
        resultados.push({ fila, estado: "creado", leadId: lead.id });
      }
    } catch (error) {
      if (error instanceof AppError) {
        fallidos += 1;
        resultados.push({ fila, estado: "error", motivo: error.message });
        continue;
      }
      throw error;
    }
  }

  return {
    resumen: { solicitados: body.leads.length, creados, duplicados, fallidos },
    resultados,
  };
}
