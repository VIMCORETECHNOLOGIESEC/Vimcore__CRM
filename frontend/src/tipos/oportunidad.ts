/**
 * Tipos compartidos con el backend para el Bloque D (Oportunidad /
 * negociación). Mirror hecho a mano de las formas de Prisma -- el frontend no
 * comparte el cliente generado (mismo criterio que `tipos/lead.ts` y
 * `tipos/usuario.ts`). Contrato verificado contra
 * `backend/src/repositories/negociacion/oportunidad.repository.ts`
 * (`OPORTUNIDAD_RELACIONES_INCLUDE`), `backend/prisma/schema.prisma`
 * (`model Oportunidad` / `model Producto` / `model OportunidadEvento`) y
 * `backend/src/schemas/negociacion/*.schema.ts`.
 *
 * Los enums de embudo se reutilizan tal cual de `tipos/lead.ts`
 * (`EtapaLead`, `FormaPago`, `SemaforoLead`) -- `Oportunidad` reusa esos
 * mismos enums de Prisma (D13), no define unos propios.
 */
import type { EtapaLead, FormaPago, OrigenLead, RedSocial, SemaforoLead } from "./lead";
import type { RolUsuario } from "./usuario";

/**
 * Producto del catálogo por empresa (D14). "Catálogo" = listar + crear: el
 * backend no expone PATCH/DELETE/toggle. `creadoEn` es ISO 8601 (UTC),
 * mismo criterio que `Lead.ingresadoEn`.
 */
export interface ProductoOportunidad {
  id: string;
  empresaId: string;
  nombre: string;
  activo: boolean;
  creadoEn: string;
}

/**
 * Responsable operativo de una oportunidad (`asesor` o `vendedor`). Forma de
 * `responsableSelect` en `oportunidad.repository.ts` (`{ id, nombre, rol }`).
 * `rol` es el rol global del `Usuario`: normalmente ASESOR/VENDEDOR, pero un
 * Administrador/Supervisor que tomó la negociación por la excepción D9 queda
 * como `asesor` conservando su rol global -- por eso el tipo no se estrecha.
 */
export interface ResponsableOportunidad {
  id: string;
  nombre: string;
  rol: RolUsuario;
}

/** Cliente embebido en `oportunidad.lead` (include `{ cliente: true }`, sin la relación `correos`). */
export interface ClienteOportunidad {
  id: string;
  nombre: string;
  telefonoOriginal: string;
  telefonoNormalizado: string;
  telefonoValido: boolean;
}

/** Lead embebido en la oportunidad enriquecida (subconjunto consumido por la UI de detalle). */
export interface LeadOportunidad {
  id: string;
  etapa: EtapaLead;
  origen: OrigenLead;
  redSocial: RedSocial | null;
  cliente: ClienteOportunidad;
}

/**
 * Forma enriquecida que devuelven los GET (`GET /oportunidades`,
 * `GET /oportunidades/:id`) -- `OportunidadConRelaciones` del backend:
 * modelo plano + `lead` (con `cliente`) + `producto` + `asesor` + `vendedor`.
 * Las mutaciones (`POST /oportunidades`, `PATCH .../etapa`, `POST .../cerrar`,
 * `POST .../reasignar`) devuelven el modelo PLANO sin relaciones -- el
 * llamador nunca lee esa respuesta, invalida las keys y deja que el detalle
 * enriquecido se vuelva a traer.
 *
 * `montoVenta` llega como `Prisma.Decimal` serializado (string JSON) y se
 * normaliza a `number | null` en el mapper (mismo criterio que
 * `mapLeadFromApi`). Todas las fechas son ISO 8601 (UTC).
 */
export interface Oportunidad {
  id: string;
  leadId: string;
  empresaId: string;
  productoId: string | null;
  etapa: EtapaLead;
  /** Nulo hasta que la oportunidad se califica (D14). */
  semaforo: SemaforoLead | null;
  /** Nulo hasta que la oportunidad se califica (D14). */
  puntuacion: number | null;
  asesorId: string | null;
  vendedorId: string | null;
  /** Normalizado a número en el mapper; nulo hasta el cierre en VENTA. */
  montoVenta: number | null;
  observacionCierre: string | null;
  formaPago: FormaPago | null;
  /** ISO 8601 (UTC). Nulo mientras no haya asesor asignado. */
  slaInicioEn: string | null;
  /** ISO 8601 (UTC). No nulo solo en etapas terminales. */
  cerradaEn: string | null;
  /** ISO 8601 (UTC). */
  creadaEn: string;
  /** CAS optimista de asignación (Bloque C) -- lo usa el backend, no la UI. */
  version: number;
  lead: LeadOportunidad;
  producto: ProductoOportunidad | null;
  asesor: ResponsableOportunidad | null;
  vendedor: ResponsableOportunidad | null;
}

/**
 * Forma PLANA que devuelven las mutaciones (`POST /oportunidades`,
 * `PATCH .../etapa`, `POST .../cerrar`, `POST .../reasignar`): el modelo sin
 * ninguna relación embebida. La UI nunca la renderiza directamente -- se usa
 * a lo sumo para leer el `id` recién creado antes de refetchear el detalle
 * enriquecido (riesgo #8 del plan de Bloque D).
 */
export type OportunidadPlana = Omit<Oportunidad, "lead" | "producto" | "asesor" | "vendedor">;

/**
 * Tipos de evento del log append-only de una oportunidad
 * (`enum TipoEventoOportunidad`). Definido solo para compatibilidad futura:
 * NO hay endpoint de eventos en este corte, el detalle muestra el estado
 * actual (igual que `LeadDetallePage`).
 */
export type TipoEventoOportunidad =
  | "ASIGNADA_POOL"
  | "ASIGNADA_EXCEPCION_ADMINISTRATIVA"
  | "SIN_ASIGNAR"
  | "REASIGNADA_TRASPASO"
  | "ETAPA_CAMBIADA"
  | "CERRADA";

/**
 * Fila de `model OportunidadEvento` -- forward-compat only (ver arriba). Sin
 * mapper ni fetch en este corte.
 */
export interface OportunidadEvento {
  id: string;
  oportunidadId: string;
  empresaId: string;
  usuarioId: string | null;
  tipo: TipoEventoOportunidad;
  etapaAnterior: EtapaLead | null;
  etapaNueva: EtapaLead | null;
  detalle: Record<string, unknown> | null;
  /** ISO 8601 (UTC). */
  ocurridoEn: string;
}
