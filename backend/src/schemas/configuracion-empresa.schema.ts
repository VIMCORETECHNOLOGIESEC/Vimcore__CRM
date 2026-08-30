import { hexColorSchema, logoUrlSchema, nombreMarcaSchema } from "schemas";
import { z } from "zod";

/**
 * Integración tema-empresarial: personalización de instancia (nombre visible
 * + colores de marca) para la pantalla de bienvenida post-login. Singleton —
 * sin `id` en el body, el repositorio siempre opera sobre la única fila
 * existente (ver `configuracion-empresa.repository.ts`).
 *
 * `nombreMarcaSchema`/`hexColorSchema`/`logoUrlSchema` viven en el paquete
 * compartido `schemas` (mismo patrón que `loginBodySchema`, AGENTS.md
 * "Formularios con RHF+Zod, reutilizando los esquemas del backend") -- el
 * formulario completo de `ConfiguracionEmpresaPage.tsx` reusa las MISMAS
 * reglas de largo/formato, así que no puede drift respecto a este PATCH.
 */
export const updateConfiguracionEmpresaBodySchema = z
  .object({
    nombre: nombreMarcaSchema,
    colorPrimario: hexColorSchema,
    colorSecundario: hexColorSchema,
    logoUrl: logoUrlSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export type UpdateConfiguracionEmpresaBody = z.infer<typeof updateConfiguracionEmpresaBodySchema>;
