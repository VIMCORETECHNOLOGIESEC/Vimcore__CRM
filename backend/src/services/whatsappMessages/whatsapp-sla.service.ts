import { SLA_HORAS } from "../../config/negocio.js";
import { logger } from "../../lib/logger.js";
import { ASIGNACION_TRANSACTION_BOUNDS, prisma, runWithTenantContext } from "../../lib/prisma.js";
import * as conversacionEventoRepository from "../../repositories/whatsappMessages/conversacion-evento.repository.js";
import * as conversacionRepository from "../../repositories/whatsappMessages/conversacion.repository.js";
import * as mensajeRepository from "../../repositories/whatsappMessages/mensaje.repository.js";
import { selectResponsable } from "../asignacion.service.js";
import { partitionByEmpresa } from "../company-partition.js";
import { publishCommittedEvents, type CommittedEvent } from "../committed-events.service.js";

export interface ResultadoReasignacionSla {
  candidatos: number;
  reasignadas: number;
}

/**
 * rule 3 (batch whatsappMessages): si pasan `SLA_HORAS` sin que el asesor
 * responda una `Conversacion`, se reasigna automáticamente a otro asesor del
 * pool — comportamiento NUEVO, específico de este módulo (no cambia la
 * reasignación de `Lead`, que sigue siendo manual). Handler PURO de efectos
 * (recibe `ahora`, nunca consulta el reloj real), mismo criterio D2(i) que
 * `sla-atrasado.service.ts::detectLeadsAtrasados` — el wiring del intervalo
 * vive en `jobs/whatsappMessages/whatsapp-sla.job.ts`.
 *
 * DECISIÓN DE DISEÑO documentada (no hay una entrada de
 * `BYPASS_JOB_ALLOWLIST` en `lib/prisma.ts` para este job nuevo — ese
 * archivo está fuera de los tres editables de esta tarea, ver el resumen
 * final): la fase de descubrimiento cross-empresa usa
 * `runWithTenantContext({ empresaId: null })` (D3, holding-wide vía el ROL
 * DE APLICACIÓN `crm_app`) en vez de `runAsBypassJob` (`crm_bypass_jobs`,
 * READ ONLY) — mismo mecanismo que ya usa `jobs/ingesta-inbox.job.ts::
 * runIngestionOnce` para un job sin `TenantContext` de request. Si se
 * prefiere el aislamiento de defensa-en-profundidad de `crm_bypass_jobs`, un
 * mantenedor puede agregar una entrada `"whatsapp-sla"` a
 * `BYPASS_JOB_ALLOWLIST` y este archivo se puede migrar a `runAsBypassJob`
 * sin cambiar ninguna otra lógica.
 */
export async function detectarConversacionesAtrasadas(
  ahora: Date = new Date(),
): Promise<ResultadoReasignacionSla> {
  const ventanaMs = SLA_HORAS * 60 * 60 * 1000;
  const frontera = new Date(ahora.getTime() - ventanaMs);

  // D2 gap closure (mismo gotcha documentado en `lib/prisma.ts`, ver el
  // comentario largo sobre `$allOperations`): un `$queryRaw` suelto llamado
  // directo sobre `prisma` (fuera de una transacción explícita) NUNCA ve las
  // GUCs de tenant aplicadas, sin importar el `TenantContext` activo —
  // `findCandidatosSlaVencido` usa `$queryRaw` internamente, así que se
  // envuelve acá en `prisma.$transaction` (mismo remedio que
  // `meta-webhook.service.ts::encolarLeadgenMeta` para
  // `aceptarLeadgenMetaPendiente`) para que `app.tenant_unrestricted` quede
  // fijado ANTES de que corra la consulta cross-empresa.
  const candidatos = await runWithTenantContext({ empresaId: null }, () =>
    prisma.$transaction(
      (tx) => conversacionRepository.findCandidatosSlaVencido(frontera, tx),
      ASIGNACION_TRANSACTION_BOUNDS,
    ),
  );
  if (candidatos.length === 0) return { candidatos: 0, reasignadas: 0 };

  let reasignadas = 0;
  for (const [empresaId, particion] of partitionByEmpresa(candidatos)) {
    await runWithTenantContext({ empresaId }, async () => {
      for (const candidato of particion) {
        const resultado = await prisma.$transaction(async (tx) => {
          // Relectura + bloqueo dentro de la transacción — el candidato
          // pudo haber sido reasignado (manualmente, o por un tick anterior)
          // entre el scan holding-wide y este punto.
          const conversacion = await conversacionRepository.findByIdForUpdate(candidato.id, tx);
          if (!conversacion || conversacion.asesorId === null) {
            return { reasignada: false, committed: [] as CommittedEvent[] };
          }

          const ultimoMensaje = await mensajeRepository.findUltimo(conversacion.id, tx);
          if (!ultimoMensaje || ultimoMensaje.direccion !== "ENTRANTE" || ultimoMensaje.enviadoEn > frontera) {
            // El asesor ya respondió (o llegó un mensaje más nuevo) desde el scan.
            return { reasignada: false, committed: [] as CommittedEvent[] };
          }

          // Idempotencia: si ya se reasignó una vez por este mismo mensaje
          // pendiente, el umbral para la PRÓXIMA reasignación es la fecha de
          // esa reasignación (el nuevo asesor tiene su propia ventana
          // `SLA_HORAS` completa), no la fecha original del mensaje.
          const ultimoEvento = await conversacionEventoRepository.findUltimo(conversacion.id, tx);
          const umbral =
            ultimoEvento
            && ultimoEvento.tipo === "REASIGNADA_SLA_VENCIDO"
            && ultimoEvento.ocurridoEn > ultimoMensaje.enviadoEn
              ? ultimoEvento.ocurridoEn
              : ultimoMensaje.enviadoEn;
          if (ahora.getTime() - umbral.getTime() < ventanaMs) {
            return { reasignada: false, committed: [] as CommittedEvent[] };
          }

          // Mismo algoritmo de pool (menor carga + FIFO) que el resto del
          // sistema — `selectResponsable` reusado tal cual, excluyendo al
          // titular actual (nunca su propio candidato).
          const receptor = await selectResponsable("ASESOR", tx, conversacion.asesorId ?? undefined);
          if (!receptor) {
            logger.warn(
              { event: "whatsapp_sla_sin_candidatos", empresaId, conversacionId: conversacion.id },
              "whatsapp-sla: no hay asesores activos disponibles para reasignar",
            );
            return { reasignada: false, committed: [] as CommittedEvent[] };
          }

          await conversacionRepository.updateAsesor(conversacion.id, receptor.id, tx);
          await conversacionEventoRepository.createEvento(
            {
              conversacionId: conversacion.id,
              empresaId,
              usuarioId: receptor.id,
              tipo: "REASIGNADA_SLA_VENCIDO",
            },
            tx,
          );

          return {
            reasignada: true,
            committed: [
              {
                userId: receptor.id,
                empresaId,
                type: "whatsapp.conversacion-reasignada",
                data: { conversacionId: conversacion.id, asesorId: receptor.id, motivo: "sla_vencido" },
              },
            ] as CommittedEvent[],
          };
        }, ASIGNACION_TRANSACTION_BOUNDS);

        if (resultado.reasignada) reasignadas += 1;
        publishCommittedEvents(resultado.committed);
      }
    });
  }

  return { candidatos: candidatos.length, reasignadas };
}
