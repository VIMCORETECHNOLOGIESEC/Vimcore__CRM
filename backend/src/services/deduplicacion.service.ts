import type { Lead, OrigenLead, Prisma, RedSocial } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { normalizeCorreo } from "../lib/correo.js";
import { logger } from "../lib/logger.js";
import { DEDUPLICACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import { normalizeTelefono } from "../lib/telefono.js";
import * as clienteRepository from "../repositories/cliente.repository.js";
import * as correoClienteRepository from "../repositories/correo-cliente.repository.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import * as notificacionRepository from "../repositories/notificacion.repository.js";
import { notificationEvents, publishCommittedEvents, type CommittedEvent } from "./committed-events.service.js";
import { resolverAtribucion, resolverEmpresaIdDesdeBridge, type AtribucionResuelta } from "./atribucion.service.js";
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
  /**
   * M-hardening Bloque A (WU4, spec lead-attribution, D6): igual criterio de
   * opcionalidad que los tres campos de arriba — un `LeadEntrante` completo
   * (M4) los trae todos juntos; un `DeduplicacionInput` levantado a mano
   * (pruebas de M3) los deja `undefined` y la atribución degrada a `null`
   * sin romper.
   */
  bridgeId?: string;
  idExternoCuenta?: string | null;
  idExternoCampania?: string | null;
  nombreCampania?: string | null;
  /**
   * Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico"):
   * resuelto por el llamador (`leads-manual.service.ts`) para el camino
   * sin-bridge — ingreso manual y carga masiva. Cuando `bridgeId` está
   * presente, este campo se ignora por completo (el camino de webhook NO
   * cambia de comportamiento, sigue resolviendo `empresaId` exclusivamente
   * vía `resolverEmpresaIdDesdeBridge`).
   */
  empresaId?: string;
  /**
   * Bloque D (diseño): `origen = MANUAL` referencia un `CanalManual` de la
   * empresa resuelta — igual criterio de opcionalidad que el resto de los
   * campos de atribución de este archivo.
   */
  canalManualId?: string;
  /**
   * Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico"):
   * `decideAccionDeduplicacion` (deduplicacion.decider.ts) SOLO conoce dos
   * valores de `origen` para `crear_lead` (`NUEVO`/`REINGRESO`, derivados del
   * estado del cliente — primera vez vs. reingreso tras cierre) y no acepta
   * un tercer valor por diseño (esa distinción temporal es ortogonal al
   * canal de entrada). `leads-manual.service.ts` necesita forzar `MANUAL`
   * incondicionalmente, sin importar si el cliente ya tuvo un lead cerrado
   * antes — así que este override gana sobre `accion.origen` SOLO en la rama
   * `crear_lead`, cuando viene poblado. `undefined` en cualquier otro
   * llamador (webhook/bridge, ~25 casos existentes de
   * `deduplicacion.service.test.ts`) preserva el comportamiento previo
   * exacto: `accion.origen` decide, sin cambio.
   */
  origenOverride?: OrigenLead;
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
  empresaId: string;
  /** M4/M6: solo si es `true` corren asignación y SLA. */
  leadCreado: boolean;
  eventoId: string;
  accion: DeduplicacionAction;
  /** Intenciones que debe publicar el dueño de una transacción externa tras el commit. */
  events: CommittedEvent[];
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

  const outcome = await runInTransaction(
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
      // Fix (D2, "Frontera de identidad y deduplicación" — resuelto
      // 2026-08-25, docs/16-hallazgos-y-preguntas.md §8): "el chequeo de
      // lead abierto para bloquear duplicados deja de evaluarse por cliente
      // y pasa a evaluarse por (cliente, empresa)". Reemplaza al comparador
      // en sombra (`shadow-lead-scope.service.ts`, retirado): ese archivo
      // solo OBSERVABA esta divergencia sin corregirla — 10 casos reales ya
      // detectados en producción, cliente con lead abierto de la empresa A
      // absorbiendo silenciosamente ingestas nuevas de las empresas B/C/D
      // como "interacción repetida" ajena. `empresaIdCandidato` se resuelve
      // ACÁ (antes solo se resolvía más abajo, dentro de la rama
      // `crear_lead`, vía `resolverAtribucion`) porque este paso ya lo
      // necesita para acotar la búsqueda; la rama `crear_lead` re-resuelve su
      // propia atribución completa más abajo (mismo empresaId, más
      // cuenta/campaña) — recomputar esa única lectura de `Bridge` es más
      // simple que enhebrar el valor ya resuelto a través de
      // `resolverAtribucion`, y es barata (misma transacción, sin I/O
      // externo).
      const empresaIdCandidato = entrada.bridgeId
        ? await resolverEmpresaIdDesdeBridge(entrada.bridgeId, tx)
        : (entrada.empresaId ?? null);

      // `empresaIdCandidato === null` (bridgeId inexistente/sin empresa, o
      // ni bridgeId ni empresaId en la entrada): no hay a qué empresa acotar
      // la búsqueda, así que se trata como "sin lead abierto" sin consultar
      // la BD — nunca se cae de vuelta a la búsqueda global vieja (eso
      // reabriría exactamente el bug que este fix cierra). Si la entrada
      // termina siendo una creación, el guard `empresa_no_resuelta` de la
      // rama `crear_lead` (abajo) rechaza la ingesta igual.
      const leadAbierto =
        empresaIdCandidato !== null
          ? await leadRepository.findLeadAbierto(clienteId, empresaIdCandidato, tx)
          : null;
      const ultimoLeadCerradoRow =
        empresaIdCandidato !== null
          ? await leadRepository.findUltimoLeadCerrado(clienteId, empresaIdCandidato, tx)
          : null;
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
      // Bloque C (Etapa 3, D4): empresaId del `lead_eventos` a escribir —
      // fijado en cada rama de abajo (creación usa el `Lead` recién creado;
      // interacción repetida reutiliza `leadAbierto`, paso C, misma `tx`).
      let empresaIdEvento: string;

      if (accion.kind === "crear_lead") {
        // M-hardening Bloque A (WU4, spec lead-attribution, D6): solo se
        // intenta resolver atribución si la entrada trae `bridgeId` — un
        // `DeduplicacionInput` levantado a mano (M3, sin M4) nunca lo trae,
        // y `resolverAtribucion` necesita `bridgeId` para el primer paso del
        // lookup. Sin `bridgeId`, las 5 columnas quedan `null`/lo que venga
        // crudo en la entrada, mismo criterio de degradación silenciosa.
        const atribucion: AtribucionResuelta = entrada.bridgeId
          ? await resolverAtribucion(
              {
                bridgeId: entrada.bridgeId,
                idExternoCuenta: entrada.idExternoCuenta ?? null,
                idExternoCampania: entrada.idExternoCampania ?? null,
                nombreCampania: entrada.nombreCampania ?? null,
              },
              tx,
            )
          : {
              cuentaPublicitariaId: null,
              campaniaId: null,
              idExternoCuenta: entrada.idExternoCuenta ?? null,
              idExternoCampania: entrada.idExternoCampania ?? null,
              nombreCampania: entrada.nombreCampania ?? null,
              empresaId: null,
            };

        // Bloque C (D4, Fase 2/Stage 2 — cutover bloqueante): `Lead.empresaId`
        // es NOT NULL — un `Lead` que no pueda resolver su empresa ya no
        // degrada en silencio a `null` (comportamiento retirado, era el
        // camino "compatibilidad M3" documentado arriba). `resolverAtribucion`
        // solo devuelve `empresaId: null` cuando falta `entrada.bridgeId` o el
        // bridge referenciado no existe — ambos casos son un dato de entrada
        // inválido para crear un lead real, nunca un estado normal de
        // producción (la ingesta real siempre trae `bridgeId`, y
        // `Bridge.empresaId` es NOT NULL desde esta misma migración).
        //
        // Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico"):
        // fallback ADITIVO — solo se evalúa cuando `entrada.bridgeId` está
        // ausente (el camino de webhook con `bridgeId` no cambia: sigue
        // resolviendo exclusivamente vía `resolverAtribucion`, arriba).
        // `entrada.empresaId` lo resuelve SIEMPRE el llamador nuevo
        // (`leads-manual.service.ts`) antes de invocar `deduplicateLead` — si
        // de todos modos llegara ausente acá (nunca debería, defensa en
        // profundidad), se preserva el mismo 422 `empresa_no_resuelta` de
        // siempre en vez de crear un lead huérfano.
        const empresaIdResuelta = atribucion.empresaId ?? entrada.empresaId ?? null;
        if (empresaIdResuelta === null) {
          throw new AppError(
            "empresa_no_resuelta",
            422,
            "No se pudo resolver la empresa del lead — falta bridgeId o el bridge no existe",
          );
        }

        const lead = await leadRepository.createLead(
          {
            clienteId,
            origen: entrada.origenOverride ?? accion.origen,
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
            // WU4: atribución canónica + escalares crudos, siempre juntos.
            cuentaPublicitariaId: atribucion.cuentaPublicitariaId,
            campaniaId: atribucion.campaniaId,
            idExternoCuenta: atribucion.idExternoCuenta,
            idExternoCampania: atribucion.idExternoCampania,
            nombreCampania: atribucion.nombreCampania,
            // Bloque B (Fase 3, spec lead-empresa-derivation): dual-write —
            // los campos legado de arriba quedan intactos, `empresaId` es
            // puramente aditivo.
            empresaId: empresaIdResuelta,
            // Bloque D (diseño): `undefined` en todo camino con bridge —
            // `createLead`/Prisma preservan el comportamiento previo (columna
            // NULL), sin romper ninguna llamada existente.
            canalManualId: entrada.canalManualId,
          },
          tx,
        );
        leadId = lead.id;
        leadCreado = true;
        empresaIdEvento = lead.empresaId;
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
        // Bloque C (Etapa 3, D4): `accion.leadId` puede ser `leadAbierto.id`
        // (lead abierto repetido) O `ultimoLeadCerrado.id` (motivo
        // `lead_cerrado_en_ventana`, reingreso dentro de la ventana) — solo
        // el primero coincide con `leadAbierto`, así que se relee el lead
        // real por id en vez de asumir cuál de los dos es.
        empresaIdEvento = (await leadRepository.findById(accion.leadId, tx) as Lead).empresaId;
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
          empresaId: empresaIdEvento,
          tipo: tipoEvento,
          detalle: detalle as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      const events: CommittedEvent[] = [];
      if (tipoEvento === "INTERACCION_REPETIDA") {
        const currentLead = await leadRepository.findById(leadId, tx);
        const recipientId = currentLead?.vendedorId ?? currentLead?.asesorId;
        if (recipientId) {
          const notification = await notificacionRepository.createNotificacion({ usuarioId: recipientId, tipo: "INTERACCION_REPETIDA", titulo: "Interacción repetida", mensaje: "El lead registró una nueva interacción", leadId, empresaId: empresaIdEvento }, tx);
          events.push(...notificationEvents(notification));
        }
      }
      return {
        clienteId,
        clienteCreado,
        telefonoValido: telefono.valido,
        identidadPor,
        correoAdjuntado,
        leadId,
        empresaId: empresaIdEvento,
        leadCreado,
        eventoId: evento.id,
        accion,
        events,
      };
    },
    DEDUPLICACION_TRANSACTION_BOUNDS,
  );
  if (txExterna === undefined) {
    publishCommittedEvents(outcome.events);
    return { ...outcome, events: [] };
  }
  return outcome;
}
