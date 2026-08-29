import * as empresaRepository from "../repositories/empresa.repository.js";
import type { UpdateEmpresaAparienciaBody } from "../schemas/empresa-apariencia.schema.js";

export interface EmpresaAparienciaView {
  colorPrimario: string | null;
  colorSecundario: string | null;
}

function toView(empresa: { colorPrimario: string | null; colorSecundario: string | null }): EmpresaAparienciaView {
  return { colorPrimario: empresa.colorPrimario, colorSecundario: empresa.colorSecundario };
}

/**
 * `PATCH /empresas/actual/apariencia`: exclusivo ADMINISTRADOR de una sesión
 * `company` sobre SU PROPIA empresa (`requireRole` + guarda de
 * `sessionScope` en el controller). `empresaId` llega ya resuelto por
 * `requireAuthentication` -- este servicio nunca recibe ni confía en un
 * `empresaId` que venga del body/params/query (mismo principio D0/RLS del
 * resto del proyecto).
 */
export async function updateApariencia(
  empresaId: string,
  input: UpdateEmpresaAparienciaBody,
): Promise<EmpresaAparienciaView> {
  const actualizada = await empresaRepository.updateApariencia(empresaId, {
    colorPrimario: input.colorPrimario,
    colorSecundario: input.colorSecundario,
  });
  return toView(actualizada);
}
