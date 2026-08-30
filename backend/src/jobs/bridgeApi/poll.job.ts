import type { Bridge } from "@prisma/client";
import { adaptApiExterna } from "../../adapters/bridgeApi/api-externa.adapter.js";
import { decrypt } from "../../lib/cifrado-token.js";
import { logger } from "../../lib/logger.js";
import { runWithTenantContext } from "../../lib/prisma.js";
import * as bridgeLogRepository from "../../repositories/bridge-log.repository.js";
import * as bridgeRepository from "../../repositories/bridge.repository.js";
import * as leadRecibidoRepository from "../../repositories/lead-recibido.repository.js";
import { consultarLeadsExternos } from "../../services/bridgeApi/cliente-externo.service.js";
import type { ConfiguracionBridgeApi } from "../../types/bridgeApi/configuracion-bridge-api.js";

/**
 * 2 minutos: valor de arranque, no una decisión de negocio cerrada -- balance
 * entre frescura del lead y carga sobre el servidor del cliente. Fácil de
 * ajustar acá si hace falta otro cadence.
 */
export const INTERVALO_BRIDGE_API_POLL_MS = 2 * 60 * 1000;

/**
 * Margen de solapamiento al usar `parametroFecha`: sin esto, dos leads que
 * existen en la API externa pero que ese servidor todavía no terminó de
 * indexar en el momento exacto del poll anterior (consistencia eventual del
 * lado del cliente, fuera de nuestro control) quedarían huérfanos para
 * siempre -- el próximo poll ya filtraría desde un `desde` posterior al
 * suyo. El costo de este margen es cero: los leads que ya se aceptaron
 * vuelven a llegar, pero `LeadRecibido.@@unique([bridgeId, idExternoLead])`
 * los descarta sin volver a procesarlos.
 */
const MARGEN_SOLAPAMIENTO_MS = 5 * 60 * 1000;

async function registrarLogSeguro(
  bridge: Bridge,
  nivel: "ADVERTENCIA" | "ERROR",
  mensaje: string,
  payload?: unknown,
): Promise<void> {
  // Mismo criterio documentado en bridge-log.repository.ts (DD5): un fallo
  // al loguear nunca debe tumbar el poll ni enmascarar el error original.
  try {
    await bridgeLogRepository.registrarLog({
      bridgeId: bridge.id,
      empresaId: bridge.empresaId,
      nivel,
      mensaje,
      payload,
    });
  } catch (err) {
    logger.error({ err, bridgeId: bridge.id }, "bridgeApi: fallo al registrar bridge_log");
  }
}

async function pollUnBridge(bridge: Bridge): Promise<void> {
  const configuracion = bridge.configuracionJson as Partial<ConfiguracionBridgeApi> | null;

  // Config incompleta (admin todavía cargando conexión/mapeo): estado
  // transitorio normal, no un error -- se salta en silencio, sin bridge_log.
  if (!configuracion?.url || !configuracion.mapeoCampos || bridge.credencialExternaCifrada === null) {
    return;
  }

  let credencial: string;
  try {
    credencial = decrypt(bridge.credencialExternaCifrada);
  } catch {
    await registrarLogSeguro(bridge, "ERROR", "bridgeApi: no se pudo descifrar la credencial guardada");
    return;
  }

  const desde = configuracion.parametroFecha && bridge.ultimoLeadEn
    ? new Date(bridge.ultimoLeadEn.getTime() - MARGEN_SOLAPAMIENTO_MS)
    : undefined;

  const resultado = await consultarLeadsExternos(configuracion, credencial, desde);
  if (!resultado.ok) {
    await registrarLogSeguro(bridge, "ERROR", `bridgeApi: fallo el poll -- ${resultado.mensaje}`);
    return;
  }

  let aceptados = 0;
  for (const itemCrudo of resultado.leads) {
    if (typeof itemCrudo !== "object" || itemCrudo === null) {
      await registrarLogSeguro(bridge, "ADVERTENCIA", "bridgeApi: item descartado -- no es un objeto JSON", itemCrudo);
      continue;
    }

    let leadEntrante;
    try {
      leadEntrante = adaptApiExterna(
        itemCrudo as Record<string, unknown>,
        configuracion.mapeoCampos,
        bridge.id,
        bridge.redSocial,
      );
    } catch (error) {
      await registrarLogSeguro(
        bridge,
        "ADVERTENCIA",
        `bridgeApi: item descartado -- ${error instanceof Error ? error.message : String(error)}`,
        itemCrudo,
      );
      continue;
    }

    await leadRecibidoRepository.aceptarLeadRecibido(leadEntrante);
    aceptados++;
  }

  // `ultimoLeadEn` es el momento del POLL, no el timestamp real del lead más
  // nuevo -- coherente con el resto del sistema (`touchUltimoLeadEn` ya
  // funciona así para Meta/Google Forms) y es justamente lo que
  // `MARGEN_SOLAPAMIENTO_MS` compensa arriba.
  if (aceptados > 0) {
    await bridgeRepository.touchUltimoLeadEn(bridge.id);
  }
}

/**
 * `RedSocial.API_EXTERNA`: recorre todos los bridges activos de este tipo y
 * hace un poll cada uno. Igual que `ingesta-inbox.job.ts`, corre fuera de un
 * ciclo HTTP -- `empresaId: null` (holding-wide, D3) bajo el rol `crm_app`
 * normal, nunca `crm_bypass_jobs` (ese es READ ONLY, incompatible con
 * escribir en `leads_recibidos`).
 */
export async function pollBridgesApiExterna(): Promise<void> {
  await runWithTenantContext({ empresaId: null }, async () => {
    const bridges = await bridgeRepository.findBridgesApiExternaActivos();
    for (const bridge of bridges) {
      try {
        await pollUnBridge(bridge);
      } catch (err) {
        logger.error({ err, bridgeId: bridge.id }, "bridgeApi: fallo inesperado en el poll de un bridge");
      }
    }
  });
}

/**
 * Mismo patrón que `bridge-mudo.job.ts`/`sla-atrasado.job.ts`/
 * `citas-recordatorio.job.ts`: `setInterval` + guarda de re-entrada por flag
 * en closure -- un tick aún en curso descarta el siguiente disparo en vez de
 * solaparse. `unref()` evita que retenga el proceso.
 */
export function startBridgeApiPollJob(intervaloMs: number = INTERVALO_BRIDGE_API_POLL_MS): NodeJS.Timeout {
  let enCurso = false;
  const timer = setInterval(() => {
    if (enCurso) {
      logger.warn("bridgeApi: tick omitido, la ejecucion anterior sigue en curso");
      return;
    }
    enCurso = true;
    pollBridgesApiExterna()
      .catch((err: unknown) => logger.error({ err }, "bridgeApi: fallo en el tick"))
      .finally(() => {
        enCurso = false;
      });
  }, intervaloMs);
  timer.unref();
  return timer;
}
