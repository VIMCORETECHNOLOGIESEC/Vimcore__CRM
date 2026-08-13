import { z } from "zod";

// Zod 4.4.3: formatos de string en el nivel superior (`z.email()`).
export const loginBodySchema = z.object({
  // Sin `.toLowerCase()`: `correo` es `@db.Citext` en PostgreSQL, la
  // comparación ya es insensible a mayúsculas en la base de datos.
  correo: z.string().trim().pipe(z.email()),
  // Sin `.min(12)` aquí: al iniciar sesión no se dicta política de contraseña.
  password: z.string().min(1),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutBodySchema = refreshBodySchema;

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
