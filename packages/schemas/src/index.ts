import { z } from "zod";

// Zod 4.4.3: formatos de string en el nivel superior (`z.email()`).
// Único punto de verdad para el contrato de login, compartido entre
// backend/src/schemas/auth.schema.ts y
// frontend/src/funcionalidades/autenticacion/LoginPage.tsx
// (AGENTS.md: "Formularios con RHF+Zod, reutilizando los esquemas del
// backend"). El backend no expone los mensajes de Zod al cliente
// (descarta el detalle en `zodValidationError()`), así que los mensajes
// en español de acá solo los usa el frontend -- no rompen nada del lado
// del backend.
export const loginBodySchema = z.object({
  // Sin `.toLowerCase()`: `correo` es `@db.Citext` en PostgreSQL, la
  // comparación ya es insensible a mayúsculas en la base de datos.
  correo: z.string().trim().pipe(z.email("Ingresá un correo electrónico válido.")),
  // Sin `.min(12)` aquí: al iniciar sesión no se dicta política de contraseña.
  password: z.string().min(1, "Ingresá tu contraseña."),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

/**
 * Política de contraseña compartida entre
 * backend/src/schemas/usuarios.schema.ts (alta/actualización de usuario) y
 * frontend/src/funcionalidades/autenticacion/PerfilPage.tsx (autoservicio
 * de cambio de contraseña). Único punto de verdad para mínimo/máximo.
 */
export const passwordPolicySchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(128, "La contraseña no puede superar los 128 caracteres.");
