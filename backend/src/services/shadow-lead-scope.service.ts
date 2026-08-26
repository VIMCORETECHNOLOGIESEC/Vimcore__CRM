import type { Lead, Prisma } from "@prisma/client";
import { logger } from "../lib/logger.js";
import * as leadAbiertoRevisionRepository from "../repositories/lead-abierto-revision.repository.js";

/**
 * Bloque B (Fase 3, spec "Company-scoped open-lead dedupe runs in shadow
 * beside the global criterion"): comparación `(cliente, empresa)` puramente
 * observacional — NUNCA alimenta `decideAccionDeduplicacion` ni el `accion`
 * ya decidido por el criterio global (docs/14-evolucion-multitenant.md §3).
 * `await`ada DENTRO de la misma `tx` del llamador (diseño, decisión "Dedup
 * lead-abierto scope shadow": la transacción interactiva de
 * `deduplicateLead` se cierra en cuanto su callback retorna, así que un
 * fire-and-forget desatado como el de Fase 2 rompería o perdería
 * consistencia de lectura) — pero el try/catch de acá garantiza que un
 * fallo NUNCA se propague al llamador (spec, "Scoped evaluation failure is
 * non-fatal").
 *
 * `leadAbierto` es la fila `Lead` YA leída por el criterio global en el paso
 * C de `deduplicacion.service.ts` (cero consulta extra, diseño "Multi-empresa
 * aggregate check (rejected, NEW)"). `null`/`empresaId` nulo en cualquiera de
 * los dos lados es "no hay match escalable" — nunca se trata como colisión.
 */
export async function compararLeadAbiertoScope(
  leadAbierto: Lead | null,
  empresaIdCandidato: string | null,
  tx: Prisma.TransactionClient,
): Promise<void> {
  try {
    if (leadAbierto === null || leadAbierto.empresaId === null || empresaIdCandidato === null) {
      return;
    }
    if (leadAbierto.empresaId === empresaIdCandidato) {
      return;
    }

    logger.warn(
      {
        event: "shadow_dedupe_scope_divergence",
        clienteId: leadAbierto.clienteId,
        leadAbiertoId: leadAbierto.id,
        empresaLeadId: leadAbierto.empresaId,
        empresaIngestaId: empresaIdCandidato,
      },
      "Divergencia de scope (cliente, empresa) en lead abierto — shadow, observacional, no bloqueante",
    );

    await leadAbiertoRevisionRepository.upsertRevisionPendiente(
      {
        clienteId: leadAbierto.clienteId,
        leadAbiertoId: leadAbierto.id,
        empresaLeadId: leadAbierto.empresaId,
        empresaIngestaId: empresaIdCandidato,
      },
      tx,
    );
  } catch (error) {
    logger.warn(
      { event: "shadow_dedupe_scope_error", clienteId: leadAbierto?.clienteId, error },
      "Fallo no fatal del comparador en sombra de dedupe scope — ingesta sin afectar",
    );
  }
}

