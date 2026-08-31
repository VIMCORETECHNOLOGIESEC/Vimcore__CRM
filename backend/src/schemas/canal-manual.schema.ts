import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid() });

/**
 * Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico",
 * docs/blocks/d-routing-oportunidad.md:266-299): catálogo dinámico de
 * canales sin bridge (referido, llamada, feria) por empresa. `nombre` es el
 * único campo de negocio -- el resto (`activo`, `id`, `empresaId`) lo decide
 * el servidor. Mismo criterio de `empresaId` opcional que
 * `producto.schema.ts::crearProductoBodySchema` -- una sesión holding-wide
 * (ADMINISTRADOR/SUPERVISOR_HOLDING/SUPER_ADMIN sin `Membresia` propia) no
 * tiene una empresa de sesión de la que derivarlo, `canal-manual.service.ts`
 * exige el campo en ese caso puntual (`resolveEmpresaId`).
 */
export const crearCanalManualBodySchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  empresaId: z.uuid().optional(),
});

export const listCanalesManualesQuerySchema = z.object({
  empresaId: z.uuid().optional(),
  // Mismo criterio ya establecido en `producto.schema.ts::listProductosQuerySchema`
  // (y antes en `usuarios.schema.ts::listUsuariosQuerySchema`) -- `z.coerce.boolean()`
  // coerciona cualquier string no vacío (incluido "false") a `true`.
  activo: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

/**
 * `PATCH /canales-manuales/:id`: edición parcial -- al menos un campo debe
 * venir, si no el request no tiene ningún efecto y se rechaza explícito en
 * vez de aceptar un no-op silencioso.
 */
export const editarCanalManualBodySchema = z
  .object({
    nombre: z.string().trim().min(1).max(200).optional(),
    activo: z.boolean().optional(),
  })
  .refine((data) => data.nombre !== undefined || data.activo !== undefined, {
    message: "Debes indicar al menos un campo a editar (nombre o activo)",
  });

export type IdParam = z.infer<typeof idParamSchema>;
export type CrearCanalManualBody = z.infer<typeof crearCanalManualBodySchema>;
export type ListCanalesManualesQuery = z.infer<typeof listCanalesManualesQuerySchema>;
export type EditarCanalManualBody = z.infer<typeof editarCanalManualBodySchema>;
