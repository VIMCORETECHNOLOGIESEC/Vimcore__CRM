import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid() });

/**
 * negociacion (Bloque D, D14): catálogo de productos por empresa. `nombre`
 * es el único campo de negocio -- el resto (`activo`, `id`, `empresaId`) lo
 * decide el servidor. `empresaId` es opcional acá porque una sesión
 * holding-wide (ADMINISTRADOR/SUPERVISOR sin `Membresia` propia, D2) no tiene
 * una empresa de sesión de la que derivarlo -- `producto.service.ts` exige
 * el campo en ese caso puntual (ver `resolveEmpresaId`) y lo ignora/sobrescribe
 * con la empresa de la sesión para cualquier sesión company-scoped, mismo
 * criterio anti-escalamiento que `leads.access.ts::aplicarFiltroEmpresa`.
 */
export const crearProductoBodySchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  empresaId: z.uuid().optional(),
});

export const listProductosQuerySchema = z.object({
  empresaId: z.uuid().optional(),
  activo: z.coerce.boolean().optional(),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type CrearProductoBody = z.infer<typeof crearProductoBodySchema>;
export type ListProductosQuery = z.infer<typeof listProductosQuerySchema>;
