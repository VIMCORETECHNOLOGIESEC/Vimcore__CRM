import { randomUUID } from "node:crypto";
import { BlobSASPermissions, BlobServiceClient } from "@azure/storage-blob";
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

/**
 * reportes (Bloque E, exportación PDF/XLSX,
 * `jobs/reportes/reporte-generacion.job.ts`): a diferencia de `uploadImage`
 * (isotipo, `access: "blob"`, pensado para servir directo como `<img src>`),
 * estos son datos de negocio sensibles (ventas, métricas por empresa) --
 * NUNCA deben quedar con lectura pública anónima. Reusa el mismo cliente/
 * conexión (`AZURE_STORAGE_CONNECTION_STRING`) pero contra un contenedor
 * distinto y privado (`AZURE_STORAGE_CONTAINER_REPORTES`,
 * `createIfNotExists()` SIN `{ access: "blob" }` -- default de Azure).
 *
 * Por eso `uploadReporteArchivo` devuelve el NOMBRE del blob, no una URL: en
 * un contenedor privado una URL pública no serviría para nada sin un SAS
 * token. El backend es el único que puede leer el blob de vuelta
 * (`generarUrlTemporalReporte`), con sus propias credenciales, nunca el
 * navegador directo.
 */
const MAX_REPORTE_BYTES = 20 * 1024 * 1024; // 20 MB

export const PDF_MIME_TYPE = "application/pdf";
export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const EXTENSION_BY_MIME_TYPE_REPORTE: Readonly<Record<string, string>> = {
  [PDF_MIME_TYPE]: "pdf",
  [XLSX_MIME_TYPE]: "xlsx",
};

export interface UploadReporteInput {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Vida del link temporal (SAS) devuelto por `generarUrlTemporalReporte` --
 * decisión del usuario (2026-08-30): en vez de que el backend proxee/streamee
 * el archivo él mismo, el endpoint de descarga devuelve una URL firmada de
 * Azure con permiso de solo lectura, que vence sola -- el navegador la
 * consume directo contra Azure, sin volver a pasar por el backend. Corto a
 * propósito: es para un click inmediato de "descargar", no para guardar el
 * link en ningún lado.
 */
const SAS_URL_TTL_MS = 10 * 60_000; // 10 minutos

function invalidReporteFileType(): AppError {
  return new AppError(
    "tipo_archivo_invalido",
    400,
    "El archivo del reporte debe ser PDF o XLSX",
  );
}

function reporteTooLarge(): AppError {
  return new AppError(
    "archivo_demasiado_grande",
    400,
    "El archivo del reporte supera el tamaño máximo permitido (20 MB)",
  );
}

function reporteArchivoNoEncontrado(): AppError {
  return new AppError(
    "archivo_no_encontrado",
    404,
    "El archivo del reporte ya no está disponible",
  );
}

function esErrorBlobNoEncontrado(err: unknown): boolean {
  return (
    typeof err === "object"
    && err !== null
    && "statusCode" in err
    && (err as { statusCode?: unknown }).statusCode === 404
  );
}

/**
 * Igual criterio de nombrado de blob que `uploadImage`: uuid propio + la
 * extensión derivada del `mimeType`, nunca un nombre elegido por el código
 * que genera el archivo (acá `reporte-generacion.job.ts`, un job interno --
 * no viene de un usuario externo, pero el criterio se mantiene igual).
 */
export async function uploadReporteArchivo(input: UploadReporteInput): Promise<string> {
  const extension = EXTENSION_BY_MIME_TYPE_REPORTE[input.mimeType];
  if (!extension) throw invalidReporteFileType();
  if (input.buffer.length > MAX_REPORTE_BYTES) throw reporteTooLarge();

  if (!env.AZURE_STORAGE_CONNECTION_STRING) throw storageNotConfigured();

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    env.AZURE_STORAGE_CONNECTION_STRING,
  );
  const containerClient = blobServiceClient.getContainerClient(
    env.AZURE_STORAGE_CONTAINER_REPORTES,
  );
  await containerClient.createIfNotExists();

  const blobName = `${randomUUID()}.${extension}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(input.buffer, {
    blobHTTPHeaders: { blobContentType: input.mimeType },
  });

  return blobName;
}

/**
 * `GET /reportes/jobs/:id/descargar` (`reportes.controller.ts`) hace todo el
 * chequeo de autorización (dueño del `ReporteJob`, scope de empresa) ANTES de
 * llamar a esta función -- el backend nunca descarga el archivo él mismo, le
 * devuelve al cliente ya autenticado una URL firmada (SAS) de solo lectura
 * que vence sola a los `SAS_URL_TTL_MS`. El navegador la consume directo
 * contra Azure; el backend deja de estar en el camino del archivo en sí.
 *
 * `generateSasUrl` requiere que el cliente se haya construido con una
 * credencial de shared key (`fromConnectionString` con `AccountKey=...` en
 * la cadena, el mismo formato que ya usa este archivo y el que trae Azurite
 * por default) -- si algún día la connection string cambia a un formato sin
 * account key, esta llamada fallaría explícito, no en silencio.
 *
 * `nombreDescarga` (nombre de archivo legible, 2026-09-03,
 * `services/reportes/reportes.service.ts::obtenerNombreArchivoReporte`) va
 * como override de `Content-Disposition` DENTRO de la propia URL firmada
 * (`BlobGenerateSasUrlOptions.contentDisposition`) -- el navegador lo lee al
 * descargar sin que el blob en sí necesite renombrarse ni el backend
 * proxee el archivo.
 */
export async function generarUrlTemporalReporte(
  blobName: string,
  nombreDescarga: string,
): Promise<string> {
  if (!env.AZURE_STORAGE_CONNECTION_STRING) throw storageNotConfigured();

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    env.AZURE_STORAGE_CONNECTION_STRING,
  );
  const containerClient = blobServiceClient.getContainerClient(
    env.AZURE_STORAGE_CONTAINER_REPORTES,
  );
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  let existe: boolean;
  try {
    existe = await blockBlobClient.exists();
  } catch (err) {
    if (esErrorBlobNoEncontrado(err)) throw reporteArchivoNoEncontrado();
    throw err;
  }
  if (!existe) throw reporteArchivoNoEncontrado();

  return blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse("r"),
    expiresOn: new Date(Date.now() + SAS_URL_TTL_MS),
    contentDisposition: `attachment; filename="${nombreDescarga}"`,
  });
}
