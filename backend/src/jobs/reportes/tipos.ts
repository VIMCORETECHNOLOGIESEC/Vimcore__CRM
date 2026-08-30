import type {
  EmbudoResponse,
  PorAsesorItem,
  PorCampaniaItem,
  ResumenResponse,
} from "../../services/metricas.service.js";
import type { MetaAdsRendimientoCampaniaDto } from "../../types/metaAds/meta-ads-oauth.dto.js";

/**
 * reportes (Bloque E): datos ya agregados que `reporte-generacion.job.ts`
 * arma llamando a `metricas.service.ts` (reuso, cero lógica de negocio
 * duplicada) y que `pdf-reporte.ts`/`xlsx-reporte.ts` solo RENDERIZAN --
 * ninguno de los dos vuelve a tocar Prisma ni recalcula nada.
 *
 * `porAsesor: null` cuando `metricas.service.ts::getPorAsesor` rechazó el rol
 * del solicitante (D6, "solo administrador y supervisor pueden consultar
 * esta gráfica"). `rendimientoCampanias` viene del mismo servicio de métricas
 * que usa el dashboard, ya con CPC/CPL/CAC reales de `CampaniaMetricaDiaria`.
 */
export interface DatosReporte {
  empresaId: string | null;
  resumen: ResumenResponse;
  embudo: EmbudoResponse;
  porCampania: PorCampaniaItem[];
  rendimientoCampanias: MetaAdsRendimientoCampaniaDto[];
  porAsesor: PorAsesorItem[] | null;
}
