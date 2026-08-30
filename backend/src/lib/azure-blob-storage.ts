import { randomUUID } from "node:crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

/**
 * Utilidad transversal de subida de imágenes a Azure Blob Storage (isotipo de
 * empresa, `empresa-apariencia`/`configuracion-empresa`). Infraestructura
 * genérica sin carga de dominio (AGENTS.md §3.4) -- por eso vive en `lib/`
 * como un único archivo, no como un módulo de negocio con su propio CRUD:
 * no hay una entidad "subida" persistida en este esquema, solo una operación
 * de efecto lateral (Azure) cuyo único resultado relevante para el resto del
 * sistema es la URL devuelta.
 *
 * Nunca confía en el nombre de archivo que manda el cliente: el nombre del
 * blob se genera con un uuid propio + la extensión derivada del `mimeType`
 * ya detectado por Multer (`middlewares/upload-logo.middleware.ts`), contra
 * una whitelist explícita -- nunca a partir del nombre original del archivo.
 */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export interface UploadImageInput {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

function storageNotConfigured(): AppError {
  return new AppError(
    "almacenamiento_no_configurado",
    503,
    "El almacenamiento de archivos no está configurado",
  );
}

function invalidFileType(): AppError {
  return new AppError(
    "tipo_archivo_invalido",
    400,
    "El archivo debe ser una imagen PNG, JPG, WEBP o SVG",
  );
}

function fileTooLarge(): AppError {
  return new AppError(
    "archivo_demasiado_grande",
    400,
    "El archivo supera el tamaño máximo permitido (2 MB)",
  );
}

/**
 * `POST .../logo` es una acción administrativa de baja frecuencia (no un
 * hot path), así que no hace falta cachear el cliente/contenedor entre
 * invocaciones -- cada subida crea su propio cliente y confirma la
 * existencia del contenedor (`createIfNotExists`, idempotente en Azure).
 * `access: "blob"` habilita lectura pública anónima solo de los blobs (no
 * del listado del contenedor), requisito para que la URL devuelta sea
 * consumible directamente como `<img src>` desde el frontend sin exponer un
 * SAS token.
 */
export async function uploadImage(input: UploadImageInput): Promise<string> {
  const extension = EXTENSION_BY_MIME_TYPE[input.mimeType];
  if (!extension) throw invalidFileType();
  if (input.sizeBytes > MAX_IMAGE_BYTES) throw fileTooLarge();

  if (!env.AZURE_STORAGE_CONNECTION_STRING) throw storageNotConfigured();

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    env.AZURE_STORAGE_CONNECTION_STRING,
  );
  const containerClient = blobServiceClient.getContainerClient(
    env.AZURE_STORAGE_CONTAINER_ISOTIPOS,
  );
  await containerClient.createIfNotExists({ access: "blob" });

  const blobName = `${randomUUID()}.${extension}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(input.buffer, {
    blobHTTPHeaders: { blobContentType: input.mimeType },
  });

  return blockBlobClient.url;
}
