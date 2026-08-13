import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface AttachCorreoData {
  clienteId: string;
  correo: string;
  correoNormalizado: string;
}

/**
 * D3 (variante `correos_cliente`): `DO NOTHING ... RETURNING id`. A
 * diferencia de `clientes`, cero filas devueltas aquí es la respuesta
 * significativa "el correo ya estaba adjunto", no un fallo. `es_principal`
 * se calcula en la misma sentencia para que "el primero recibido" se
 * cumpla sin una lectura previa.
 */
export async function attachCorreo(
  data: AttachCorreoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<{ correoAdjuntado: boolean }> {
  const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO correos_cliente (id, cliente_id, correo, correo_normalizado, es_principal)
    VALUES (${randomUUID()}::uuid, ${data.clienteId}::uuid, ${data.correo}, ${data.correoNormalizado},
            NOT EXISTS (SELECT 1 FROM correos_cliente WHERE cliente_id = ${data.clienteId}::uuid))
    ON CONFLICT (cliente_id, correo_normalizado) DO NOTHING
    RETURNING id
  `);

  return { correoAdjuntado: rows.length > 0 };
}
