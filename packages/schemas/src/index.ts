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

/**
 * Marca de empresa/holding (tema-empresarial-integracion): compartido entre
 * backend/src/schemas/configuracion-empresa.schema.ts (singleton holding,
 * `.partial()` para PATCH) y
 * frontend/src/funcionalidades/configuracion-empresa/ConfiguracionEmpresaPage.tsx
 * (formulario completo). Único punto de verdad para los límites -- antes de
 * esto el frontend tenía su propio `.max(120)` para `nombre` (backend: 80) y
 * ningún `.max()` para `logoUrl` (backend: 2048), un formulario podía pasar
 * validación del lado cliente y romper con un 400 del backend igual.
 */
export const NOMBRE_MARCA_MAX_LENGTH = 80;
export const nombreMarcaSchema = z
  .string()
  .trim()
  .min(1, "Ingresá el nombre de la empresa.")
  .max(NOMBRE_MARCA_MAX_LENGTH, `El nombre no puede superar los ${NOMBRE_MARCA_MAX_LENGTH} caracteres.`);

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Ingresá un color hexadecimal válido (ej. #1e2a5e).");

/**
 * URL del isotipo (SVG preferido, PNG ≥512×512 de respaldo) -- sin
 * subsistema de upload, se pega la URL a mano. `.max(2048)` es un límite
 * defensivo genérico de largo de URL, no una validación de dominio.
 */
export const LOGO_URL_MAX_LENGTH = 2048;
export const logoUrlSchema = z
  .string()
  .trim()
  .url("Ingresá una URL válida (ej. https://cdn.miempresa.com/logo.svg).")
  .max(LOGO_URL_MAX_LENGTH);
