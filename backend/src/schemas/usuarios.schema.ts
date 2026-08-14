import { RolUsuario } from "@prisma/client";
import { z } from "zod";
import { passwordPolicySchema } from "schemas";

// Zod 4.4.3: formatos de string en el nivel superior (`z.email()`, `z.uuid()`).
// D9: exactamente los 4 roles del enum nativo de Prisma.
export const createUsuarioBodySchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  // Sin `.toLowerCase()`: `correo` es `@db.Citext`, la comparación ya es
  // insensible a mayúsculas en la base de datos (mismo patrón que auth.schema.ts).
  correo: z.string().trim().pipe(z.email()),
  // Política de alta (docs/07 F2): mínimo 12 caracteres, único punto de
  // verdad compartido con el frontend en packages/schemas.
  password: passwordPolicySchema,
  rol: z.enum(RolUsuario),
});

export const updateUsuarioBodySchema = createUsuarioBodySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export const idParamSchema = z.object({ id: z.uuid() });

export type CreateUsuarioBody = z.infer<typeof createUsuarioBodySchema>;
export type UpdateUsuarioBody = z.infer<typeof updateUsuarioBodySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
