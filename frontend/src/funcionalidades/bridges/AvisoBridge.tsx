import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AvisoBridge as AvisoBridgeState } from "./bridges.utils";

interface AvisoBridgeProps {
  nombre: string;
  aviso: AvisoBridgeState;
}

/**
 * Aviso destacado ante token expirado o bridge sin actividad (docs/07 F8).
 * Componente de presentación puro: la regla de negocio de *cuándo* mostrarlo
 * vive en `bridges.utils.ts::evaluarAvisoBridge`, no requiere test unitario
 * per AGENTS.md §5 -- solo arma el texto según las dos banderas ya
 * calculadas.
 */
export function AvisoBridge({ nombre, aviso }: AvisoBridgeProps) {
  if (!aviso.tokenExpirado && !aviso.tokenProximoAVencer && !aviso.sinActividad) return null;

  const mensajes: string[] = [];
  if (aviso.tokenExpirado) {
    mensajes.push("el token expiró y dejará de recibir leads hasta que se cargue uno nuevo");
  } else if (aviso.tokenProximoAVencer) {
    mensajes.push("el token de alguna cuenta publicitaria está próximo a vencer");
  }
  if (aviso.sinActividad) {
    mensajes.push("no recibió leads en las últimas 72 horas a pesar de tener cuentas publicitarias activas");
  }

  const texto = mensajes.length === 2 ? `${mensajes[0]}, y ${mensajes[1]}` : mensajes[0];

  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" aria-hidden="true" />
      <AlertTitle>{nombre} necesita atención</AlertTitle>
      <AlertDescription>{`${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`}</AlertDescription>
    </Alert>
  );
}
