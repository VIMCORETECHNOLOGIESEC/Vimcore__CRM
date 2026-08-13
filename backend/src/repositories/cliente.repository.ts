import { randomUUID } from "node:crypto";
import type { Cliente } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * Alias snake_case -> camelCase para que `$queryRaw` devuelva filas ya con
 * la forma de `Cliente` de Prisma: sin mapeo manual, sin pérdida silenciosa
 * de campos (D3, diseño M3).
 */
const CLIENTE_RETURNING = Prisma.sql`
  id,
  nombre,
  telefono_original    AS "telefonoOriginal",
  telefono_normalizado AS "telefonoNormalizado",
  telefono_valido      AS "telefonoValido",
  creado_en            AS "creadoEn"
`;

export interface UpsertClienteData {
  nombre: string | null;
  telefonoOriginal: string;
  telefonoNormalizado: string;
  creadoEn: Date;
}

/**
 * D3: resolución de identidad por teléfono válido — `ON CONFLICT ... DO
 * UPDATE` (nunca `upsert`/catch-P2002) para garantizar exactamente una fila
 * incluso ante N webhooks concurrentes con el mismo teléfono. `xmax = 0` es
 * el idioma de Postgres para distinguir inserción de conflicto dentro de la
 * misma sentencia, sin ronda extra ni ventana de carrera adicional.
 */
export async function upsertByTelefonoNormalizado(
  data: UpsertClienteData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cliente & { clienteCreado: boolean }> {
  const [row] = await client.$queryRaw<Array<Cliente & { clienteCreado: boolean }>>(Prisma.sql`
    INSERT INTO clientes (id, nombre, telefono_original, telefono_normalizado, telefono_valido, creado_en)
    VALUES (${randomUUID()}::uuid, ${data.nombre}, ${data.telefonoOriginal},
            ${data.telefonoNormalizado}, TRUE, ${data.creadoEn}::timestamptz)
    ON CONFLICT (telefono_normalizado)
    DO UPDATE SET telefono_normalizado = EXCLUDED.telefono_normalizado
    RETURNING ${CLIENTE_RETURNING}, (xmax = 0) AS "clienteCreado"
  `);

  return row; // DO UPDATE garantiza exactamente una fila, siempre
}

/**
 * D7: resolución de respaldo cuando el teléfono es inválido — busca un
 * cliente ya registrado por correo. Deliberadamente NO filtra por
 * `telefonoValido: false`: encontrar un cliente que antes entró con
 * teléfono válido es el resultado deseado. Orden `creadoEn asc` para
 * converger de forma determinista al cliente más antiguo si el hueco
 * residual de D7 ya produjo duplicados.
 */
export async function findByCorreoNormalizado(
  correoNormalizado: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cliente | null> {
  return client.cliente.findFirst({
    where: { correos: { some: { correoNormalizado } } },
    orderBy: { creadoEn: "asc" },
  });
}

export interface CreateClienteSinTelefonoData {
  nombre: string | null;
  telefonoOriginal: string | null;
  creadoEn: Date;
}

export async function createWithoutTelefono(
  data: CreateClienteSinTelefonoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cliente> {
  return client.cliente.create({
    data: { ...data, telefonoNormalizado: null, telefonoValido: false },
  });
}
