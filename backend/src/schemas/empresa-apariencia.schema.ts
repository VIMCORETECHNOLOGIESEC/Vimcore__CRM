import { z } from "zod";

/**
 * tema-empresarial-integracion (Tarea 3): endpoint self-service para que el
 * ADMINISTRADOR de UNA empresa edite/restaure el color propio de SU empresa
 * (`Empresa.colorPrimario/colorSecundario`, nullable). Mismo formato/regex
 * hex que `configuracion-empresa.schema.ts::hexColorSchema` -- no diverge el
 * formato de validación entre los dos módulos que escriben este mismo tipo
 * de campo.
 *
 * Ambos campos son requeridos (no `.partial()` como en
 * `configuracion-empresa.schema.ts`): el caso de uso fundacional de este
 * cambio es "restaurar a null", y aceptar un PATCH parcial abriría la puerta
 * a dejar un solo campo en `null` y el otro con un hex viejo -- un estado a
 * medio camino que ningún flujo de UI necesita todavía. `null` es un valor
 * explícito y válido para cada campo (restaura el nivel intermedio/holding
 * de la jerarquía de `color-marca.ts`), no la ausencia del campo.
 */
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser un hex de 6 dígitos, p. ej. #1e2a5e");

export const updateEmpresaAparienciaBodySchema = z.object({
  colorPrimario: hexColorSchema.nullable(),
  colorSecundario: hexColorSchema.nullable(),
});

export type UpdateEmpresaAparienciaBody = z.infer<typeof updateEmpresaAparienciaBodySchema>;
