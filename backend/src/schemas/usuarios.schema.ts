import { RolUsuario } from "@prisma/client";
import { z } from "zod";

// Zod 4.4.3: formatos de string en el nivel superior (`z.email()`, `z.uuid()`).
// D9: exactamente los 4 roles del enum nativo de Prisma.
export const createUsuarioBodySchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  // Sin `.toLowerCase()`: `correo` es `@db.Citext`, la comparación ya es
  // insensible a mayúsculas en la base de datos (mismo patrón que auth.schema.ts).
  correo: z.string().trim().pipe(z.email()),
  // Política de alta: mínimo 12 caracteres (distinto del login, que no dicta política).
  password: z.string().min(12).max(128),
  rol: z.enum(RolUsuario),
});

export const updateUsuarioBodySchema = createUsuarioBodySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export const idParamSchema = z.object({ id: z.uuid() });

/**
 * F3/F4 (diseño D-A1, catálogo de responsables): `rol` es obligatorio — el
 * catálogo siempre se consulta acotado a un pool (ASESOR para asignación
 * individual/lote). Sin filtro por equipo (spec: "sin filtro por equipo").
 */
export const listResponsablesQuerySchema = z.object({
  rol: z.enum(RolUsuario),
});

export type CreateUsuarioBody = z.infer<typeof createUsuarioBodySchema>;
export type UpdateUsuarioBody = z.infer<typeof updateUsuarioBodySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type ListResponsablesQuery = z.infer<typeof listResponsablesQuerySchema>;
