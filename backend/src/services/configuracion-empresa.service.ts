import { uploadImage, type UploadImageInput } from "../lib/azure-blob-storage.js";
import * as configuracionEmpresaRepository from "../repositories/configuracion-empresa.repository.js";
import type { UpdateConfiguracionEmpresaData } from "../repositories/configuracion-empresa.repository.js";
import type { UpdateConfiguracionEmpresaBody } from "../schemas/configuracion-empresa.schema.js";

export interface ConfiguracionEmpresaView {
  nombre: string;
  colorPrimario: string;
  colorSecundario: string;
  logoUrl: string | null;
}

function toView(fila: {
  nombre: string;
  colorPrimario: string;
  colorSecundario: string;
  logoUrl: string | null;
}): ConfiguracionEmpresaView {
  return {
    nombre: fila.nombre,
    colorPrimario: fila.colorPrimario,
    colorSecundario: fila.colorSecundario,
    logoUrl: fila.logoUrl,
  };
}

/**
 * `GET /configuracion-empresa`: cualquier usuario autenticado. Lazy init —
 * si todavía no existe ninguna fila, la crea con los defaults documentados
 * en el repositorio en vez de exigir un seed previo.
 *
 * PASO 5 (endpoint público de branding, `marca-publica.controller.ts`):
 * reusa esta misma función -- la forma que devuelve (`ConfiguracionEmpresaView`)
 * es exactamente el subconjunto público autorizado (nombre/colores/logo,
 * nada administrativo), así que no hace falta una segunda query.
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
    logoUrl: input.logoUrl,
  };
  const actualizada = await configuracionEmpresaRepository.upsertSingleton(data);
  return toView(actualizada);
}

/**
 * `POST /configuracion-empresa/logo`: exclusivo ADMINISTRADOR (`requireRole`
 * en la ruta), mismo criterio de autorización que `PATCH /configuracion-empresa`
 * -- sin distinción de `sessionScope` porque es una fila singleton de
 * holding, no scopeada por empresa. Sube el archivo a Azure Blob Storage y
 * reusa `upsertSingleton` (ya acepta un `data` parcial) para persistir solo
 * `logoUrl`, sin tocar nombre/colores.
 */
export async function uploadLogo(archivo: UploadImageInput): Promise<ConfiguracionEmpresaView> {
  const logoUrl = await uploadImage(archivo);
  const actualizada = await configuracionEmpresaRepository.upsertSingleton({ logoUrl });
  return toView(actualizada);
}
