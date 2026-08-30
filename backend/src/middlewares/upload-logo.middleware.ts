import type { NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import { AppError } from "../lib/app-error.js";

/**
 * multipart/form-data para la subida de isotipo (logo) de empresa
 * (`empresa-apariencia`/`configuracion-empresa`, campo `logo`, un único
 * archivo). `memoryStorage` -- nunca a disco: este backend corre en Azure
 * Container Apps sin almacenamiento persistente local, así que un
 * `diskStorage` se perdería en cada reinicio/réplica y además dejaría el
 * archivo pisado en el sistema de archivos del contenedor entre la subida y
 * el envío a Azure Blob Storage, una superficie innecesaria.
 *
 * Multer es el estándar de facto para multipart en Express (recomendado por
 * la propia documentación de Express 5) y ya está probado en producción por
 * un volumen enorme de proyectos -- no se evaluó una alternativa (p.ej.
 * `busboy` a mano) porque no hay un requisito de streaming que Multer no
 * cubra: el archivo es una imagen de a lo sumo 2 MB, cargarlo completo en
 * memoria antes de reenviarlo a Azure es aceptable.
 *
 * Límite de tamaño (2 MB) fijado ACÁ como primera línea de defensa -- Multer
 * corta la subida en el momento en que se supera el límite, antes de que el
 * body completo llegue a materializarse en memoria. `lib/azure-blob-storage.
 * ts::uploadImage` repite la misma validación de tipo/tamaño como segunda
 * línea, por si esa función se invoca alguna vez desde otro punto de entrada
 * que no pase por este middleware.
 */
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

const FILE_FILTER_REJECTION_CODE = "tipo_archivo_invalido";

const uploadLogoField = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error(FILE_FILTER_REJECTION_CODE));
      return;
    }
    callback(null, true);
  },
}).single("logo");

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

function uploadFailed(): AppError {
  return new AppError("archivo_invalido", 400, "No se pudo procesar el archivo adjunto");
}

/**
 * Envoltorio de `uploadLogoField`: traduce los errores propios de Multer
 * (`MulterError`/el `Error` que arma `fileFilter` arriba) al mismo formato
 * `AppError` que usa el resto del proyecto (`middlewares/error-handler.
 * middleware.ts`), en vez de dejar que Multer responda con su propio formato
 * de error por defecto.
 */
export function uploadLogoMiddleware(req: Request, _res: Response, next: NextFunction): void {
  uploadLogoField(req, _res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(fileTooLarge());
      return;
    }

    if (err instanceof Error && err.message === FILE_FILTER_REJECTION_CODE) {
      next(invalidFileType());
      return;
    }

    next(uploadFailed());
  });
}
