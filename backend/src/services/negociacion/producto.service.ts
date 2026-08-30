import { Prisma, type Producto } from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import * as productoRepository from "../../repositories/negociacion/producto.repository.js";
import type { CrearProductoBody, ListProductosQuery } from "../../schemas/negociacion/producto.schema.js";
import type { AuthenticatedUser } from "../../types/authenticated-user.js";

/**
 * Una sesión company-scoped nunca puede elegir su empresa por body -- mismo
 * criterio anti-escalamiento que `leads.access.ts::aplicarFiltroEmpresa`. Una
 * sesión holding-wide (ADMINISTRADOR/SUPERVISOR sin `Membresia` propia, D2)
 * no tiene una empresa de sesión de la que derivarlo, así que el body debe
 * traerla explícita -- decisión propia, no especificada por el negocio.
 */
function resolveEmpresaId(usuario: AuthenticatedUser, empresaIdBody: string | undefined): string {
  if (usuario.empresaId !== null) return usuario.empresaId;
  if (!empresaIdBody) {
    throw new AppError(
      "empresa_requerida",
      400,
      "Debes indicar empresaId explícitamente para una sesión holding-wide",
    );
  }
  return empresaIdBody;
}

export async function crearProducto(usuario: AuthenticatedUser, body: CrearProductoBody): Promise<Producto> {
  const empresaId = resolveEmpresaId(usuario, body.empresaId);
  try {
    return await productoRepository.createProducto({ empresaId, nombre: body.nombre });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("producto_duplicado", 409, "Ya existe un producto con ese nombre en esta empresa");
    }
    throw error;
  }
}

/**
 * `GET /productos`: "cualquiera lista para elegir producto al crear una
 * Oportunidad" -- sin restricción de rol. `empresaId` de query solo aplica a
 * una sesión holding-wide (mismo criterio que `resolveEmpresaId` arriba); una
 * sesión company-scoped siempre queda acotada a su propia empresa, sin
 * excepción.
 */
export async function listarProductos(usuario: AuthenticatedUser, query: ListProductosQuery): Promise<Producto[]> {
  const where: Prisma.ProductoWhereInput = {};
  if (usuario.empresaId !== null) {
    where.empresaId = usuario.empresaId;
  } else if (query.empresaId) {
    where.empresaId = query.empresaId;
  }
  if (query.activo !== undefined) where.activo = query.activo;

  return productoRepository.findMany(where);
}
