import { z } from "zod";

/**
 * Integración tema-empresarial: personalización de instancia (nombre visible
 * + colores de marca) para la pantalla de bienvenida post-login. Singleton —
 * sin `id` en el body, el repositorio siempre opera sobre la única fila
 * existente (ver `configuracion-empresa.repository.ts`).
 */
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser un hex de 6 dígitos, p. ej. #1e2a5e");

export const updateConfiguracionEmpresaBodySchema = z
  .object({
    nombre: z.string().trim().min(1).max(80),
    colorPrimario: hexColorSchema,
    colorSecundario: hexColorSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export type UpdateConfiguracionEmpresaBody = z.infer<typeof updateConfiguracionEmpresaBodySchema>;
