/**
 * Tipos compartidos con el backend para leads (docs/03-modelo-datos.md
 * §`leads`, docs/06-modulos-backend.md M5). Mantenerlos sincronizados
 * manualmente: el frontend no comparte el cliente de Prisma generado (mismo
 * criterio que `tipos/usuario.ts`).
 */
import type { RolUsuario } from "./usuario";

export type OrigenLead = "NUEVO" | "REINGRESO";

export type RedSocial = "FACEBOOK" | "INSTAGRAM" | "X" | "LINKEDIN" | "GOOGLE_FORMS";

export type EtapaLead = "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";

export type SemaforoLead = "ROJO" | "AMARILLO" | "VERDE";

/**
 * Estado de SLA: calculado, nunca persistido (docs/02-reglas-negocio.md §7).
 * `CERRADO` no es uno de los tres estados documentados ahí -- es una
 * extensión propia del frontend para leads en etapa terminal, donde el
 * reloj se detiene y no tiene sentido mostrar una cuenta regresiva.
 */
export type EstadoSla = "A_TIEMPO" | "EN_RIESGO" | "ATRASADO" | "CERRADO";

/** Responsable operativo de un lead (docs/02-reglas-negocio.md §5). */
export interface ResponsableLead {
  id: string;
  nombre: string;
  rol: Extract<RolUsuario, "ASESOR" | "VENDEDOR">;
}

export interface ClienteLead {
  id: string;
  nombre: string;
  /** Tal como llegó (docs/03 §`clientes.telefono_original`) -- se usa para mostrar y buscar. */
  telefonoOriginal: string;
  /** E.164, clave de identidad (docs/03 §`clientes.telefono_normalizado`). */
  telefonoNormalizado: string;
  correoPrincipal: string | null;
}

export interface CampaniaLead {
  id: string;
  nombre: string;
}

/**
 * Forma de una fila de `GET /api/v1/leads` (docs/03 §`leads` + relaciones
 * embebidas para evitar N+1 en la tabla). `asesor`/`vendedor` van por
 * separado en vez de un único `responsable` porque la UI necesita distinguir
 * quién es cada uno (traspaso, F4); `getResponsable()` en `leads.utils.ts`
 * resuelve cuál es el responsable operativo vigente.
 */
export interface Lead {
  id: string;
  cliente: ClienteLead;
  campania: CampaniaLead | null;
  origen: OrigenLead;
  redSocial: RedSocial;
  etapa: EtapaLead;
  semaforo: SemaforoLead;
  puntuacion: number;
  asesor: ResponsableLead | null;
  vendedor: ResponsableLead | null;
  /** ISO 8601 (UTC). Nulo si nunca se asignó. */
  slaInicioEn: string | null;
  /** ISO 8601 (UTC). */
  ingresadoEn: string;
  /** ISO 8601 (UTC). No nulo solo en etapas terminales. */
  cerradoEn: string | null;
}
