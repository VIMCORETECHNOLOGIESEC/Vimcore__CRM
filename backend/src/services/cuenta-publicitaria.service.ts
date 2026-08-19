import type { CuentaPublicitaria, EstadoTokenCuenta } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { decrypt, encrypt } from "../lib/cifrado-token.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import * as cuentaPublicitariaRepository from "../repositories/cuenta-publicitaria.repository.js";
import { verificarTokenPagina } from "./meta-token.service.js";

function bridgeNotFound(): AppError {
  return new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
}

function cuentaPublicitariaNotFound(): AppError {
  return new AppError("cuenta_publicitaria_no_encontrada", 404, "Cuenta publicitaria no encontrada");
}

function tokenInvalido(mensaje: string): AppError {
  return new AppError("meta_token_invalido", 422, mensaje);
}

/**
 * Resuelve y valida pertenencia (bridge existe, cuenta pertenece a ESE
 * bridge) — mismo chequeo que `toggleActiva`, extraído porque `cargarToken`
 * y `probarConexion` lo repiten.
 */
async function resolverCuentaDelBridge(bridgeId: string, cuentaId: string): Promise<CuentaPublicitaria> {
  const bridge = await bridgeRepository.findById(bridgeId);
  if (!bridge) {
    throw bridgeNotFound();
  }

  const cuenta = bridge.cuentasPublicitarias.find((c) => c.id === cuentaId);
  if (!cuenta) {
    throw cuentaPublicitariaNotFound();
  }

  return cuenta;
}

/**
 * Boundary explícito (diseño m4-bridges-crud-fundacion, tarea PR3.3): el
 * wire DTO público usa `instagramAccountId`, Prisma usa
 * `idExternoVinculado`/`id_externo_vinculado`. Este servicio es la ÚNICA
 * capa que traduce entre ambos nombres — ningún tercer nombre se introduce
 * acá ni en ningún otro archivo.
 */
export interface CuentaPublicitariaDto {
  id: string;
  bridgeId: string;
  idExterno: string;
  nombre: string;
  instagramAccountId: string | null;
  activa: boolean;
  estadoToken: EstadoTokenCuenta;
  tokenExpiraEn: Date | null;
}

/**
 * `estadoToken`/`tokenExpiraEn` (docs/05-bridges.md §7-8): metadata de estado
 * del token, nunca el secreto en sí — `tokenCifrado` jamás se lee acá ni se
 * agrega a este DTO. `tokenExpiraEn` sigue el mismo criterio de
 * serialización que `bridge.service.ts::toBridgeDto` (`ultimoLeadEn`): el
 * campo queda tipado `Date | null` y Express serializa a ISO 8601 al
 * responder `res.json(...)`, no hay conversión manual acá.
 */
export function toCuentaPublicitariaDto(cuenta: CuentaPublicitaria): CuentaPublicitariaDto {
  return {
    id: cuenta.id,
    bridgeId: cuenta.bridgeId,
    idExterno: cuenta.idExterno,
    nombre: cuenta.nombre,
    instagramAccountId: cuenta.idExternoVinculado,
    activa: cuenta.activa,
    estadoToken: cuenta.estadoToken,
    tokenExpiraEn: cuenta.tokenExpiraEn,
  };
}

export interface CreateCuentaPublicitariaInput {
  idExterno: string;
  nombre: string;
  instagramAccountId?: string;
}

/**
 * Requirement: Admin can manually create a CuentaPublicitaria.
 * `instagramAccountId` se persiste como texto libre sin validar (diseño,
 * Open Questions: "accepted-but-unvalidated") — no existe adaptador Meta
 * todavía para cruzar Page↔Instagram.
 */
export async function create(
  bridgeId: string,
  input: CreateCuentaPublicitariaInput,
): Promise<CuentaPublicitariaDto> {
  const bridge = await bridgeRepository.findById(bridgeId);
  if (!bridge) {
    throw bridgeNotFound();
  }

  const cuenta = await cuentaPublicitariaRepository.create({
    bridgeId,
    idExterno: input.idExterno,
    nombre: input.nombre,
    idExternoVinculado: input.instagramAccountId ?? null,
  });
  return toCuentaPublicitariaDto(cuenta);
}

/** `GET /bridges/:id/cuentas`: listado de cuentas publicitarias del bridge (Requirement: Bridge detail embeds its accounts). */
export async function listByBridge(bridgeId: string): Promise<CuentaPublicitariaDto[]> {
  const bridge = await bridgeRepository.findById(bridgeId);
  if (!bridge) {
    throw bridgeNotFound();
  }

  const cuentas = await cuentaPublicitariaRepository.listByBridge(bridgeId);
  return cuentas.map(toCuentaPublicitariaDto);
}

/**
 * Requirement: Bridge detail embeds its accounts; PATCH toggles only
 * activation. Verifica pertenencia al bridge vía `bridge.cuentasPublicitarias`
 * (ya embebido por `bridgeRepository.findById`) antes de tocar la fila — una
 * cuenta de OTRO bridge nunca se puede alternar desde este endpoint.
 */
export async function toggleActiva(
  bridgeId: string,
  cuentaId: string,
  activa: boolean,
): Promise<CuentaPublicitariaDto> {
  const bridge = await bridgeRepository.findById(bridgeId);
  if (!bridge) {
    throw bridgeNotFound();
  }

  const pertenece = bridge.cuentasPublicitarias.some((cuenta) => cuenta.id === cuentaId);
  if (!pertenece) {
    throw cuentaPublicitariaNotFound();
  }

  const actualizada = await cuentaPublicitariaRepository.updateActiva(cuentaId, activa);
  return toCuentaPublicitariaDto(actualizada);
}

/**
 * `POST /bridges/:id/cuentas/:cuentaId/token` (docs/05-bridges.md §7, "Carga
 * y renovación de token con verificación inmediata de validez"): un solo
 * endpoint sirve tanto la primera carga como la renovación — no hay
 * distinción de estado previo, el token entrante siempre se verifica de
 * cero contra `/debug_token` antes de persistirse. Un token que Graph API
 * rechaza NUNCA se cifra ni se guarda (422) — la cuenta conserva el token
 * anterior (si había uno) intacto. El texto plano nunca se devuelve, ni
 * siquiera en el DTO de éxito (`toCuentaPublicitariaDto` no expone
 * `tokenCifrado`).
 */
export async function cargarToken(
  bridgeId: string,
  cuentaId: string,
  token: string,
): Promise<CuentaPublicitariaDto> {
  const cuenta = await resolverCuentaDelBridge(bridgeId, cuentaId);

  const verificacion = await verificarTokenPagina(token);
  if (!verificacion.valido) {
    throw tokenInvalido(`El token no pudo verificarse contra Graph API: ${verificacion.mensaje}`);
  }

  const actualizada = await cuentaPublicitariaRepository.updateToken(cuenta.id, {
    tokenCifrado: encrypt(token),
    tokenExpiraEn: verificacion.expiraEn,
  });
  return toCuentaPublicitariaDto(actualizada);
}

export interface ResultadoPruebaConexion {
  ok: boolean;
  mensaje: string;
}

/**
 * `POST /bridges/:id/cuentas/:cuentaId/probar-conexion` (docs/05-bridges.md
 * §7, "Prueba de conexión bajo demanda"): puramente diagnóstica — NUNCA
 * modifica `estadoToken` ni ninguna otra columna, a diferencia de la
 * verificación diaria (`verificacion-token.service.ts`) o de la carga de
 * token (`cargarToken`, arriba), que sí persisten el resultado. Sirve para
 * que un administrador confirme el estado real sin esperar al próximo tick
 * del trabajo programado.
 */
export async function probarConexion(bridgeId: string, cuentaId: string): Promise<ResultadoPruebaConexion> {
  const cuenta = await resolverCuentaDelBridge(bridgeId, cuentaId);

  if (cuenta.tokenCifrado === null) {
    return { ok: false, mensaje: "Esta cuenta todavía no tiene un token cargado." };
  }

  let verificacion: Awaited<ReturnType<typeof verificarTokenPagina>>;
  try {
    verificacion = await verificarTokenPagina(decrypt(cuenta.tokenCifrado));
  } catch {
    // `decrypt` puede lanzar (ciphertext corrupto, o cifrado con una
    // `TOKEN_ENCRYPTION_KEY` vieja tras una rotación) — `probarConexion` es
    // puramente diagnóstica y su contrato documentado es "siempre devuelve
    // `{ ok, mensaje }`", nunca un error HTTP inesperado. No se persiste
    // ningún cambio de estado acá, igual que el resto de esta función.
    return { ok: false, mensaje: "No se pudo verificar el token guardado. Cargá uno nuevo." };
  }

  if (!verificacion.valido) {
    return { ok: false, mensaje: "El token expiró o fue revocado. Cargá uno nuevo." };
  }

  return { ok: true, mensaje: "Conexión verificada correctamente." };
}
