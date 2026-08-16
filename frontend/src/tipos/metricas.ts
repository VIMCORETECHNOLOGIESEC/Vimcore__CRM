/**
 * Tipos del dashboard de métricas (F5, docs/08-dashboard-kpis.md). Espejo de
 * lo que devolverían los endpoints de M9 (`docs/06-modulos-backend.md`,
 * `GET /api/v1/metricas/*`) -- hoy no existen ni como esqueleto, ver
 * `funcionalidades/dashboard/metricas.api.ts`.
 */
import type { EtapaLead, RedSocial, SemaforoLead } from "./lead";
import type { RolUsuario } from "./usuario";

/**
 * Alcance por rol (docs/08 §1): igual patrón que `LeadsContextoRol` en
 * `leads.api.ts`. En el backend real esto lo resuelve el propio endpoint a
 * partir del JWT, no un parámetro de query.
 */
export interface MetricasContextoRol {
  rol: RolUsuario;
  usuarioId: string;
}

/**
 * Filtros combinables del dashboard (docs/08 §4). `fechaDesde`/`fechaHasta`
 * son `YYYY-MM-DD` inclusive, mismo formato que `LeadsQueryParams` en
 * `leads.api.ts`. `responsableId` solo tiene efecto visible en la UI para
 * administrador/supervisor (docs/08 §4, "Responsable: solo administrador y
 * supervisor") -- la restricción de visibilidad del control vive en el
 * componente, no acá.
 */
export interface MetricasFiltros {
  fechaDesde: string;
  fechaHasta: string;
  redSocial?: RedSocial;
  campaniaId?: string;
  responsableId?: string;
}

/** Numerador/denominador siempre junto al porcentaje (docs/08 §2.4, "32 % (16 de 50)"). */
export interface RatioMetrica {
  numerador: number;
  denominador: number;
  /** 0 cuando `denominador` es 0 -- nunca `NaN` en la UI. */
  porcentaje: number;
}

/**
 * Comparativa contra el período inmediatamente anterior de igual duración
 * (docs/08 §4). `variacionPorcentaje` es `null` cuando el período anterior
 * tuvo menos de 10 leads ingresados -- en ese caso la UI muestra `actual`/
 * `anterior` como valores absolutos, sin porcentaje ("ruido presentado como
 * señal").
 */
export interface ComparativaValor {
  actual: number;
  anterior: number;
  variacionPorcentaje: number | null;
}

export interface ResumenMetricas {
  totalIngresados: number;
  /** Snapshot vigente (docs/08 §2.2 no data el conteo al rango de fechas, a diferencia de §2.1/§2.3). */
  enGestion: number;
  cerrados: { venta: number; noVenta: number };
  /** Sobre leads cerrados en el rango (docs/08 §2.4), nunca sobre el total ingresado. */
  tasaConversion: RatioMetrica;
  /**
   * INTEGRACION-BACKEND: en el mock se aproxima con `slaInicioEn -
   * ingresadoEn` para leads que ya salieron de NUEVO (docs/08 §2.5); el
   * cálculo real requiere `lead_eventos.ASIGNACION`/`CAMBIO_ETAPA` (M9). En
   * horas, un decimal. `null` cuando no hay leads elegibles en el rango.
   */
  tiempoPromedioPrimeraRespuestaHoras: number | null;
  /** Leads que nunca salieron de Nuevo en el rango -- se reportan aparte (docs/08 §2.5). */
  leadsSinPrimeraRespuesta: number;
  /** Solo etapa VENTA (docs/08 §2.6). En días, un decimal. `null` si no hay ventas cerradas en el rango. */
  tiempoPromedioCierreDias: number | null;
  /** Cierres en No Venta, reportados aparte (docs/08 §2.6). */
  tiempoPromedioCierreNoVentaDias: number | null;
  /**
   * INTEGRACION-BACKEND: misma simplificación que la primera respuesta
   * (docs/08 §2.7) -- ver comentario en `metricas.utils.ts`. `null` cuando
   * no hay leads asignados en el rango.
   */
  cumplimientoSla: RatioMetrica | null;
  /**
   * Comparativa solo para los indicadores acotados al período (conteos de
   * ingreso/cierre) -- "en gestión" es una foto del pipeline vigente, no un
   * conteo de ventana temporal, así que compararlo contra el período
   * anterior no tiene la misma lectura y se deja fuera (decisión de este
   * cambio, no una regla documentada explícitamente en docs/08 §4).
   */
  comparativa: {
    totalIngresados: ComparativaValor;
    cerradosVenta: ComparativaValor;
    cerradosNoVenta: ComparativaValor;
  };
}

export interface MetricasPorRedSocial {
  redSocial: RedSocial;
  total: number;
  /** Cohorte: sobre los leads de esta red ingresados en el rango que ya cerraron (docs/08 §3.1). */
  tasaConversion: RatioMetrica;
}

export interface MetricasPorAsesor {
  responsableId: string;
  nombre: string;
  total: number;
  tasaConversion: RatioMetrica;
  cumplimientoSla: RatioMetrica | null;
}

/** Paso del embudo (docs/08 §3.3). Solo NUEVO/CONTACTADO/CITA/VENTA -- NO_VENTA no es un paso. */
export interface MetricasPorEtapa {
  etapa: EtapaLead;
  total: number;
  /** % de caída respecto del paso anterior. `null` en el primer paso. */
  caidaPorcentaje: number | null;
}

export interface MetricasEmbudo {
  pasos: MetricasPorEtapa[];
  /** No Venta, mostrado aparte del embudo (docs/08 §3.3). */
  noVentaTotal: number;
}

export interface MetricasPorCampania {
  campaniaId: string;
  nombre: string;
  /** Una misma campaña puede correr en redes distintas y son registros independientes (docs/08 §3.4). */
  redSocial: RedSocial;
  total: number;
}

export interface RedSocialPorSemaforo {
  redSocial: RedSocial;
  verde: number;
  amarillo: number;
  rojo: number;
  total: number;
  porcentajeVerde: number;
}

export interface DistribucionSemaforo {
  semaforo: SemaforoLead;
  total: number;
}
