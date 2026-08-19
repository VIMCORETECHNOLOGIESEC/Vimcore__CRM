import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTestConnection } from "../useBridges";

interface PruebaConexionBotonProps {
  bridgeId: string;
  /**
   * El backend real prueba la conexión POR CUENTA PUBLICITARIA, no por
   * bridge (`POST /bridges/:id/cuentas/:cuentaId/probar-conexion`) -- mismo
   * gap de contrato documentado en `bridges.api.ts`.
   */
  cuentaId: string;
}

/**
 * Botón de prueba de conexión bajo demanda (F8). El resultado se muestra en
 * pantalla (ícono **y** texto, criterio transversal de accesibilidad) además
 * del toast que dispara `useTestConnection` -- así queda visible mientras el
 * administrador sigue revisando el resto del detalle.
 */
export function PruebaConexionBoton({ bridgeId, cuentaId }: PruebaConexionBotonProps) {
  const testConnection = useTestConnection(bridgeId, cuentaId);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={testConnection.isPending}
        onClick={() => testConnection.mutate()}
      >
        {testConnection.isPending ? "Probando conexión…" : "Probar conexión"}
      </Button>

      {testConnection.data ? (
        <span
          className={`inline-flex items-center gap-1.5 text-sm ${
            testConnection.data.ok ? "text-green-700" : "text-destructive"
          }`}
        >
          {testConnection.data.ok ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <XCircle className="size-4" aria-hidden="true" />
          )}
          {testConnection.data.mensaje}
        </span>
      ) : null}
    </div>
  );
}
