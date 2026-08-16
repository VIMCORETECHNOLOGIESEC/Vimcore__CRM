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

/**
 * F7 (admin de usuarios): mismo patrón de `leads.schema.ts::listLeadsQuerySchema`
 * — `z.object` descarta claves desconocidas del query string, `pagina`/`limite`
 * comparten el mismo tope (100) que Leads. Orden por defecto: `creadoEn`, el
 * mismo campo que ya usaba `usuario.repository.findAllUsers` (`orderBy:
 * { creadoEn: "asc" }") antes de este cambio — no hay otro campo de fecha en
 * el modelo `Usuario` y cambiar el default de orden sería una regresión
 * silenciosa para el listado ya existente.
 */
export const listUsuariosQuerySchema = z.object({
  // Texto libre contra `nombre` O `correo` (ILIKE — ver `usuarios.service.ts`:
  // ambos campos necesitan `mode: "insensitive"` explícito en el `where`,
  // incluido `correo` pese a ser `@db.Citext`, porque `contains` de Prisma
  // sin `mode` no usa el camino que activa la insensibilidad de citext).
  busqueda: z.string().trim().min(1).optional(),
  rol: z.enum(RolUsuario).optional(),
  // `z.coerce.boolean()` NO sirve acá: `Boolean("false")` es `true` — un
  // `?activo=false` literal se leería como `true`. `z.enum` + `transform`
  // acepta solo los dos literales de texto que puede mandar un query string.
  activo: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  direccion: z.enum(["asc", "desc"]).default("asc"),
});

export type CreateUsuarioBody = z.infer<typeof createUsuarioBodySchema>;
export type UpdateUsuarioBody = z.infer<typeof updateUsuarioBodySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type ListUsuariosQuery = z.infer<typeof listUsuariosQuerySchema>;
