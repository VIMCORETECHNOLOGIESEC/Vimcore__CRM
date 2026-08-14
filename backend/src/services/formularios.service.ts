import type { EtapaLead, Prisma, Semaforo } from "@prisma/client";
import { getFormulario } from "../config/formularios.js";
import { AppError } from "../lib/app-error.js";
import { GESTION_LEAD_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as leadRepository from "../repositories/lead.repository.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as respuestaFormularioRepository from "../repositories/respuesta-formulario.repository.js";
import { calculatePuntuacion } from "./semaforo.calculator.js";

/** Subconjunto exacto de `Lead` que `applyFormulario` necesita del llamador. */
export interface ApplyFormularioLead {
  id: string;
  etapa: EtapaLead;
  semaforo: Semaforo | null;
}

export interface ApplyFormularioResult {
  puntuacion: number;
  semaforo: Semaforo;
  respuestaId: string;
  /** `null` si el color no cambió — D16: solo se emite evento cuando cambia. */
  eventoSemaforoId: string | null;
}

/**
 * DD4 (diseño M5): "una única escritura compuesta" — validar → calcular →
 * insertar `respuestas_formulario` → actualizar `leads.semaforo/puntuacion`
 * → emitir `CAMBIO_SEMAFORO` si cambió, envuelto en `runInTransaction`
 * exactamente igual que `deduplicateLead` (M3). `PATCH /etapa` (PR3) le
 * pasa su propia `tx` (D3/D17, una sola transacción con el resto de la
 * transición); `POST /formulario` (recalificación, D16) no pasa ninguna.
 *
 * Alcance (PR2): solo etapas calificables (`NUEVO`/`CONTACTADO`/`CITA`,
 * D6) — `VENTA`/`NO_VENTA` no traen `respuestas` en su body (el
 * `patchEtapaBodySchema` discriminado de PR3 exige monto/producto/forma de
 * pago o una observación, nunca `respuestas`), así que fijar su color sin
 * pasar por el motor de puntuación es responsabilidad del PR3 que orquesta
 * la transición de etapa, no de este seam. Documentado como decisión de
 * alcance, no como omisión silenciosa.
 */
export async function applyFormulario(
  lead: ApplyFormularioLead,
  respuestas: Record<string, string>,
  usuarioId: string,
  txExterna?: Prisma.TransactionClient,
): Promise<ApplyFormularioResult> {
  const formulario = getFormulario(lead.etapa);
  if (!formulario.calificable) {
    // AGENTS.md §4: error de dominio vía AppError + middleware central,
    // nunca un `Error` genérico con stack trace hacia el cliente.
    throw new AppError(
      "etapa_no_calificable",
      409,
      `La etapa ${lead.etapa} no es calificable (D6) — el semáforo se fija directamente en la transición de etapa, sin invocar el motor de puntuación`,
    );
  }

  return runInTransaction(
    txExterna,
    async (tx) => {
      const { puntuacion, semaforo } = calculatePuntuacion(formulario, respuestas);

      const respuesta = await respuestaFormularioRepository.createRespuesta(
        {
          leadId: lead.id,
          usuarioId,
          etapa: lead.etapa,
          respuestas: respuestas as unknown as Prisma.InputJsonValue,
          puntuacion,
          semaforo,
          versionRubrica: formulario.version,
        },
        tx,
      );

      await leadRepository.updateSemaforo(lead.id, { semaforo, puntuacion }, tx);

      let eventoSemaforoId: string | null = null;
      if (lead.semaforo !== semaforo) {
        const evento = await leadEventoRepository.createEvento(
          {
            leadId: lead.id,
            tipo: "CAMBIO_SEMAFORO",
            semaforoAnterior: lead.semaforo,
            semaforoNuevo: semaforo,
          },
          tx,
        );
        eventoSemaforoId = evento.id;
      }

      return { puntuacion, semaforo, respuestaId: respuesta.id, eventoSemaforoId };
    },
    GESTION_LEAD_TRANSACTION_BOUNDS,
  );
}
