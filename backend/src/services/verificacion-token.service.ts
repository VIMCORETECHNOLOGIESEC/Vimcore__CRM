import { logger } from "../lib/logger.js";
import { decrypt } from "../lib/cifrado-token.js";
import { prisma, runAsBypassJob, runWithTenantContext, VERIFICACION_TOKEN_TRANSACTION_BOUNDS } from "../lib/prisma.js";
import type { RegistrarLogData } from "../repositories/bridge-log.repository.js";
import * as cuentaPublicitariaRepository from "../repositories/cuenta-publicitaria.repository.js";
import { registrarBridgeLog } from "./bridge-log.service.js";
import { createForActiveRoles } from "./notificaciones.service.js";
import { verificarTokenPagina, type VerificacionTokenPagina } from "./meta-token.service.js";
import { notificationEvents, publishCommittedEvents } from "./committed-events.service.js";
import { partitionByEmpresa } from "./company-partition.js";

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
export async function verifyTokensVigentes(
  _ahora: Date = new Date(),
): Promise<ResultadoVerificacionToken> {
  const candidatos = await runAsBypassJob(
    "token-verification",
    (tx) => cuentaPublicitariaRepository.listConTokenCargado(tx),
    VERIFICACION_TOKEN_TRANSACTION_BOUNDS,
  );
  if (candidatos.length === 0) return { candidatos: 0, invalidados: 0 };

  let invalidados = 0;
  for (const [empresaId, partition] of partitionByEmpresa(
    candidatos.map((cuenta) => ({ ...cuenta, empresaId: cuenta.bridge.empresaId })),
  )) {
    await runWithTenantContext({ empresaId }, async () => {
      for (const cuenta of partition) {
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
      await recordLogSeguro({
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
      await recordLogSeguro({
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
    });
  }

  return { candidatos: candidatos.length, invalidados };
}

export interface ResultadoAlertaTokenPorExpirar {
  alertadas: number;
}

const ADMIN_ROLES = ["ADMINISTRADOR"] as const;

/** Ventana preventiva (spec token-expiry-alerting): 7 días antes de la expiración. */
const VENTANA_ALERTA_DIAS = 7;

/**
 * M-hardening Bloque A (WU5, spec token-expiry-alerting): productor
 * preventivo — a diferencia de `verifyTokensVigentes` (verifica contra
 * Graph API si el token SIGUE siendo válido HOY), esta función avisa con
 * anticipación cuando un token AÚN válido está por vencer, para que se
 * renueve antes de que deje de funcionar. Idempotente por `tokenExpiraEn`
 * exacto (D-idempotencia): `cuenta-publicitaria.repository.ts::listPorExpirar`
 * ya acota por la ventana temporal; el filtro "¿ya se alertó ESTE
 * `tokenExpiraEn`?" se hace acá en memoria (no expresable en un `where` de
 * Prisma sin SQL crudo — comparación de dos columnas de la misma fila).
 */
export async function produceAlertaTokenPorExpirar(
  ahora: Date = new Date(),
): Promise<ResultadoAlertaTokenPorExpirar> {
  // Bloque C (Etapa 3, D1/spec §2 "Approved job crosses companies", batch 3
  // discovery): mismo razonamiento que `sla-atrasado.service.ts::
  // detectLeadsAtrasados` — este cron (`jobs/verificacion-token.job.ts`) corre
  // sin `AsyncLocalStorage` de tenant y necesita ver cuentas publicitarias
  // por expirar de TODAS las empresas. Sin `runAsBypassJob`, la lectura
  // inicial (0 filas bajo RLS fail-closed) Y el `include: { bridge: {...} }`
  // requerido de `listPorExpirar` (Prisma exige que una relación no-nullable
  // resuelva, nunca `null`) fallarían — este segundo síntoma
  // (`PrismaClientUnknownRequestError: Inconsistent query result: Field
  // bridge is required to return data, got null instead`) fue el primer
  // indicio real del gap, batch 3.
  const candidatas = await runAsBypassJob(
    "token-expiry-alert",
    (tx) => cuentaPublicitariaRepository.listPorExpirar(ahora, VENTANA_ALERTA_DIAS, tx),
    VERIFICACION_TOKEN_TRANSACTION_BOUNDS,
  );
  let alertadas = 0;
  for (const [empresaId, partition] of partitionByEmpresa(
    candidatas.map((cuenta) => ({ ...cuenta, empresaId: cuenta.bridge.empresaId })),
  )) {
    await runWithTenantContext({ empresaId }, async () => {
      for (const cuenta of partition) {
      // `listPorExpirar` ya garantiza `tokenExpiraEn != null` — no-null
      // assertion segura acá, no una nueva invariante.
      const tokenExpiraEn = cuenta.tokenExpiraEn as Date;
      const yaAlertada = cuenta.alertaExpiracionParaEn?.getTime() === tokenExpiraEn.getTime();
      if (yaAlertada) continue;

      // Bloque C (D5/D8): `cuenta.bridge.empresaId` cierra el chokepoint de la
      // alerta de expiración de token — cada alerta llega solo a la empresa del
      // bridge dueño de la cuenta (spec, "Job output never mixes empresas").
        const committed = await prisma.$transaction(async (tx) => {
          const notifications = await createForActiveRoles(
            ADMIN_ROLES,
            {
              tipo: "TOKEN_POR_EXPIRAR",
              titulo: "Token de red social por expirar",
              mensaje: `El token de la cuenta ${cuenta.idExterno} vence pronto — renuévalo antes de que expire`,
            },
            empresaId,
            tx,
          );
          await cuentaPublicitariaRepository.updateAlertaExpiracionParaEn(cuenta.id, tokenExpiraEn, tx);
          return notifications.flatMap(notificationEvents);
        }, VERIFICACION_TOKEN_TRANSACTION_BOUNDS);
        alertadas += 1;
        publishCommittedEvents(committed);
      }
    }
    );
  }

  return { alertadas };
}

/**
 * Mismo patrón que `meta-webhook.service.ts::registrarLogSeguro`/
 * `bridge-mudo.service.ts::registrarLogSeguro` (DD5, diseño M4): un fallo al
 * escribir `bridge_logs` nunca debe interrumpir el resto del tick. Se
 * duplica acá en vez de extraerse a un helper compartido para no tocar los
 * otros dos archivos que ya lo repiten (ver reporte de la tarea).
 */
async function recordLogSeguro(data: RegistrarLogData): Promise<void> {
  try {
    await registrarBridgeLog(data);
  } catch (error) {
    logger.error(
      { err: error, bridgeId: data.bridgeId },
      "verificacion-token: fallo al registrar bridge_logs",
    );
  }
}
