import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { decrypt } from "../lib/cifrado-token.js";
import { logger } from "../lib/logger.js";
import * as cuentaPublicitariaRepository from "../repositories/cuenta-publicitaria.repository.js";
import * as leadRecibidoRepository from "../repositories/lead-recibido.repository.js";
import { adaptMeta } from "../adapters/meta.adapter.js";
import type { LeadEntrante } from "../types/lead-entrante.js";
import {
  metaLeadgenDetalleSchema,
  type MetaLeadgenDetalle,
  type MetaWebhookNotificationBody,
} from "../schemas/meta-webhook.schema.js";
import { registrarBridgeLog } from "./bridge-log.service.js";

// QA local (test/integration): `env.META_GRAPH_API_BASE_URL` solo existe
// seteado dentro de ese docker-compose (ver config/env.ts) — en cualquier
// otro entorno queda `undefined` y se usa la URL real de Meta sin cambio de
// comportamiento.
export const GRAPH_API_BASE_URL = env.META_GRAPH_API_BASE_URL ?? "https://graph.facebook.com";
const DETALLE_CAMPOS = "field_data,ad_id,form_id,campaign_id,campaign_name,ad_name";

/** 3 intentos totales (docs/05-bridges.md §8): 2 backoffs entre los 3, exponencial (250ms, 500ms). */
export const META_DETALLE_MAX_INTENTOS = 3;
const META_DETALLE_BACKOFF_MS: readonly number[] = [250, 500];

/**
 * Handshake de suscripción (docs/05-bridges.md §3, `GET`, una sola vez al
 * configurar el webhook en el dashboard de Meta App — no por Página). Pura:
 * sin I/O, para no acoplar el controller a `env` directamente.
 */
export function verificarHandshake(mode: string, verifyToken: string): boolean {
  return mode === "subscribe" && verifyToken === env.META_WEBHOOK_VERIFY_TOKEN;
}

function esperarMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ClasificacionErrorGraphApi {
  tokenInvalido: boolean;
  mensaje: string;
}

/**
 * Meta reporta un token inválido/revocado con `error.code === 190`
 * (`OAuthException`, Graph API error reference) o un `401` HTTP directo.
 * Cualquier otro fallo (red, 5xx, rate limit, timeout) se trata como
 * transitorio y entra al reintento con backoff — nunca se agota el
 * presupuesto de reintentos contra un token que ya se sabe que no sirve, y
 * nunca se marca `TOKEN_EXPIRADO` ante un fallo simplemente transitorio.
 */
function clasificarErrorGraphApi(status: number, cuerpo: unknown): ClasificacionErrorGraphApi {
  const error = (cuerpo as { error?: { code?: number; message?: string } } | null)?.error;
  const mensaje = error?.message ?? `Graph API respondió HTTP ${status}`;
  return { tokenInvalido: error?.code === 190 || status === 401, mensaje };
}

type ResultadoDetalle =
  | { ok: true; detalle: MetaLeadgenDetalle }
  | { ok: false; tokenInvalido: boolean; mensaje: string };

/**
 * `GET /{leadgen_id}?fields=...` con el Page Access Token (docs/05-bridges.md
 * §3), reintento con backoff exponencial hasta `META_DETALLE_MAX_INTENTOS`
 * (docs/05-bridges.md §8). Un token inválido/revocado corta el bucle de
 * inmediato en el PRIMER intento que lo detecta — seguir reintentando no
 * cambiaría el resultado.
 */
async function consultarDetalleLead(
  leadgenId: string,
  tokenAccesoPagina: string,
): Promise<ResultadoDetalle> {
  const url = `${GRAPH_API_BASE_URL}/${encodeURIComponent(leadgenId)}?fields=${DETALLE_CAMPOS}&access_token=${encodeURIComponent(tokenAccesoPagina)}`;

  let ultimoMensaje = "Error desconocido al consultar Graph API";

  for (let intento = 1; intento <= META_DETALLE_MAX_INTENTOS; intento++) {
    try {
      const respuesta = await fetch(url);
      const cuerpo: unknown = await respuesta.json().catch(() => null);

      if (respuesta.ok) {
        const parsed = metaLeadgenDetalleSchema.safeParse(cuerpo);
        if (parsed.success) return { ok: true, detalle: parsed.data };
        ultimoMensaje = "Graph API devolvió una respuesta con forma inesperada";
      } else {
        const clasificacion = clasificarErrorGraphApi(respuesta.status, cuerpo);
        if (clasificacion.tokenInvalido) {
          return { ok: false, tokenInvalido: true, mensaje: clasificacion.mensaje };
        }
        ultimoMensaje = clasificacion.mensaje;
      }
    } catch (error) {
      ultimoMensaje = error instanceof Error ? error.message : "Error de red desconocido";
    }

    const quedanReintentos = intento < META_DETALLE_MAX_INTENTOS;
    if (quedanReintentos) {
      await esperarMs(META_DETALLE_BACKOFF_MS[intento - 1] as number);
    }
  }

  return { ok: false, tokenInvalido: false, mensaje: ultimoMensaje };
}

/**
 * `registrarBridgeLog` en su propio `try/catch` degradando a `logger.error`
 * (mismo criterio que `ingesta.service.ts::registrarLogSeguro`/
 * `asignacion.service.ts::recordAssignmentDegradation`, DD5 diseño M4):
 * un fallo al loguear nunca debe interrumpir el procesamiento del resto de
 * la notificación ni convertir la respuesta del webhook en algo distinto de
 * 200.
 */
async function registrarLogSeguro(
  data: Parameters<typeof registrarBridgeLog>[0],
): Promise<void> {
  try {
    await registrarBridgeLog(data);
  } catch (error) {
    logger.error({ err: error, bridgeId: data.bridgeId }, "meta-webhook: fallo al registrar bridge_logs");
  }
}

/**
 * Encolado (2026-08-18, cambio consciente: webhook de Meta pasado al patrón
 * durable de M4 — buzón PostgreSQL `leads_recibidos` con idempotencia, lease
 * y recuperación, igual que `POST /api/v1/ingesta/generico`). SÍNCRONO
 * dentro del request del webhook, pero acotado a una sola lectura de
 * `CuentaPublicitaria` (para resolver el `bridgeId`, obligatorio en
 * `leads_recibidos` por FK) — a diferencia de la consulta de detalle contra
 * Graph API (con sus reintentos), esto nunca es lento ni depende de una API
 * externa. Si no hay `CuentaPublicitaria` para la Página, no hay `bridgeId`
 * válido para encolar: se registra ERROR y se descarta ese `leadgen_id` en
 * particular (docs/05-bridges.md §8, "no se pierde un lead" no aplica acá —
 * no hay ningún bridge dueño de ese lead que pueda reprocesarlo).
 *
 * El chequeo de `estadoToken` YA NO corre acá — se movió al worker
 * (`resolverLeadgenMeta`, más abajo) junto con la consulta de detalle. Un
 * `leadgen_id` de una Página con token no vigente se encola igual: el
 * fallo (y el registro en `bridge_logs`) ocurre recién cuando el worker lo
 * reclama, no en el momento de recibir el webhook.
 */
export async function encolarLeadgenMeta(
  leadgenId: string,
  pageId: string,
  recibidoEn: Date = new Date(),
): Promise<void> {
  const cuenta = await cuentaPublicitariaRepository.findByIdExternoConBridge(pageId);

  if (cuenta === null) {
    await registrarLogSeguro({
      bridgeId: null,
      nivel: "ERROR",
      mensaje: `Meta: no se encontró ninguna CuentaPublicitaria para la Página ${pageId}`,
      payload: { leadgenId, pageId },
    });
    return;
  }

  await leadRecibidoRepository.aceptarLeadgenMetaPendiente(
    { bridgeId: cuenta.bridgeId, leadgenId, pageId },
    recibidoEn,
  );
}

/**
 * Orquesta una notificación completa del webhook (docs/05-bridges.md §2,
 * §3): puede traer varios `entry`/`changes` en un solo POST. Cada
 * `leadgen_id` se encola de forma independiente — el fallo al encolar uno
 * (cuenta no encontrada) nunca aborta el resto ni hace que el controller
 * responda distinto de 200 (Requirement: no se pierde un lead por un fallo
 * ajeno a la recepción del webhook en sí). El procesamiento real (consulta
 * de detalle, mapeo, dedupe) ya NO ocurre acá — ver `resolverLeadgenMeta` y
 * `ingesta.service.ts::procesarRecepcion`.
 */
export async function procesarNotificacionMeta(body: MetaWebhookNotificationBody): Promise<void> {
  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue;
      await encolarLeadgenMeta(change.value.leadgen_id, change.value.page_id);
    }
  }
}

/**
 * Resuelve un `LeadEntrante` completo a partir de un sobre
 * `META_PENDIENTE_DETALLE` ya encolado (2026-08-18, cambio consciente: TODO
 * lo que antes corría síncrono en el controller — cuenta, chequeo de
 * `estadoToken`, consulta de detalle con sus 3 reintentos, actualización de
 * `estadoToken` ante token inválido — corre acá, en el worker, DESPUÉS del
 * commit del recibo (`ingesta.service.ts::procesarRecepcion`, llamador
 * único). Nunca llama a `ingestarLead`: a diferencia del flujo previo, ya no
 * hay una segunda inserción a `leads_recibidos` que hacer — la fila ya existe
 * (el `POST` la encoló) y es tarea del llamador completar esa misma fila vía
 * `deduplicateLead`/`completeClaim`, exactamente igual que un sobre v1.
 *
 * Cada rama de fallo (cuenta no encontrada, token no vigente, Graph API
 * agotando reintentos) registra el mismo `bridge_logs` ERROR que antes y
 * LANZA en vez de retornar silenciosamente — así el llamador (`ingesta-
 * inbox.job.ts::runIngestionOnce`) reutiliza el mecanismo de reintento con
 * backoff (60s/300s) y `FALLA_MANUAL` ya existente para toda la ingesta
 * durable (docs/05-bridges.md §8, "registrar el leadgen_id para reproceso
 * manual"), en vez de inventar un mecanismo de reintento nuevo solo para
 * Meta.
 */
export async function resolverLeadgenMeta(pendiente: {
  leadgenId: string;
  pageId: string;
}): Promise<LeadEntrante> {
  const { leadgenId, pageId } = pendiente;
  const cuenta = await cuentaPublicitariaRepository.findByIdExternoConBridge(pageId);

  if (cuenta === null) {
    const mensaje = `Meta: no se encontró ninguna CuentaPublicitaria para la Página ${pageId}`;
    await registrarLogSeguro({ bridgeId: null, nivel: "ERROR", mensaje, payload: { leadgenId, pageId } });
    throw new AppError("meta_cuenta_no_encontrada", 500, mensaje);
  }

  if (cuenta.estadoToken !== "VALIDO" || cuenta.tokenCifrado === null) {
    // Token ya conocido como no vigente (o nunca cargado): no gastar los 3
    // reintentos contra Graph API con un token que ya se sabe que no sirve
    // (docs/05-bridges.md §8) — `registrarBridgeLog` en nivel ERROR ya
    // notifica a los administradores (`bridge-log.service.ts`).
    const mensaje =
      cuenta.tokenCifrado === null
        ? `Meta: la Página ${pageId} todavía no tiene Page Access Token cargado — se omite la consulta de detalle`
        : `Meta: token de la Página ${pageId} no vigente (${cuenta.estadoToken}) — se omite la consulta de detalle`;
    await registrarLogSeguro({
      bridgeId: cuenta.bridgeId,
      nivel: "ERROR",
      mensaje,
      payload: { leadgenId, pageId, estadoToken: cuenta.estadoToken },
    });
    throw new AppError("meta_token_no_vigente", 500, mensaje);
  }

  const tokenAccesoPagina = decrypt(cuenta.tokenCifrado);
  const resultado = await consultarDetalleLead(leadgenId, tokenAccesoPagina);

  if (!resultado.ok) {
    if (resultado.tokenInvalido) {
      await cuentaPublicitariaRepository.updateEstadoToken(cuenta.id, "TOKEN_EXPIRADO");
    }
    const mensaje = resultado.tokenInvalido
      ? `Meta: token de la Página ${pageId} inválido/revocado — marcado TOKEN_EXPIRADO`
      : `Meta: fallo al consultar el detalle del lead ${leadgenId} tras ${META_DETALLE_MAX_INTENTOS} intentos — pendiente de reproceso manual`;
    await registrarLogSeguro({
      bridgeId: cuenta.bridgeId,
      nivel: "ERROR",
      mensaje,
      payload: { leadgenId, pageId, mensaje: resultado.mensaje },
    });
    throw new AppError("meta_detalle_no_disponible", 500, mensaje);
  }

  return adaptMeta(resultado.detalle, cuenta.bridgeId, cuenta.idExterno, cuenta.bridge.redSocial);
}
