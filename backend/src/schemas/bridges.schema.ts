import { RedSocial } from "@prisma/client";
import { z } from "zod";

// D-M4-fundacion (diseño m4-bridges-crud-fundacion): Zod 4.4.3, mismo patrón
// que `usuarios.schema.ts` (formatos top-level, enum nativo de Prisma como
// valor en runtime).
export const createBridgeBodySchema = z.object({
  redSocial: z.enum(RedSocial),
  nombre: z.string().trim().min(1).max(120),
});

/**
 * Requirement: PATCH /bridges/:id es el único endpoint para rename/
 * deactivate/reactivate. `estado` se restringe a `ACTIVO|INACTIVO` — nunca
 * los valores system-authored `TOKEN_EXPIRADO`/`ERROR` (diseño DD "single
 * PATCH..."), que quedan fuera del enum aceptado y por lo tanto rechazados
 * con 400 por Zod, sin que el servicio tenga que revalidarlos.
 */
export const updateBridgeBodySchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    estado: z.enum(["ACTIVO", "INACTIVO"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export const idParamSchema = z.object({ id: z.uuid() });

export type CreateBridgeBody = z.infer<typeof createBridgeBodySchema>;
export type UpdateBridgeBody = z.infer<typeof updateBridgeBodySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
