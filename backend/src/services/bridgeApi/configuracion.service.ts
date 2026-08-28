import type { Bridge, RedSocial } from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import { decrypt, encrypt } from "../../lib/cifrado-token.js";
import * as bridgeRepository from "../../repositories/bridge.repository.js";
import type { ConexionBridgeApiBody, MapeoBridgeApiBody } from "../../schemas/bridges.schema.js";
import type { ConfiguracionBridgeApi } from "../../types/bridgeApi/configuracion-bridge-api.js";
import { consultarLeadsExternos } from "./cliente-externo.service.js";

function bridgeNoEncontrado(): AppError {
  return new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
}

function redSocialInvalida(): AppError {
  return new AppError(
    "red_social_invalida",
    400,
    "Este endpoint solo aplica a bridges con redSocial API_EXTERNA",
  );
}

async function obtenerBridgeApiExterna(bridgeId: string): Promise<Bridge> {
  const bridge = await bridgeRepository.findById(bridgeId);
  if (!bridge) throw bridgeNoEncontrado();
  if (bridge.redSocial !== "API_EXTERNA") throw redSocialInvalida();
  return bridge;
}

export interface BridgeApiConfigDto {
  id: string;
  redSocial: RedSocial;
  // Parcial a propósito: mientras el admin no haya cargado conexión Y mapeo,
  // el config queda incompleto en la base -- nunca se rellena con un
  // placeholder inventado (mismo criterio que el resto del contrato
  // LeadEntrante). El job de polling (futuro) valida completitud antes de
  // hacer el GET, no acá.
  configuracionJson: Partial<ConfiguracionBridgeApi>;
}

function toBridgeApiConfigDto(
  bridge: Bridge,
  configuracionJson: Partial<ConfiguracionBridgeApi>,
): BridgeApiConfigDto {
  return { id: bridge.id, redSocial: bridge.redSocial, configuracionJson };
}

/**
 * `PATCH /bridges/:id/api-externa/conexion`: carga o corrige url/credencial/
 * header — modificable las veces que haga falta, sin distinción entre
 * "cargar por primera vez" y "corregir un error de configuración" (mismo
 * criterio idempotente que `PATCH /bridges/:id`). No toca `mapeoCampos`/
 * `parametroFecha` si ya estaban cargados -- lee el config actual y solo
 * pisa los campos de esta llamada.
 *
 * `credencialExterna` se cifra acá, nunca se persiste ni se devuelve en
 * claro (mismo patrón que `cuenta-publicitaria.service.ts::cargarToken` con
 * el Page Access Token de Meta).
 */
export async function actualizarConexion(
  bridgeId: string,
  input: ConexionBridgeApiBody,
): Promise<BridgeApiConfigDto> {
  const bridge = await obtenerBridgeApiExterna(bridgeId);
  const actual = (bridge.configuracionJson as Partial<ConfiguracionBridgeApi> | null) ?? {};

  const configuracionActualizada: Partial<ConfiguracionBridgeApi> = {
    ...actual,
    url: input.url,
    nombreHeaderApiKey: input.nombreHeaderApiKey,
  };

  const actualizado = await bridgeRepository.update(bridgeId, {
    configuracionJson: configuracionActualizada,
    credencialExternaCifrada: encrypt(input.credencialExterna),
  });

  return toBridgeApiConfigDto(actualizado, configuracionActualizada);
}

/**
 * `PATCH /bridges/:id/api-externa/mapeo`: carga o corrige mapeoCampos/
 * parametroFecha -- mismo criterio idempotente que `actualizarConexion`, sin
 * tocar url/credencial/header ya cargados.
 */
export async function actualizarMapeo(
  bridgeId: string,
  input: MapeoBridgeApiBody,
): Promise<BridgeApiConfigDto> {
  const bridge = await obtenerBridgeApiExterna(bridgeId);
  const actual = (bridge.configuracionJson as Partial<ConfiguracionBridgeApi> | null) ?? {};

  const configuracionActualizada: Partial<ConfiguracionBridgeApi> = {
    ...actual,
    mapeoCampos: input.mapeoCampos,
    parametroFecha: input.parametroFecha,
  };

  const actualizado = await bridgeRepository.update(bridgeId, {
    configuracionJson: configuracionActualizada,
  });

  return toBridgeApiConfigDto(actualizado, configuracionActualizada);
}

export type ResultadoPruebaConexion =
  | { ok: true; mensaje: string; cantidadLeads: number }
  | { ok: false; mensaje: string };

/**
 * `POST /bridges/:id/api-externa/probar-conexion` — mismo contrato que
 * `cuenta-publicitaria.service.ts::probarConexion`: puramente diagnóstica,
 * siempre devuelve `{ ok, mensaje }` (nunca un error HTTP inesperado), nunca
 * persiste ni escribe en `leads_recibidos`. No filtra por fecha (`desde`
 * ausente) -- una prueba de conexión quiere ver que la API responde, no
 * simular el filtro incremental del job real.
 */
export async function probarConexion(bridgeId: string): Promise<ResultadoPruebaConexion> {
  const bridge = await obtenerBridgeApiExterna(bridgeId);
  const configuracion = bridge.configuracionJson as Partial<ConfiguracionBridgeApi> | null;

  if (!configuracion?.url) {
    return { ok: false, mensaje: "Todavía no cargaste la conexión (PATCH .../api-externa/conexion)." };
  }
  if (bridge.credencialExternaCifrada === null) {
    return { ok: false, mensaje: "Todavía no cargaste la credencial (PATCH .../api-externa/conexion)." };
  }

  let credencial: string;
  try {
    credencial = decrypt(bridge.credencialExternaCifrada);
  } catch {
    // Mismo criterio que `cuenta-publicitaria.service.ts::probarConexion`:
    // ciphertext corrupto o `TOKEN_ENCRYPTION_KEY` rotada no son un error
    // HTTP inesperado, son un resultado diagnóstico más.
    return { ok: false, mensaje: "No se pudo descifrar la credencial guardada. Volvé a cargarla." };
  }

  const resultado = await consultarLeadsExternos(configuracion, credencial);
  if (!resultado.ok) {
    return resultado;
  }

  return {
    ok: true,
    mensaje: "Conexión verificada correctamente.",
    cantidadLeads: resultado.leads.length,
  };
}
