import { RolUsuario } from "@prisma/client";
import { z } from "zod";

// Zod 4.4.3: formatos de string en el nivel superior (`z.email()`, `z.uuid()`).
// D9: exactamente los 4 roles del enum nativo de Prisma.
export const createUserBodySchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  // Sin `.toLowerCase()`: `correo` es `@db.Citext`, la comparación ya es
  // insensible a mayúsculas en la base de datos (mismo patrón que auth.schema.ts).
  correo: z.string().trim().pipe(z.email()),
  // Política de alta: mínimo 12 caracteres (distinto del login, que no dicta política).
  password: z.string().min(12).max(128),
  rol: z.enum(RolUsuario),
});

export const updateUserBodySchema = createUserBodySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export const idParamSchema = z.object({ id: z.uuid() });

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
