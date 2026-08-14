import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  /** Mensaje ya accionable en español (ej. `getErrorMessage(error)`). */
  message: string;
  title?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Estado de error reutilizable. Nunca recibe un código HTTP crudo -- el
 * llamador debe pasar un mensaje ya traducido (ver
 * `src/api/httpClient.ts#getErrorMessage`), per docs/07 "Estados de
 * error: toda petición fallida muestra un mensaje accionable en español".
 */
export function ErrorState({
  message,
  title = "No se pudo completar la operación",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="size-4" aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{message}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} className="w-fit">
            Reintentar
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
