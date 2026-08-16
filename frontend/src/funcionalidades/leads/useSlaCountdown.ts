import { useEffect, useReducer } from "react";
import { calculateEstadoSla, type CalculoSla } from "./sla";

/**
 * Contador de SLA en vivo, con formato `HH:MM:SS` (docs/07 F3). Re-renderiza
 * cada segundo con un `setInterval` local -- **nunca** consulta al servidor
 * para refrescar el reloj (nota explícita de docs/07: a 100 usuarios
 * concurrentes eso serían 100 peticiones por segundo solo para mostrar la
 * hora). El intervalo se cancela y no se crea siquiera para leads cerrados,
 * donde el reloj está detenido y no hay nada que animar.
 */
export function useSlaCountdown(
  slaInicioEn: string | null,
  cerradoEn: string | null,
): CalculoSla {
  const [, forzarRecalculo] = useReducer((contador: number) => contador + 1, 0);

  useEffect(() => {
    if (cerradoEn || !slaInicioEn) {
      return;
    }
    const id = setInterval(forzarRecalculo, 1_000);
    return () => clearInterval(id);
  }, [slaInicioEn, cerradoEn]);

  return calculateEstadoSla({ slaInicioEn, cerradoEn });
}
