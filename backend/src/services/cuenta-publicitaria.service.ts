import type { CuentaPublicitaria } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import * as cuentaPublicitariaRepository from "../repositories/cuenta-publicitaria.repository.js";

function bridgeNotFound(): AppError {
  return new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
}

function cuentaPublicitariaNotFound(): AppError {
  return new AppError("cuenta_publicitaria_no_encontrada", 404, "Cuenta publicitaria no encontrada");
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
}

export function toCuentaPublicitariaDto(cuenta: CuentaPublicitaria): CuentaPublicitariaDto {
  return {
    id: cuenta.id,
    bridgeId: cuenta.bridgeId,
    idExterno: cuenta.idExterno,
    nombre: cuenta.nombre,
    instagramAccountId: cuenta.idExternoVinculado,
    activa: cuenta.activa,
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
