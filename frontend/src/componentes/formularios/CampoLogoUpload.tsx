import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Label } from "@/components/ui/label";

/**
 * Campo de subida de isotipo (`<input type="file">`), compartido entre
 * `EmpresaAparienciaForm.tsx` (self-service + editor cross-empresa de
 * holding) y el formulario local de `ConfiguracionEmpresaPage.tsx` (branding
 * global del holding) -- reemplaza el viejo `<Input type="url">` de URL
 * manual: el usuario pidió explícitamente no seguir escribiendo URLs a mano.
 *
 * Mismo contrato que valida `uploadLogoMiddleware` en el backend (Multer,
 * `backend/src/middlewares/upload-logo.middleware.ts`) -- se repite acá SOLO
 * para dar feedback instantáneo sin redondeo de red; el backend sigue siendo
 * la única fuente de verdad y su mensaje de error (ya en español) se
 * respeta tal cual si de todos modos rechaza el archivo.
 */
const TIPOS_ACEPTADOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
const TIPOS_ACEPTADOS_ACCEPT = TIPOS_ACEPTADOS.join(",");
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function validarArchivo(file: File): string | null {
  if (!TIPOS_ACEPTADOS.includes(file.type as (typeof TIPOS_ACEPTADOS)[number])) {
    return "El archivo debe ser una imagen PNG, JPG, WEBP o SVG";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return "El archivo supera el tamaño máximo permitido (2 MB)";
  }
  return null;
}

export interface CampoLogoUploadProps {
  id: string;
  label?: string;
  /** URL vigente del isotipo (o "" si no hay ninguno) -- se usa como vista previa hasta que se elija un archivo nuevo. */
  valorActual: string;
  disabled?: boolean;
  /**
   * Sube el archivo elegido y resuelve con la URL pública ya persistida.
   * El componente no sabe (ni le importa) a qué endpoint corresponde --
   * cada consumidor pasa su propia función (`uploadLogoEmpresaApi`,
   * `uploadLogoHoldingApi`). Si se omite (caso holding editando OTRA
   * empresa, endpoint todavía inexistente), el campo queda deshabilitado.
   */
  onSubirLogo?: (file: File) => Promise<string>;
  /** Se llama con la nueva URL luego de una subida exitosa. */
  onLogoUrlChange: (url: string) => void;
}

export function CampoLogoUpload({
  id,
  label = "Isotipo",
  valorActual,
  disabled = false,
  onSubirLogo,
  onLogoUrlChange,
}: CampoLogoUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Libera el `object URL` de la vista previa anterior al desmontar o al
  // reemplazarlo por uno nuevo -- evita filtrar memoria en sesiones largas
  // donde se prueban varios archivos antes de guardar.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const deshabilitado = disabled || subiendo || !onSubirLogo;
  const vistaPreviaSrc = previewUrl ?? (valorActual || null);

  function limpiarSeleccion() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function manejarCambioArchivo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const errorValidacion = validarArchivo(file);
    if (errorValidacion) {
      setError(errorValidacion);
      limpiarSeleccion();
      return;
    }

    if (!onSubirLogo) {
      return;
    }

    setError(null);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const nuevaVistaPrevia = URL.createObjectURL(file);
    objectUrlRef.current = nuevaVistaPrevia;
    setPreviewUrl(nuevaVistaPrevia);
    setSubiendo(true);

    try {
      const logoUrl = await onSubirLogo(file);
      onLogoUrlChange(logoUrl);
    } catch (err) {
      setError(getErrorMessage(err));
      setPreviewUrl(null);
      limpiarSeleccion();
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label} (opcional)</Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={TIPOS_ACEPTADOS_ACCEPT}
        disabled={deshabilitado}
        aria-invalid={error ? "true" : undefined}
        onChange={(event) => void manejarCambioArchivo(event)}
        className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      />

      {!onSubirLogo ? (
        <p className="text-xs text-muted-foreground">
          Subida de archivo próximamente para este caso.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Recomendamos un PNG con fondo transparente: se ve bien sobre cualquier color de marca.
          También aceptamos JPG, WEBP o SVG.
        </p>
      )}

      {subiendo ? <p className="text-xs text-muted-foreground">Subiendo…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {vistaPreviaSrc ? (
        <img
          src={vistaPreviaSrc}
          alt="Vista previa del isotipo"
          className="h-16 w-auto max-w-[10rem] rounded-md border border-border object-contain p-1"
        />
      ) : null}
    </div>
  );
}
