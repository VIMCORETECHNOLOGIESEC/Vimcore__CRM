import { BRIDGE_MUDO_HORAS } from "../config/negocio.js";
import { logger } from "../lib/logger.js";
import type { RegistrarLogData } from "../repositories/bridge-log.repository.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import { registrarBridgeLog } from "./bridge-log.service.js";

/** Umbral del checklist M4/M8: "bridge sin actividad por 72 h" (docs/05-bridges.md §8). */
const UMBRAL_MUDO_MS = BRIDGE_MUDO_HORAS * 60 * 60 * 1000;

export interface ResultadoDeteccionMudos {
  candidatos: number;
  advertenciasRegistradas: number;
}

/**
 * D-bridge-mudo (diseño, checklist "Trabajo programado: detección de bridge
 * sin actividad por 72 h"). Handler PURO de efectos: recibe `ahora`, nunca
 * consulta el reloj real ni conoce `setInterval` (eso vive en
 * `jobs/bridge-mudo.job.ts`, mismo split que `sla-atrasado.service.ts` de
 * M6 y `citas-recordatorio.service.ts` de M7).
 *
 * Candidatos: `bridgeRepository.findBridgesMudos` ya resuelve el criterio
 * completo de "campaña activa" (docs/05-bridges.md §8) — estado ACTIVO,
 * `ultimoLeadEn` vencido hace más de 72h, y sin cuentas publicitarias o con
 * al menos una activa.
 *
 * Por cada candidato: primero se registra el log en `bridge_logs`
 * (`registrarLogSeguro`) y SOLO si esa escritura tuvo éxito se reclama la
 * fila de forma atómica (`marcarAdvertenciaMudoEnviada`, guarda `WHERE
 * advertenciaMudoEnviada = false AND (ultimoLeadEn IS NULL OR ultimoLeadEn <
 * umbral)` en el propio `updateMany` — mismo espíritu anti-duplicado que
 * `citas-recordatorio.service.ts`, revalidando la condición temporal en el
 * mismo statement para cerrar la ventana de carrera entre el `SELECT` de
 * candidatos y este `UPDATE`). Este orden (log primero, flag después)
 * evita perder la advertencia en silencio si `registrarLogSeguro` falla:
 * si el log no se pudo escribir, el flag nunca se marca, así que el
 * próximo tick (15 min después) vuelve a intentarlo para ese bridge en vez
 * de darlo por avisado sin rastro en `bridge_logs`. En el peor caso (un
 * crash justo entre ambos pasos) puede quedar un log duplicado — preferible
 * a perder la advertencia por completo (docs/05-bridges.md §8).
 *
 * El log se escribe en nivel `ADVERTENCIA` (no `ERROR`): sigue el mismo
 * patrón ya establecido en `ingesta.service.ts` para datos incompletos —
 * una advertencia queda visible en `GET /bridges/:id/logs` sin generar una
 * notificación push a administradores (`bridge-log.service.ts::
 * registrarBridgeLog` solo notifica en nivel `ERROR`). Extender esa
 * notificación a `ADVERTENCIA` es una decisión de producto fuera de esta
 * rebanada — ver reporte de la tarea.
 */
export async function detectarBridgesMudos(
  ahora: Date = new Date(),
): Promise<ResultadoDeteccionMudos> {
  const umbral = new Date(ahora.getTime() - UMBRAL_MUDO_MS);

  const candidatos = await bridgeRepository.findBridgesMudos(umbral);
  if (candidatos.length === 0) return { candidatos: 0, advertenciasRegistradas: 0 };

  let advertenciasRegistradas = 0;
  for (const bridge of candidatos) {
    const logRegistrado = await registrarLogSeguro({
      bridgeId: bridge.id,
      nivel: "ADVERTENCIA",
      mensaje: "Bridge sin leads en las últimas 72h — probable problema de configuración",
      payload: { ultimoLeadEn: bridge.ultimoLeadEn },
    });
    if (!logRegistrado) continue;

    const claimed = await bridgeRepository.marcarAdvertenciaMudoEnviada([bridge.id], umbral);
    if (claimed.count === 0) continue;

    advertenciasRegistradas += 1;
  }

  return { candidatos: candidatos.length, advertenciasRegistradas };
}

/**
 * Mismo patrón que `ingesta.service.ts::registrarLogSeguro` (DD5): un fallo
 * al escribir `bridge_logs` nunca debe hacer fallar el tick del job. A
 * diferencia de las otras variantes, esta devuelve si la escritura tuvo
 * éxito: el caller usa ese resultado como guarda para no marcar
 * `advertenciaMudoEnviada` cuando el log se perdió (ver comentario de
 * `detectarBridgesMudos`).
 */
async function registrarLogSeguro(data: RegistrarLogData): Promise<boolean> {
  try {
    await registrarBridgeLog(data);
    return true;
  } catch (error) {
    logger.error({ err: error, bridgeId: data.bridgeId }, "bridge-mudo: fallo al registrar bridge_logs");
    return false;
  }
}
