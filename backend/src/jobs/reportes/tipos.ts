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
/**
 * pdfmake-migracion: branding a aplicar en la portada/encabezados de tabla
 * del PDF (y, en el futuro, del XLSX) -- ya resuelto por
 * `reporte-marca.ts::resolverMarcaReporte` ANTES de llegar acá, así que
 * `pdf-reporte.ts` se mantiene como renderer puro (nunca vuelve a tocar
 * Prisma ni la jerarquía empresa/holding).
 */
export interface MarcaReporte {
  nombre: string;
  colorPrimario: string;
  colorSecundario: string;
  logoUrl: string | null;
}

/**
 * pdf-ejecutivo: alternativa aditiva al PDF "detallado" (5 secciones ya
 * existentes, sin tocar). Solo tiene efecto para `tipo === "pdf"` --
 * `xlsx-reporte.ts` no lee este campo, ignorándolo sin error.
 */
export type PlantillaReporte = "detallado" | "ejecutivo";

export interface DatosReporte {
  empresaId: string | null;
  resumen: ResumenResponse;
  embudo: EmbudoResponse;
  porCampania: PorCampaniaItem[];
  rendimientoCampanias: MetaAdsRendimientoCampaniaDto[];
  porAsesor: PorAsesorItem[] | null;
  marca: MarcaReporte;
  plantilla: PlantillaReporte;
}
