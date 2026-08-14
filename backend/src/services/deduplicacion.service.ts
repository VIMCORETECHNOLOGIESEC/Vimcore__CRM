import type { Prisma, RedSocial } from "@prisma/client";
import { normalizeCorreo } from "../lib/correo.js";
import { logger } from "../lib/logger.js";
import { DEDUPLICACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import { normalizeTelefono } from "../lib/telefono.js";
import * as clienteRepository from "../repositories/cliente.repository.js";
import * as correoClienteRepository from "../repositories/correo-cliente.repository.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import {
  decideAccionDeduplicacion,
  type DeduplicacionAction,
  type DeduplicacionState,
} from "./deduplicacion.decider.js";

/**
 * Subconjunto estructural exacto de `LeadEntrante` (docs/05-bridges.md §2):
 * M4 pasa un `LeadEntrante` completo sin adaptación.
 */
export interface DeduplicacionInput {
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  ingresadoEn: Date;
  /**
   * M5 (DD1, diseño M5, finding): opcionales — un `DeduplicacionInput`
   * levantado a mano (p. ej. pruebas de M3 sin M4) no los trae, pero un
   * `LeadEntrante` completo (M4) siempre los trae los tres juntos. Antes de
   * esta rebanada, `createLead` los descartaba pese a estar disponibles
   * aquí — quedaban NULL para siempre en `leads`.
   */
  redSocial?: RedSocial;
  payloadOriginal?: unknown;
  camposDinamicos?: Record<string, unknown>;
}

export interface DeduplicacionResult {
  clienteId: string;
  clienteCreado: boolean;
  telefonoValido: boolean;
  /** Qué rama resolvió la identidad (D3 vs D7). */
  identidadPor: "telefono" | "correo" | "nueva";
  correoAdjuntado: boolean;
  /** Lead creado, o lead al que se ancló el evento de interacción repetida. */
  leadId: string;
  /** M4/M6: solo si es `true` corren asignación y SLA. */
  leadCreado: boolean;
  eventoId: string;
  accion: DeduplicacionAction;
}

/**
 * Forma exacta de `lead_eventos.detalle` (D9, diseño M3). `version` permite
 * un bump aditivo de esquema sin reescribir filas; `responsableId` es un
 * slot de sobreescritura — M8 resuelve el destinatario real desde
 * `lead.asesor_id` en el momento de la entrega, y solo usa este campo
 * cuando no es `null`.
 */
export interface DetalleEventoLead {
  version: 1;
  requiereNotificacion: boolean;
  motivo: "ingreso" | "lead_abierto" | "lead_cerrado_en_ventana";
  responsableId: string | null;
  diasDesdeCierre?: number | null;
  clienteCreado?: boolean;
  telefonoValido: boolean;
  identidadPor: "telefono" | "correo" | "nueva";
  correoAdjuntado: boolean;
}

/**
 * Punto de entrada D6 (diseño M3). Una única `prisma.$transaction` sin
 * `isolationLevel` (READ COMMITTED, obligatorio: bajo REPEATABLE READ el
 * `DO UPDATE` del perdedor de la carrera lanzaría 40001 en vez de bloquear).
 * Orden estricto — A (identidad) va PRIMERO: su lock serializa a los
 * llamadores concurrentes, así el perdedor, al reanudar, ya ve en C el
 * lead comprometido por el ganador ("Why there is no second race", diseño).
 *   A. IDENTIDAD → B. ADJUNTAR CORREO → C. LEER ESTADO → D. DECIDIR → E. ESCRIBIR
 * `lead_eventos` se escribe en la MISMA transacción que su causa, siempre
 * (docs/03-modelo-datos.md §2, bitácora inmutable).
 *
 * `txExterna` (M4, DD1c): si el llamador (p. ej. `ingesta.service`) ya abrió
 * una transacción, `deduplicateLead` corre dentro de ella en vez de abrir la
 * suya propia — ver `runInTransaction` en `lib/prisma.ts`.
 */
export async function deduplicateLead(
  entrada: DeduplicacionInput,
  ahora: Date = new Date(),
  txExterna?: Prisma.TransactionClient,
): Promise<DeduplicacionResult> {
  const telefono = normalizeTelefono(entrada.telefono);
  const correo = normalizeCorreo(entrada.correo);

  return runInTransaction(
    txExterna,
    async (tx) => {
      // A. IDENTIDAD — primera sentencia de la transacción, sin excepciones.
      let clienteId: string;
      let clienteCreado: boolean;
      let identidadPor: "telefono" | "correo" | "nueva";

      if (telefono.valido) {
        const cliente = await clienteRepository.upsertByTelefonoNormalizado(
          {
            nombre: entrada.nombre,
            telefonoOriginal: telefono.original,
            telefonoNormalizado: telefono.normalizado,
            creadoEn: ahora,
          },
          tx,
        );
        clienteId = cliente.id;
        clienteCreado = cliente.clienteCreado;
        identidadPor = "telefono";
      } else {
        // D7: teléfono inválido, respaldo por correo (si viene).
        const existente =
          correo !== null
            ? await clienteRepository.findByCorreoNormalizado(correo.normalizado, tx)
            : null;
        if (existente !== null) {
          clienteId = existente.id;
          clienteCreado = false;
          identidadPor = "correo";
        } else {
          const nuevo = await clienteRepository.createWithoutTelefono(
            { nombre: entrada.nombre, telefonoOriginal: telefono.original, creadoEn: ahora },
            tx,
          );
          clienteId = nuevo.id;
          clienteCreado = true;
          identidadPor = "nueva";
        }
      }

      if (!telefono.valido) {
        logger.warn(
          { telefonoOriginal: entrada.telefono, clienteId },
          "deduplicacion: telefono invalido, identidad resuelta por correo o cliente nuevo",
        );
      }

      // B. ADJUNTAR CORREO.
      let correoAdjuntado = false;
      if (correo !== null) {
        const resultado = await correoClienteRepository.attachCorreo(
          { clienteId, correo: correo.original, correoNormalizado: correo.normalizado },
          tx,
        );
        correoAdjuntado = resultado.correoAdjuntado;
      }

      // C. LEER ESTADO.
      const leadAbierto = await leadRepository.findLeadAbierto(clienteId, tx);
      const ultimoLeadCerradoRow = await leadRepository.findUltimoLeadCerrado(
        clienteId,
        tx,
      );
      // Invariante de negocio: un lead cerrado siempre tiene `cerradoEn`; si
      // esa invariante se rompiera, se trata como "sin lead cerrado" en vez
      // de romper el flujo con una aserción no nula.
      const ultimoLeadCerrado =
        ultimoLeadCerradoRow !== null && ultimoLeadCerradoRow.cerradoEn !== null
          ? { id: ultimoLeadCerradoRow.id, cerradoEn: ultimoLeadCerradoRow.cerradoEn }
          : null;

      const estado: DeduplicacionState = {
        clienteId,
        leadAbierto: leadAbierto !== null ? { id: leadAbierto.id } : null,
        ultimoLeadCerrado,
      };

      // D. DECIDIR.
      const accion = decideAccionDeduplicacion(estado, ahora);

      // E. ESCRIBIR — siempre un lead_eventos, en la misma transacción.
      let leadId: string;
      let leadCreado: boolean;
      let detalle: DetalleEventoLead;
      let tipoEvento: "INGRESO" | "INTERACCION_REPETIDA";

      if (accion.kind === "crear_lead") {
        const lead = await leadRepository.createLead(
          {
            clienteId,
            origen: accion.origen,
            ingresadoEn: entrada.ingresadoEn,
            // M5 (DD1 fix): antes de esta rebanada estos tres campos nunca
            // se pasaban pese a venir en `entrada` (LeadEntrante completo
            // cuando el llamador es `ingesta.service.ts`) — quedaban NULL
            // para siempre en `leads`. Cuando `entrada` no los trae (p. ej.
            // pruebas de M3 que no simulan un `LeadEntrante` de M4) quedan
            // `undefined` y `createLead` preserva el comportamiento previo.
            redSocial: entrada.redSocial,
            payloadOriginal: entrada.payloadOriginal as Prisma.InputJsonValue | undefined,
            camposDinamicos: entrada.camposDinamicos as Prisma.InputJsonValue | undefined,
          },
          tx,
        );
        leadId = lead.id;
        leadCreado = true;
        tipoEvento = "INGRESO";
        detalle = {
          version: 1,
          requiereNotificacion: false,
          motivo: "ingreso",
          responsableId: null,
          clienteCreado,
          telefonoValido: telefono.valido,
          identidadPor,
          correoAdjuntado,
        };
      } else {
        // D9: ambas ramas de `interaccion_repetida` marcan requiereNotificacion.
        leadId = accion.leadId;
        leadCreado = false;
        tipoEvento = "INTERACCION_REPETIDA";
        detalle = {
          version: 1,
          requiereNotificacion: true,
          motivo: accion.motivo,
          responsableId: null,
          diasDesdeCierre:
            accion.motivo === "lead_cerrado_en_ventana" ? accion.diasDesdeCierre : null,
          telefonoValido: telefono.valido,
          identidadPor,
          correoAdjuntado,
        };
      }

      const evento = await leadEventoRepository.createEvento(
        {
          leadId,
          tipo: tipoEvento,
          detalle: detalle as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return {
        clienteId,
        clienteCreado,
        telefonoValido: telefono.valido,
        identidadPor,
        correoAdjuntado,
        leadId,
        leadCreado,
        eventoId: evento.id,
        accion,
      };
    },
    DEDUPLICACION_TRANSACTION_BOUNDS,
  );
}
