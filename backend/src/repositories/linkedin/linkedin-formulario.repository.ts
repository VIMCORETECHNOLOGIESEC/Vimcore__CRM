import { Prisma, type LinkedInFormulario } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

export interface UpsertFormData {
  fuenteId: string;
  versionedFormUrn: string;
  nombre: string | null;
  contenido: Prisma.InputJsonValue;
  sincronizadoEn: Date;
}

export interface FindByVersionedFormUrnScope {
  bridgeId: string;
  fuenteId: string;
  versionedFormUrn: string;
}

export async function upsertForm(
  data: UpsertFormData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFormulario> {
  const snapshot = {
    nombre: data.nombre,
    contenido: data.contenido,
    sincronizadoEn: data.sincronizadoEn,
    activo: true,
  };
  return client.linkedInFormulario.upsert({
    where: {
      fuenteId_versionedFormUrn: {
        fuenteId: data.fuenteId,
        versionedFormUrn: data.versionedFormUrn,
      },
    },
    create: {
      fuenteId: data.fuenteId,
      versionedFormUrn: data.versionedFormUrn,
      ...snapshot,
    },
    update: snapshot,
  });
}

/** Resuelve el formulario solo cuando fuente y bridge pertenecen a la misma cadena. */
export async function findByVersionedFormUrn(
  scope: FindByVersionedFormUrnScope,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFormulario | null> {
  return client.linkedInFormulario.findFirst({
    where: {
      fuenteId: scope.fuenteId,
      versionedFormUrn: scope.versionedFormUrn,
      fuente: { conexion: { bridgeId: scope.bridgeId } },
    },
  });
}

/**
 * Conserva filas históricas y solo desactiva versiones ausentes de la fuente
 * reconciliada. Una lista vacía desactiva todos sus formularios activos.
 */
export async function markInactiveMissingForms(
  fuenteId: string,
  presentVersionedFormUrns: readonly string[],
  client: PrismaClientOrTransaction = prisma,
): Promise<number> {
  const uniquePresentUrns = [...new Set(presentVersionedFormUrns)];
  const result = await client.linkedInFormulario.updateMany({
    where: {
      fuenteId,
      activo: true,
      ...(uniquePresentUrns.length > 0
        ? { versionedFormUrn: { notIn: uniquePresentUrns } }
        : {}),
    },
    data: { activo: false },
  });
  return result.count;
}
