import type { Prisma, Producto } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

export interface CreateProductoData {
  empresaId: string;
  nombre: string;
}

/**
 * negociacion (Bloque D, D14): `@@unique([empresaId, nombre])` en el schema
 * es la guarda real contra duplicados -- este `create` deja que Postgres
 * rechace con P2002; `producto.service.ts` lo traduce a un `AppError` de
 * negocio (409), nunca lo verifica con una consulta previa (evita una
 * carrera de lectura-luego-escritura).
 */
export async function createProducto(
  data: CreateProductoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Producto> {
  return client.producto.create({ data });
}

export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Producto | null> {
  return client.producto.findUnique({ where: { id } });
}

export async function findMany(
  where: Prisma.ProductoWhereInput,
  client: PrismaClientOrTransaction = prisma,
): Promise<Producto[]> {
  return client.producto.findMany({ where, orderBy: { nombre: "asc" } });
}
