import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { assertAuthenticated } from "../../lib/assert-authenticated.js";
import { crearProductoBodySchema, listProductosQuerySchema } from "../../schemas/negociacion/producto.schema.js";
import { crearProducto, listarProductos } from "../../services/negociacion/producto.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

/** `POST /productos` -- ADMINISTRADOR gestiona el catálogo (`requireRole`, ver el router). */
export async function postProducto(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedBody = crearProductoBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const producto = await crearProducto(usuario, parsedBody.data);
  res.status(201).json({ producto });
}

/** `GET /productos` -- cualquier usuario autenticado lista, para elegir producto al crear una Oportunidad. */
export async function getProductos(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedQuery = listProductosQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) throw zodValidationError();

  const productos = await listarProductos(usuario, parsedQuery.data);
  res.status(200).json({ productos });
}
