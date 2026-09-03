import * as empresaRepository from "../../repositories/empresa.repository.js";
import * as configuracionEmpresaService from "../../services/configuracion-empresa.service.js";
import type { MarcaReporte } from "./tipos.js";

/**
 * pdfmake-migracion: resuelve el branding a aplicar en el PDF/XLSX de un
 * reporte, ANTES de que `pdf-reporte.ts` renderice nada (lo mantiene como
 * renderer puro, sin tocar Prisma). Módulo separado a propósito, ver
 * `dreamy-painting-sketch.md` -- permite testear la resolución de marca de
 * forma aislada, con fixtures simples en `pdf-reporte.test.ts`.
 *
 * Jerarquía de colores COMO PAR (replica exacto
 * `frontend/src/lib/color-marca.ts::resolveEstilosMarca`/`construirEstilosMarca`):
 * si la empresa tiene AMBOS colores propios no-null, se usan los DOS de la
 * empresa; si falta cualquiera de los dos, se usan los DOS del holding --
 * nunca se mezcla el primario de uno con el secundario del otro. `logoUrl`
 * cae al holding de forma INDEPENDIENTE de los colores (mismo criterio que
 * `resolveLogoMarca`). `nombre` siempre es el de la empresa (campo no
 * nullable en `Empresa`).
 */
export async function resolverMarcaReporte(empresaId: string | null): Promise<MarcaReporte> {
  const holding = await configuracionEmpresaService.getConfiguracion();

  if (empresaId === null) {
    return {
      nombre: holding.nombre,
      colorPrimario: holding.colorPrimario,
      colorSecundario: holding.colorSecundario,
      logoUrl: holding.logoUrl,
    };
  }

  const empresa = await empresaRepository.findById(empresaId);
  if (empresa === null) {
    // Caso defensivo raro (empresa borrada entre la creación del job y su
    // procesamiento en background): degrada a la vista completa del holding
    // en vez de lanzar y hacer fallar todo el reporte.
    return {
      nombre: holding.nombre,
      colorPrimario: holding.colorPrimario,
      colorSecundario: holding.colorSecundario,
      logoUrl: holding.logoUrl,
    };
  }

  const tieneColorPropio = empresa.colorPrimario !== null && empresa.colorSecundario !== null;

  return {
    nombre: empresa.nombre,
    colorPrimario: tieneColorPropio ? (empresa.colorPrimario as string) : holding.colorPrimario,
    colorSecundario: tieneColorPropio ? (empresa.colorSecundario as string) : holding.colorSecundario,
    logoUrl: empresa.logoUrl ?? holding.logoUrl,
  };
}
