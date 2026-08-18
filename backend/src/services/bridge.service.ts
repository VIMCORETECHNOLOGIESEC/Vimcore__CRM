import type { Bridge, CuentaPublicitaria, EstadoBridge, RedSocial } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { generarClaveBridge, hashClaveBridge } from "../lib/clave-bridge.js";
import { BRIDGE_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import type { BridgeConCuentas } from "../repositories/bridge.repository.js";

function bridgeNotFound(): AppError {
  return new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
}

/**
 * Requirement: no token/expiry placeholder columns in this change — el DTO
 * emite `tokenExpiraEn: null` como constante documentada, no una columna
 * (diseño DD "no token/expiry placeholder columns").
 */
const TOKEN_EXPIRA_EN = null;

export interface BridgeDto {
  id: string;
  redSocial: RedSocial;
  nombre: string;
  estado: EstadoBridge;
  ultimoLeadEn: Date | null;
  tokenExpiraEn: null;
}

/**
 * Requirement: Bridge detail embeds its accounts. `cuentasPublicitarias`
 * pasa sin mapear (forma cruda del repositorio) en esta rebanada — el
 * boundary `idExternoVinculado` ↔ `instagramAccountId` es responsabilidad de
 * PR3 (tarea 3.5, `cuenta-publicitaria.service.ts`), inexistente todavía.
 */
export interface BridgeDetalleDto extends BridgeDto {
  cuentasPublicitarias: CuentaPublicitaria[];
}

function toBridgeDto(bridge: Bridge): BridgeDto {
  return {
    id: bridge.id,
    redSocial: bridge.redSocial,
    nombre: bridge.nombre,
    estado: bridge.estado,
    ultimoLeadEn: bridge.ultimoLeadEn,
    tokenExpiraEn: TOKEN_EXPIRA_EN,
  };
}

function toBridgeDetalleDto(bridge: BridgeConCuentas): BridgeDetalleDto {
  return {
    ...toBridgeDto(bridge),
    cuentasPublicitarias: bridge.cuentasPublicitarias,
  };
}

export interface CreateBridgeInput {
  redSocial: RedSocial;
  nombre: string;
}

export interface ClaveApiResult {
  bridge: BridgeDto;
  claveApi: string;
}

/**
 * Requirement: Bridge creation starts inactive with one-time plaintext key.
 * `estado=INACTIVO` ya es el default del schema (`bridge.repository.ts`
 * pasa `data` tal cual), así que no se envía `estado` acá — una sola fuente
 * de verdad para el default (ver docstring de `bridge.repository.create`).
 */
export async function createBridge(input: CreateBridgeInput): Promise<ClaveApiResult> {
  const claveApi = generarClaveBridge();
  const bridge = await bridgeRepository.create({
    redSocial: input.redSocial,
    nombre: input.nombre,
    claveApiHash: hashClaveBridge(claveApi),
  });
  return { bridge: toBridgeDto(bridge), claveApi };
}

export async function listBridges(): Promise<BridgeDto[]> {
  const bridges = await bridgeRepository.list();
  return bridges.map(toBridgeDto);
}

export async function getBridgeById(id: string): Promise<BridgeDetalleDto> {
  const bridge = await bridgeRepository.findById(id);
  if (!bridge) {
    throw bridgeNotFound();
  }
  return toBridgeDetalleDto(bridge);
}

export interface UpdateBridgeInput {
  nombre?: string;
  estado?: "ACTIVO" | "INACTIVO";
}

/**
 * Requirement: PATCH /bridges/:id es el único endpoint para rename/
 * deactivate/reactivate. El whitelist de `estado` (excluye
 * `TOKEN_EXPIRADO`/`ERROR`) y "al menos un campo" ya se resolvieron en
 * `bridges.schema.ts` — acá solo queda la existencia del bridge.
 */
export async function updateBridge(id: string, input: UpdateBridgeInput): Promise<BridgeDto> {
  const existente = await bridgeRepository.findById(id);
  if (!existente) {
    throw bridgeNotFound();
  }
  const actualizado = await bridgeRepository.update(id, input);
  return toBridgeDto(actualizado);
}

export type ResultadoEliminacion = "BAJA_FISICA" | "BAJA_LOGICA";

export interface DeleteBridgeResult {
  resultado: ResultadoEliminacion;
  bridge: BridgeDto;
}

/**
 * Requirement: Delete mode is decided by lead count, never ultimoLeadEn.
 * Cuenta y borra/desactiva dentro de la misma transacción interactiva
 * (diseño DD "delete mode from leadsRecibidos.count") — evita una carrera
 * con una ingesta concurrente entre el conteo y la decisión.
 */
export async function deleteBridge(id: string): Promise<DeleteBridgeResult> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const existente = await bridgeRepository.findById(id, tx);
      if (!existente) {
        throw bridgeNotFound();
      }

      const leadsRecibidosCount = await bridgeRepository.countLeadsRecibidos(id, tx);
      if (leadsRecibidosCount === 0) {
        await bridgeRepository.eliminar(id, tx);
        return { resultado: "BAJA_FISICA" as const, bridge: toBridgeDto(existente) };
      }

      const desactivado = await bridgeRepository.update(id, { estado: "INACTIVO" }, tx);
      return { resultado: "BAJA_LOGICA" as const, bridge: toBridgeDto(desactivado) };
    },
    BRIDGE_TRANSACTION_BOUNDS,
  );
}

/**
 * Requirement: Key regeneration never changes bridge state. Nunca toca
 * `estado` — solo reemplaza el hash (diseño DD "generarClaveBridge() shape
 * and lifecycle", user-confirmed).
 */
export async function regenerarClave(id: string): Promise<ClaveApiResult> {
  const existente = await bridgeRepository.findById(id);
  if (!existente) {
    throw bridgeNotFound();
  }

  const claveApi = generarClaveBridge();
  const bridge = await bridgeRepository.updateClaveApiHash(id, hashClaveBridge(claveApi));
  return { bridge: toBridgeDto(bridge), claveApi };
}
