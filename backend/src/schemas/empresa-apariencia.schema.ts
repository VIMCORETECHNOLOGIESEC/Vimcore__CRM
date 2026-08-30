import { hexColorSchema, logoUrlSchema, nombreMarcaSchema } from "schemas";
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

/**
 * tema-empresarial-integracion (PASO 8): admin cross-empresa, exclusivo
 * sessionScope `holding` -- guard propio y separado del self-service de
 * arriba (`controllers/empresa-apariencia.controller.ts`). A diferencia del
 * self-service, este PATCH también puede renombrar la `Empresa` (`nombre`,
 * mismo `nombreMarcaSchema` compartido que `configuracion-empresa.schema.ts`)
 * y es PARCIAL (`.partial()` + "al menos un campo", mismo patrón que
 * `updateConfiguracionEmpresaBodySchema`): un admin de holding puede querer
 * renombrar una empresa sin tocar su paleta, o viceversa -- a diferencia del
 * self-service, cuyo único caso de uso fundacional es "restaurar ambos
 * colores a null", acá forzar el par completo en cada PATCH no tiene sentido.
 */
export const updateEmpresaAparienciaHoldingBodySchema = z
  .object({
    nombre: nombreMarcaSchema,
    colorPrimario: hexColorSchema.nullable(),
    colorSecundario: hexColorSchema.nullable(),
    logoUrl: logoUrlSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export type UpdateEmpresaAparienciaHoldingBody = z.infer<
  typeof updateEmpresaAparienciaHoldingBodySchema
>;

/**
 * `:empresaId` de la URL -- única fuente del id a editar en el endpoint
 * holding (nunca el body). Mismo patrón local que
 * `usuarios.schema.ts::idParamSchema`/`leads.schema.ts::idParamSchema`, con
 * nombre de param propio porque esta ruta no usa `:id`.
 */
export const empresaIdParamSchema = z.object({ empresaId: z.uuid() });
export type EmpresaIdParam = z.infer<typeof empresaIdParamSchema>;
