import { logger } from "../lib/logger.js";
import { decrypt } from "../lib/cifrado-token.js";
import type { RegistrarLogData } from "../repositories/bridge-log.repository.js";
import * as cuentaPublicitariaRepository from "../repositories/cuenta-publicitaria.repository.js";
import { registrarBridgeLog } from "./bridge-log.service.js";
import { verificarTokenPagina, type VerificacionTokenPagina } from "./meta-token.service.js";

export interface ResultadoVerificacionToken {
  candidatos: number;
  invalidados: number;
}

/**
 * D-verificacion-token (docs/05-bridges.md §3, checklist "Trabajo programado:
 * verificación diaria de token vigente por Página vía `/debug_token`").
 * Handler PURO de efectos: recibe `ahora` solo para mantener el mismo shape
 * que `bridge-mudo.service.ts::detectarBridgesMudos`/`sla-atrasado.service.ts`
 * (nunca conoce `setInterval`, eso vive en `jobs/verificacion-token.job.ts`) —
 * a diferencia de esos dos, esta verificación no depende de una ventana
 * temporal propia (no hay "vencido hace más de N horas"): el universo
 * completo de cuentas con token cargado se revisa en cada tick.
 *
 * Por cada cuenta con `tokenCifrado` no nulo: se descifra y se verifica
 * contra `/debug_token`. Si Graph API reporta el token inválido/revocado, se
 * marca `estadoToken = TOKEN_EXPIRADO` y se registra `bridge_logs` nivel
 * `ERROR` — `registrarBridgeLog` en ese nivel ya dispara la notificación a
 * administradores (`bridge-log.service.ts`), cumpliendo "notificación a
 * administradores ante invalidez/revocación" sin lógica adicional acá. Si el
 * token sigue vigente pero `tokenExpiraEn` cambió (Meta puede reportar una
 * fecha de expiración distinta entre verificaciones), se actualiza esa sola
 * columna — nunca se vuelve a cifrar el token, que no cambió.
 */
export async function verificarTokensVigentes(
  _ahora: Date = new Date(),
): Promise<ResultadoVerificacionToken> {
  const candidatos = await cuentaPublicitariaRepository.listConTokenCargado();
  if (candidatos.length === 0) return { candidatos: 0, invalidados: 0 };

  let invalidados = 0;
  for (const cuenta of candidatos) {
    // `listConTokenCargado` ya filtra `tokenCifrado != null` — no-null assertion
    // segura acá, no una nueva invariante.
    let verificacion: VerificacionTokenPagina;
    try {
      verificacion = await verificarTokenPagina(decrypt(cuenta.tokenCifrado as string));
    } catch (error) {
      // `decrypt` puede lanzar (ciphertext corrupto, o cifrado con una
      // `TOKEN_ENCRYPTION_KEY` vieja tras una rotación) — sin este catch, la
      // excepción se propaga fuera de esta función, el `.catch` del job
      // (`verificacion-token.job.ts`) se la traga logueando "fallo en el
      // tick", y TODAS las cuentas restantes en el orden de iteración
      // quedan sin revisar ese día (y los siguientes). Se trata igual que un
      // token inválido: TOKEN_EXPIRADO + bridge_logs ERROR, y se continúa
      // con el resto del loop.
      await cuentaPublicitariaRepository.updateEstadoToken(cuenta.id, "TOKEN_EXPIRADO");
      await registrarLogSeguro({
        bridgeId: cuenta.bridgeId,
        nivel: "ERROR",
        mensaje:
          `Meta: no se pudo descifrar el token de la Página ${cuenta.idExterno} — ` +
          "posible rotación de clave de cifrado, marcado TOKEN_EXPIRADO",
        payload: {
          cuentaId: cuenta.id,
          idExterno: cuenta.idExterno,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      invalidados += 1;
      continue;
    }

    if (!verificacion.valido) {
      await cuentaPublicitariaRepository.updateEstadoToken(cuenta.id, "TOKEN_EXPIRADO");
      await registrarLogSeguro({
        bridgeId: cuenta.bridgeId,
        nivel: "ERROR",
        mensaje:
          `Meta: token de la Página ${cuenta.idExterno} inválido/revocado ` +
          "(verificación diaria) — marcado TOKEN_EXPIRADO",
        payload: { cuentaId: cuenta.id, idExterno: cuenta.idExterno, mensaje: verificacion.mensaje },
      });
      invalidados += 1;
      continue;
    }

    const expiraEnCambio = (cuenta.tokenExpiraEn?.getTime() ?? null) !== (verificacion.expiraEn?.getTime() ?? null);
    if (expiraEnCambio) {
      await cuentaPublicitariaRepository.updateTokenExpiraEn(cuenta.id, verificacion.expiraEn);
    }
  }

  return { candidatos: candidatos.length, invalidados };
}

/**
 * Mismo patrón que `meta-webhook.service.ts::registrarLogSeguro`/
 * `bridge-mudo.service.ts::registrarLogSeguro` (DD5, diseño M4): un fallo al
 * escribir `bridge_logs` nunca debe interrumpir el resto del tick. Se
 * duplica acá en vez de extraerse a un helper compartido para no tocar los
 * otros dos archivos que ya lo repiten (ver reporte de la tarea).
 */
async function registrarLogSeguro(data: RegistrarLogData): Promise<void> {
  try {
    await registrarBridgeLog(data);
  } catch (error) {
    logger.error(
      { err: error, bridgeId: data.bridgeId },
      "verificacion-token: fallo al registrar bridge_logs",
    );
  }
}
