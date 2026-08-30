import type { Prisma } from "@prisma/client";
import { ASIGNACION_TRANSACTION_BOUNDS, prisma, runInTransaction, runWithTenantContext } from "../../lib/prisma.js";
import { normalizeTelefono } from "../../lib/telefono.js";
import * as clienteRepository from "../../repositories/cliente.repository.js";
import * as leadRepository from "../../repositories/lead.repository.js";
import * as conversacionRepository from "../../repositories/whatsappMessages/conversacion.repository.js";
import * as conversacionEventoRepository from "../../repositories/whatsappMessages/conversacion-evento.repository.js";
import * as mensajeRepository from "../../repositories/whatsappMessages/mensaje.repository.js";
import { assignAfterCommit } from "../asignacion.service.js";
import { publishCommittedEvents, type CommittedEvent } from "../committed-events.service.js";
import { decideAccionDeduplicacion, type DeduplicacionState } from "../deduplicacion.decider.js";
import type { WhatsAppMensajeEntrante } from "../../types/whatsappMessages/whatsapp-mensaje-entrante.js";

/**
 * D-mensajería (rule 1/2 del brief): ruteo de UNA `Conversacion` reusa
 * exactamente la misma máquina de decisión que ya usan los demás bridges
 * (`decideAccionDeduplicacion` + `leadRepository.findLeadAbierto`/
 * `findUltimoLeadCerrado`, incluida la ventana de reingreso de 90 días) —
 * nunca reimplementa esa regla. La ÚNICA razón por la que este archivo no
 * llama directo a `deduplicacion.service.ts::deduplicateLead` es que esa
 * función exige resolver `empresaId` vía `Bridge` (`resolverAtribucion`) y
 * lanza `empresa_no_resuelta` sin uno — WhatsApp resuelve `empresaId` desde
 * `WhatsAppConexion`, no desde un `Bridge` (deliberado, ver el comentario del
 * schema: "WhatsApp NUNCA tiene un Bridge propio"). Se reusa cada pieza
 * reutilizable de esa misma máquina (`decideAccionDeduplicacion`,
 * `leadRepository`, `assignAfterCommit`) en vez de tocar
 * `deduplicacion.service.ts` para ensanchar su contrato.
 */
function normalizarWaId(waId: string): { original: string; normalizado: string } {
  const conPrefijo = waId.startsWith("+") ? waId : `+${waId}`;
  const parsed = normalizeTelefono(conPrefijo);
  if (parsed.valido) return { original: conPrefijo, normalizado: parsed.normalizado };
  // Meta ya garantiza que `wa_id` es un número real en formato internacional
  // sin "+" — si `libphonenumber-js` igual lo rechaza (p. ej. un número de
  // sandbox/test), se usa el propio wa_id como normalizado: es el
  // identificador canónico que la plataforma de WhatsApp ya entrega, más
  // confiable acá que la validación estricta de una librería pensada para
  // inputs de formulario humano.
  return { original: conPrefijo, normalizado: conPrefijo.replace(/[^\d+]/g, "") };
}

interface RuteoResultado {
  asesorId: string | null;
  leadCreadoId: string | null;
}

/**
 * Decide a qué asesor rutea el PRÓXIMO mensaje de este cliente — se
 * recalcula en cada mensaje entrante (rule 2: "el mensaje rutea a ese
 * asesor", tiempo presente) porque `Conversacion` no tiene `leadId` (ver el
 * schema): el vínculo con el `Lead` vigente del cliente se resuelve cada
 * vez, nunca se cachea. `applyRuteo` (más abajo) solo escribe cuando el
 * resultado difiere del `asesorId` ya persistido en la `Conversacion`.
 */
async function resolverAsesorObjetivo(
  clienteId: string,
  empresaId: string,
  ahora: Date,
  tx: Prisma.TransactionClient,
): Promise<RuteoResultado> {
  const leadAbierto = await leadRepository.findLeadAbierto(clienteId, tx);
  if (leadAbierto) {
    // rule 2: ya tiene un Lead con asesor asignado -> rutea a ese asesor.
    // Decisión conservadora documentada (brief, "si encontrás una ambigüedad
    // resolvela conservador"): si el lead abierto TODAVÍA no tiene asesor
    // (p. ej. quedó `sin_candidatos`), NO se dispara acá una segunda
    // asignación automática — rule 1 la ata explícitamente a "sin Lead
    // activo"; este lead ya está activo, su propio camino de asignación
    // (manual, por un Supervisor) sigue siendo la única vía.
    return { asesorId: leadAbierto.asesorId, leadCreadoId: null };
  }

  const ultimoLeadCerradoRow = await leadRepository.findUltimoLeadCerrado(clienteId, tx);
  const ultimoLeadCerrado =
    ultimoLeadCerradoRow !== null && ultimoLeadCerradoRow.cerradoEn !== null
      ? { id: ultimoLeadCerradoRow.id, cerradoEn: ultimoLeadCerradoRow.cerradoEn }
      : null;

  const estado: DeduplicacionState = { clienteId, leadAbierto: null, ultimoLeadCerrado };
  const accion = decideAccionDeduplicacion(estado, ahora);

  if (accion.kind === "interaccion_repetida") {
    // Único motivo posible acá (leadAbierto ya es null): `lead_cerrado_en_ventana`
    // — dentro de los 90 días de reingreso, se reusa el lead cerrado SIN crear
    // uno nuevo (regla de reingreso reusada tal cual). Rutea al último asesor
    // responsable de ese lead cerrado — extensión conservadora de rule 2 al
    // caso "cerrado más reciente" en vez de "abierto", documentada en el
    // resumen de esta tarea.
    return { asesorId: ultimoLeadCerradoRow?.asesorId ?? null, leadCreadoId: null };
  }

  // accion.kind === "crear_lead" (NUEVO o REINGRESO, rule 1) — mismo pool
  // ASESOR que el resto de los bridges; la asignación real corre post-commit
  // vía `assignAfterCommit` (ver `procesarMensajeEntrante`, abajo), nunca acá.
  const lead = await leadRepository.createLead(
    {
      clienteId,
      origen: accion.origen,
      ingresadoEn: ahora,
      redSocial: "WHATSAPP",
      empresaId,
    },
    tx,
  );
  return { asesorId: null, leadCreadoId: lead.id };
}

interface ApplyRuteoResultado {
  conversacionId: string;
  asesorId: string | null;
  events: CommittedEvent[];
}

/**
 * Crea la `Conversacion` si es la primera vez que este cliente escribe a
 * este número, o sincroniza `asesorId` contra el ruteo vigente si ya existía
 * (evento `ASIGNADA` en la creación, `REASIGNADA_TRASPASO_LEAD` cuando el
 * asesor cambia en una conversación ya existente — mismo `TipoEventoConversacion`
 * que ya trae el schema para este caso).
 */
async function applyRuteo(
  clienteId: string,
  conexion: { id: string; empresaId: string },
  ruteo: RuteoResultado,
  ahora: Date,
  tx: Prisma.TransactionClient,
): Promise<ApplyRuteoResultado> {
  const events: CommittedEvent[] = [];
  const existente = await conversacionRepository.findByClienteYConexion(clienteId, conexion.id, tx);

  if (!existente) {
    const creada = await conversacionRepository.create(
      {
        clienteId,
        conexionId: conexion.id,
        empresaId: conexion.empresaId,
        asesorId: ruteo.asesorId,
        ultimoMensajeEn: ahora,
        creadaEn: ahora,
      },
      tx,
    );
    if (ruteo.asesorId !== null) {
      await conversacionEventoRepository.createEvento(
        { conversacionId: creada.id, empresaId: conexion.empresaId, usuarioId: ruteo.asesorId, tipo: "ASIGNADA" },
        tx,
      );
      events.push({
        userId: ruteo.asesorId,
        empresaId: conexion.empresaId,
        type: "whatsapp.conversacion-reasignada",
        data: { conversacionId: creada.id, asesorId: ruteo.asesorId },
      });
    }
    return { conversacionId: creada.id, asesorId: ruteo.asesorId, events };
  }

  if (ruteo.asesorId !== null && ruteo.asesorId !== existente.asesorId) {
    await conversacionRepository.updateAsesor(existente.id, ruteo.asesorId, tx);
    await conversacionEventoRepository.createEvento(
      {
        conversacionId: existente.id,
        empresaId: conexion.empresaId,
        usuarioId: ruteo.asesorId,
        tipo: "REASIGNADA_TRASPASO_LEAD",
      },
      tx,
    );
    events.push({
      userId: ruteo.asesorId,
      empresaId: conexion.empresaId,
      type: "whatsapp.conversacion-reasignada",
      data: { conversacionId: existente.id, asesorId: ruteo.asesorId },
    });
    return { conversacionId: existente.id, asesorId: ruteo.asesorId, events };
  }

  return { conversacionId: existente.id, asesorId: existente.asesorId, events };
}

/**
 * Sincroniza `Conversacion.asesorId` una vez que `assignAfterCommit` (D-A2,
 * `asignacion.service.ts`) ya resolvió el pool automático — corre SIEMPRE
 * DESPUÉS de esa llamada, nunca antes (post-commit, mismo espíritu que
 * `ingesta.service.ts::procesarRecepcion`). Si el pool no encontró
 * candidatos (`sin_candidatos`), la conversación queda sin asesor —
 * consistente con que el `Lead` tampoco tiene uno todavía.
 */
async function sincronizarAsesorTrasAsignacion(
  conversacionId: string,
  clienteId: string,
  empresaId: string,
): Promise<void> {
  const committed = await runWithTenantContext({ empresaId }, () =>
    prisma.$transaction(async (tx) => {
      const conversacion = await conversacionRepository.findByIdForUpdate(conversacionId, tx);
      if (!conversacion || conversacion.asesorId !== null) return [] as CommittedEvent[];

      const leadAbierto = await leadRepository.findLeadAbierto(clienteId, tx);
      if (!leadAbierto || leadAbierto.asesorId === null) return [] as CommittedEvent[];

      await conversacionRepository.updateAsesor(conversacionId, leadAbierto.asesorId, tx);
      await conversacionEventoRepository.createEvento(
        { conversacionId, empresaId, usuarioId: leadAbierto.asesorId, tipo: "ASIGNADA" },
        tx,
      );
      return [
        {
          userId: leadAbierto.asesorId,
          empresaId,
          type: "whatsapp.conversacion-reasignada",
          data: { conversacionId, asesorId: leadAbierto.asesorId },
        } satisfies CommittedEvent,
      ];
    }, ASIGNACION_TRANSACTION_BOUNDS),
  );
  publishCommittedEvents(committed);
}

/**
 * Punto de entrada único del webhook (rule 1/2/D-mensajería): resuelve
 * identidad de cliente, decide ruteo, persiste el mensaje entrante y — si
 * corresponde — crea un `Lead` nuevo y dispara la asignación automática por
 * pool, exactamente como cualquier otro bridge. Corre dentro del
 * `TenantContext` ya activo del llamador (`whatsapp-webhook.service.ts`,
 * `runWithTenantContext({ empresaId })`).
 */
export async function procesarMensajeEntrante(
  entrante: WhatsAppMensajeEntrante,
  conexion: { id: string; empresaId: string },
  ahora: Date = new Date(),
): Promise<void> {
  const { original, normalizado } = normalizarWaId(entrante.waId);

  const resultado = await runInTransaction(
    undefined,
    async (tx) => {
      const cliente = await clienteRepository.upsertByTelefonoNormalizado(
        { nombre: entrante.nombrePerfil, telefonoOriginal: original, telefonoNormalizado: normalizado, creadoEn: ahora },
        tx,
      );

      const ruteo = await resolverAsesorObjetivo(cliente.id, conexion.empresaId, ahora, tx);
      const aplicado = await applyRuteo(cliente.id, conexion, ruteo, ahora, tx);

      await mensajeRepository.upsertEntrante(
        {
          conversacionId: aplicado.conversacionId,
          idExternoMensaje: entrante.wamid,
          texto: entrante.texto,
          payloadOriginal: entrante.payloadOriginal as Prisma.InputJsonValue,
          enviadoEn: entrante.enviadoEn,
        },
        tx,
      );
      // `applyRuteo` ya persiste `ultimoMensajeEn` en la creación; un mensaje
      // sobre una conversación EXISTENTE también debe reflejarlo, haya o no
      // cambiado el asesor.
      await conversacionRepository.touchUltimoMensajeEn(aplicado.conversacionId, entrante.enviadoEn, tx);

      const eventosMensaje: CommittedEvent[] = aplicado.asesorId
        ? [
            {
              userId: aplicado.asesorId,
              empresaId: conexion.empresaId,
              type: "whatsapp.mensaje-nuevo",
              data: { conversacionId: aplicado.conversacionId },
            },
          ]
        : [];

      return {
        clienteId: cliente.id,
        conversacionId: aplicado.conversacionId,
        leadCreadoId: ruteo.leadCreadoId,
        events: [...aplicado.events, ...eventosMensaje],
      };
    },
    ASIGNACION_TRANSACTION_BOUNDS,
  );

  publishCommittedEvents(resultado.events);

  if (resultado.leadCreadoId) {
    await assignAfterCommit(resultado.leadCreadoId, ahora);
    await sincronizarAsesorTrasAsignacion(resultado.conversacionId, resultado.clienteId, conexion.empresaId);
  }
}
