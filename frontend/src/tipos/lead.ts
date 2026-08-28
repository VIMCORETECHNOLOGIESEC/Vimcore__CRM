/**
 * Tipos compartidos con el backend para leads (docs/03-modelo-datos.md
 * §`leads`, docs/06-modulos-backend.md M5). Mantenerlos sincronizados
 * manualmente: el frontend no comparte el cliente de Prisma generado (mismo
 * criterio que `tipos/usuario.ts`).
 */
import type { RolUsuario } from "./usuario";

export type OrigenLead = "NUEVO" | "REINGRESO";

export type RedSocial =
  | "FACEBOOK"
  | "INSTAGRAM"
  | "X"
  | "LINKEDIN"
  | "GOOGLE_FORMS"
  | "API_EXTERNA";

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
  /**
   * `false` cuando el teléfono capturado no pasó validación (formato,
   * inexistente, etc.) -- F4, "marca de dato inválido". Opcional y ausente
   * en fixtures/tests de F3 anteriores a esta extensión: se trata como
   * "válido" (sin marca) cuando no viene informado, nunca como inválido por
   * default.
   */
  telefonoValido?: boolean;
  /**
   * Correos adicionales del cliente además de `correoPrincipal` (F4, "el
   * cliente puede tener varios correos"). Opcional para no romper fixtures
   * de F3 que no lo declaran.
   */
  correosSecundarios?: string[];
}

export interface CampaniaLead {
  id: string;
  nombre: string;
}

/** Cuenta publicitaria de origen del lead (F4, docs/07 "Origen"). */
export interface CuentaPublicitariaLead {
  id: string;
  nombre: string;
}

/** Forma de pago del cierre en Venta (F4, docs/02-reglas-negocio.md formulario de cierre). */
export type FormaPago = "CONTADO" | "CREDITO" | "FINANCIAMIENTO";

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
  /** Nulo hasta que el lead se califica (D14) -- p.ej. recién ingresado por un bridge. */
  semaforo: SemaforoLead | null;
  /** Nulo hasta que el lead se califica (D14). */
  puntuacion: number | null;
  asesor: ResponsableLead | null;
  vendedor: ResponsableLead | null;
  /** ISO 8601 (UTC). Nulo si nunca se asignó. */
  slaInicioEn: string | null;
  /** ISO 8601 (UTC). */
  ingresadoEn: string;
  /** ISO 8601 (UTC). No nulo solo en etapas terminales. */
  cerradoEn: string | null;
  /** Cuenta publicitaria de origen (F4). Opcional, ausente en fixtures previas a esta extensión. */
  cuentaPublicitaria?: CuentaPublicitariaLead | null;
  /**
   * Campos dinámicos del formulario de la campaña (F4): JSON crudo sin
   * schema fijo por diseño (docs/07 F4, "campos dinámicos del formulario de
   * la campaña") -- clave/valor de texto simple, sin tipado fuerte
   * intencionalmente. Opcional para no romper fixtures previas.
   */
  camposDinamicos?: Record<string, string>;
  /** Campos de cierre en Venta (F4). `null`/ausente hasta que se cierra. */
  montoVenta?: number | null;
  productoVendido?: string | null;
  formaPago?: FormaPago | null;
  /** Observación de cierre: motivo obligatorio (mín. 20 caracteres) en No Venta, opcional en Venta. */
  observacionCierre?: string | null;
}
