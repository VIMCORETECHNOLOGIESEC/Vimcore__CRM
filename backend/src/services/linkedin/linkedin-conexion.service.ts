import { AppError } from "../../lib/app-error.js";
import * as bridgeRepository from "../../repositories/bridge.repository.js";
import * as linkedinConexionRepository from "../../repositories/linkedin/linkedin-conexion.repository.js";
import type { LinkedInConexionSummary } from "../../repositories/linkedin/linkedin-conexion.repository.js";
import * as linkedinFuenteRepository from "../../repositories/linkedin/linkedin-fuente.repository.js";
import type { LinkedInFuenteSafe } from "../../repositories/linkedin/linkedin-fuente.repository.js";
import type { LinkedInConexionDto, LinkedInFuenteDto } from "../../types/linkedin/linkedin.dto.js";

function toFuenteDto(fuente: LinkedInFuenteSafe): LinkedInFuenteDto {
  return {
    id: fuente.id,
    tipo: fuente.tipo,
    ownerUrn: fuente.ownerUrn,
    nombre: fuente.nombre,
    tipoLead: fuente.tipoLead,
    activa: fuente.activa,
    estadoSuscripcion: fuente.estadoSuscripcion,
    ultimaSincronizacionEn: fuente.ultimaSincronizacionEn?.toISOString() ?? null,
  };
}

function toSafeDto(
  conexion: LinkedInConexionSummary,
  fuentes: LinkedInFuenteSafe[],
): LinkedInConexionDto {
  return {
    id: conexion.id,
    bridgeId: conexion.bridgeId,
    estado: conexion.estado,
    accessTokenExpiraEn: conexion.accessTokenExpiraEn.toISOString(),
    refreshTokenExpiraEn: conexion.refreshTokenExpiraEn?.toISOString() ?? null,
    scopes: conexion.scopes,
    tieneRefreshToken: conexion.tieneRefreshToken,
    fuentes: fuentes.map(toFuenteDto),
  };
}

async function validateLinkedInBridge(bridgeId: string): Promise<void> {
  const bridge = await bridgeRepository.findById(bridgeId);
  if (!bridge) {
    throw new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
  }
  if (bridge.redSocial !== "LINKEDIN") {
    throw new AppError(
      "linkedin_bridge_invalido",
      422,
      "El bridge no es válido para LinkedIn",
    );
  }
}

export async function getLinkedInConexion(bridgeId: string): Promise<LinkedInConexionDto | null> {
  await validateLinkedInBridge(bridgeId);

  const conexion = await linkedinConexionRepository.findByBridgeId(bridgeId);
  if (!conexion) return null;
  const fuentes = await linkedinFuenteRepository.listByBridge(bridgeId);
  return toSafeDto(conexion, fuentes);
}

export async function listLinkedInFuentes(bridgeId: string): Promise<LinkedInFuenteDto[]> {
  await validateLinkedInBridge(bridgeId);
  const fuentes = await linkedinFuenteRepository.listByBridge(bridgeId);
  return fuentes.map(toFuenteDto);
}
