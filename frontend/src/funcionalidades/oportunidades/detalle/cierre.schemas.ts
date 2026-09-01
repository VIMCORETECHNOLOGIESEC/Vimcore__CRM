import { z } from "zod";

/**
 * Validación de los formularios de cierre de una Oportunidad (Bloque D, D7,
 * `POST /oportunidades/:id/cerrar`). Espejo (nombres de campo, mínimos) del
 * `cerrarOportunidadBodySchema` del backend
 * (`backend/src/schemas/negociacion/oportunidad.schema.ts`) -- el frontend no
 * comparte el schema Zod del backend (mismo criterio que
 * `leads/detalle/cierre.schemas.ts`), pero valida en cliente contra las
 * mismas reglas para dar feedback inmediato antes del round-trip al servidor.
 */

export const cierreVentaOportunidadSchema = z.object({
  montoVenta: z
    .number({ error: "El monto es obligatorio" })
    .positive("El monto debe ser mayor a 0"),
  formaPago: z.enum(["CONTADO", "CREDITO", "FINANCIAMIENTO"], {
    error: "Elige una forma de pago",
  }),
});

export type CierreVentaOportunidadFormValues = z.infer<typeof cierreVentaOportunidadSchema>;

export const cierreNoVentaOportunidadSchema = z.object({
  observacionCierre: z.string().trim().min(20, "Mínimo 20 caracteres"),
});

export type CierreNoVentaOportunidadFormValues = z.infer<typeof cierreNoVentaOportunidadSchema>;
