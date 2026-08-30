import type { ConfiguracionEmpresa } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Integración tema-empresarial: `configuracion_empresa` es una tabla
 * singleton — nunca hay más de una fila. Todas las operaciones de este
 * repositorio ignoran cualquier noción de `id` externo y siempre resuelven
 * "la fila" vía `findFirst`/actualización de la primera fila encontrada.
 */

const DEFAULTS = {
  // Mismos valores fijos que hoy usa el frontend como fallback
  // (`temas/variante-empresarial/tema-empresarial.css`, `--indigo`/`--cat-2`).
  nombre: "CRM Embudo de Leads",
  colorPrimario: "#1e2a5e",
  colorSecundario: "#2563eb",
} as const;

export async function findSingleton(): Promise<ConfiguracionEmpresa | null> {
  return prisma.configuracionEmpresa.findFirst();
}

/**
 * Lazy init (sin seed obligatorio): crea la fila con los defaults documentados
 * si todavía no existe ninguna. Nunca crea una segunda fila si ya hay una —
 * el llamador (`configuracion-empresa.service.ts::getConfiguracion`) siempre
 * intenta `findSingleton` primero.
 */
export async function createWithDefaults(): Promise<ConfiguracionEmpresa> {
  return prisma.configuracionEmpresa.create({ data: { ...DEFAULTS } });
}

export interface UpdateConfiguracionEmpresaData {
  nombre?: string;
  colorPrimario?: string;
  colorSecundario?: string;
  // tema-empresarial-integracion (PASO 6): `null` explícito restaura "sin
  // isotipo" -- distinto de `undefined` (campo no enviado, no se toca).
  logoUrl?: string | null;
}

/**
 * Upsert sobre la fila singleton: si no existe ninguna, la crea con
 * defaults + los campos provistos ya aplicados (nunca dos escrituras
 * separadas). Si existe, actualiza esa fila por `id`.
 */
export async function upsertSingleton(
  data: UpdateConfiguracionEmpresaData,
): Promise<ConfiguracionEmpresa> {
  const existente = await findSingleton();
  if (existente === null) {
    return prisma.configuracionEmpresa.create({
      data: {
        nombre: data.nombre ?? DEFAULTS.nombre,
        colorPrimario: data.colorPrimario ?? DEFAULTS.colorPrimario,
        colorSecundario: data.colorSecundario ?? DEFAULTS.colorSecundario,
        // Sin default de fábrica para el logo (no hay valor en `DEFAULTS`) --
        // `undefined` (campo no enviado) queda como `null` acá a propósito,
        // Prisma no acepta `undefined` en un `create`.
        logoUrl: data.logoUrl ?? null,
      },
    });
  }
  return prisma.configuracionEmpresa.update({
    where: { id: existente.id },
    data,
  });
}
