import { EtapaLead, FormaPago } from "@prisma/client";
import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid() });

/**
 * negociacion (Bloque D, D13/D14): `productoId` es opcional -- una
 * negociación puede arrancar sin producto elegido todavía. El dedup de D14
 * (¿ya existe una Oportunidad ABIERTA para este `leadId`+`productoId`?) y la
 * asignación automática por pool (D3/D4) corren en `oportunidad.service.ts`,
 * nunca acá.
 */
export const crearOportunidadBodySchema = z.object({
  leadId: z.uuid(),
  productoId: z.uuid().optional(),
});

const LIMITES_PERMITIDOS = [10, 25, 50, 100] as const;

/**
 * `GET /oportunidades`: mismo criterio DD5 que `leads.schema.ts::listLeadsQuerySchema`
 * -- `empresaId`/`asesorId` solo los aplica `oportunidad.service.ts` para
 * ADMINISTRADOR/SUPERVISOR; un ASESOR/VENDEDOR ya queda acotado a su propia
 * cartera por el `where` de rol, independientemente de lo que envíe acá.
 */
export const listOportunidadesQuerySchema = z.object({
  leadId: z.uuid().optional(),
  empresaId: z.uuid().optional(),
  asesorId: z.uuid().optional(),
  etapa: z.enum(EtapaLead).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce
    .number()
    .int()
    .refine((v) => (LIMITES_PERMITIDOS as readonly number[]).includes(v), {
      message: "limite debe ser 10, 25, 50 o 100",
    })
    .default(25),
});

/**
 * `PATCH /oportunidades/:id/etapa`: solo los dos pasos intermedios -- VENTA/
 * NO_VENTA cierran vía `POST /oportunidades/:id/cerrar` (autoridad de cierre
 * D7 propia, distinta de la edición de etapa intermedia).
 */
export const patchOportunidadEtapaBodySchema = z.object({
  etapa: z.enum(["CONTACTADO", "CITA"]),
});

/**
 * `POST /oportunidades/:id/cerrar`: unión discriminada por `etapa`, mismo
 * patrón que `leads.schema.ts::patchEtapaBodySchema`. A diferencia de Lead,
 * VENTA no lleva `productoServicio` de texto libre -- Oportunidad ya tiene
 * `productoId` (FK al catálogo D14) desde su creación.
 */
export const cerrarOportunidadBodySchema = z.discriminatedUnion("etapa", [
  z.object({
    etapa: z.literal("VENTA"),
    montoVenta: z.number().positive(),
    formaPago: z.enum(FormaPago),
  }),
  z.object({
    etapa: z.literal("NO_VENTA"),
    observacionCierre: z.string().trim().min(20),
  }),
]);

/**
 * `POST /oportunidades/:id/reasignar` (D9, excepción administrativa):
 * `asesorId` es el destinatario elegido a mano por el Administrador/
 * Supervisor -- nunca corre el algoritmo de pool (D3/D4) para este camino.
 */
export const reasignarOportunidadBodySchema = z.object({
  asesorId: z.uuid(),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type CrearOportunidadBody = z.infer<typeof crearOportunidadBodySchema>;
export type ListOportunidadesQuery = z.infer<typeof listOportunidadesQuerySchema>;
export type PatchOportunidadEtapaBody = z.infer<typeof patchOportunidadEtapaBodySchema>;
export type CerrarOportunidadBody = z.infer<typeof cerrarOportunidadBodySchema>;
export type ReasignarOportunidadBody = z.infer<typeof reasignarOportunidadBodySchema>;
