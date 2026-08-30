import { hexColorSchema, logoUrlSchema } from "schemas";
import { z } from "zod";

/**
 * tema-empresarial-integracion (Tarea 3): endpoint self-service para que el
 * ADMINISTRADOR de UNA empresa edite/restaure el color propio de SU empresa
 * (`Empresa.colorPrimario/colorSecundario`, nullable). `hexColorSchema`/
 * `logoUrlSchema` vienen del paquete compartido `schemas` (mismo import que
 * `configuracion-empresa.schema.ts`) -- no redeclara el regex/formato acá,
 * así los dos módulos que escriben este mismo tipo de campo nunca pueden
 * divergir en silencio.
 *
 * Ambos colores son requeridos (no `.partial()` como en
 * `configuracion-empresa.schema.ts`): el caso de uso fundacional de este
 * cambio es "restaurar a null", y aceptar un PATCH parcial abriría la puerta
 * a dejar un solo campo en `null` y el otro con un hex viejo -- un estado a
 * medio camino que ningún flujo de UI necesita todavía. `null` es un valor
 * explícito y válido para cada campo (restaura el nivel intermedio/holding
 * de la jerarquía de `color-marca.ts`), no la ausencia del campo.
 *
 * `logoUrl` (PASO 6, isotipo propio de la empresa) es OPCIONAL además de
 * `nullable`, a diferencia de los colores: es ortogonal a ellos -- exigirlo
 * en cada PATCH de color forzaría al admin a reenviar (o resetear) el logo
 * cada vez que solo quiere tocar su paleta, algo que ningún flujo de UI
 * necesita.
 */
export const updateEmpresaAparienciaBodySchema = z.object({
  colorPrimario: hexColorSchema.nullable(),
  colorSecundario: hexColorSchema.nullable(),
  logoUrl: logoUrlSchema.nullable().optional(),
});

export type UpdateEmpresaAparienciaBody = z.infer<typeof updateEmpresaAparienciaBodySchema>;
