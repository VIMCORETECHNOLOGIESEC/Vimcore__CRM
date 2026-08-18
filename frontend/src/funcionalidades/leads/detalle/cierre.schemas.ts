import { z } from "zod";

/**
 * Validación de los formularios de cierre (docs/02-reglas-negocio.md,
 * "Cierre Venta"/"Cierre No Venta"). No hay un schema equivalente en
 * `backend/src/schemas` para reutilizar -- M7 (formularios/cierre) no está
 * implementado todavía en el backend (docs/06-modulos-backend.md).
 */

export const cierreVentaSchema = z.object({
  fechaCierre: z.string().min(1, "La fecha de cierre es obligatoria"),
  montoVenta: z
    .number({ error: "El monto es obligatorio" })
    .positive("El monto debe ser mayor a cero"),
  productoVendido: z.string().trim().min(1, "El producto o servicio es obligatorio"),
  formaPago: z.enum(["CONTADO", "CREDITO", "FINANCIAMIENTO"], {
    error: "La forma de pago es obligatoria",
  }),
  observaciones: z.string().trim().optional(),
});

export type CierreVentaFormValues = z.infer<typeof cierreVentaSchema>;

export const cierreNoVentaSchema = z.object({
  fechaCierre: z.string().min(1, "La fecha de cierre es obligatoria"),
  observacionMotivo: z
    .string()
    .trim()
    .min(20, "La observación del motivo debe tener al menos 20 caracteres"),
});

export type CierreNoVentaFormValues = z.infer<typeof cierreNoVentaSchema>;
