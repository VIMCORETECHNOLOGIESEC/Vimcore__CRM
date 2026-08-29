import * as configuracionEmpresaRepository from "../repositories/configuracion-empresa.repository.js";
import type { UpdateConfiguracionEmpresaData } from "../repositories/configuracion-empresa.repository.js";
import type { UpdateConfiguracionEmpresaBody } from "../schemas/configuracion-empresa.schema.js";

export interface ConfiguracionEmpresaView {
  nombre: string;
  colorPrimario: string;
  colorSecundario: string;
}

function toView(fila: { nombre: string; colorPrimario: string; colorSecundario: string }): ConfiguracionEmpresaView {
  return { nombre: fila.nombre, colorPrimario: fila.colorPrimario, colorSecundario: fila.colorSecundario };
}

/**
 * `GET /configuracion-empresa`: cualquier usuario autenticado. Lazy init —
 * si todavía no existe ninguna fila, la crea con los defaults documentados
 * en el repositorio en vez de exigir un seed previo.
 */
export async function getConfiguracion(): Promise<ConfiguracionEmpresaView> {
  const existente = await configuracionEmpresaRepository.findSingleton();
  if (existente !== null) {
    return toView(existente);
  }
  const creada = await configuracionEmpresaRepository.createWithDefaults();
  return toView(creada);
}

/**
 * `PATCH /configuracion-empresa`: exclusivo ADMINISTRADOR (`requireRole` en
 * la ruta). Upsert parcial sobre la fila singleton.
 */
export async function updateConfiguracion(
  input: UpdateConfiguracionEmpresaBody,
): Promise<ConfiguracionEmpresaView> {
  const data: UpdateConfiguracionEmpresaData = {
    nombre: input.nombre,
    colorPrimario: input.colorPrimario,
    colorSecundario: input.colorSecundario,
  };
  const actualizada = await configuracionEmpresaRepository.upsertSingleton(data);
  return toView(actualizada);
}
