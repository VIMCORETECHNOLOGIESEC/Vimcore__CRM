import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CARGA_MASIVA_MAX_LEADS_POR_TANDA,
  crearLeadsMasivoApi,
  type CargaMasivaEstadoFila,
  type CargaMasivaResumen,
} from "./carga-masiva.api";
import { filaParseadaALeadInput, type FilaCargaMasivaParseada } from "./carga-masiva.utils";

/**
 * Query key real de `useLeads.ts` (no exportada desde ese archivo) -- mismo
 * criterio de duplicación deliberada que `useCanalesManuales.ts`.
 */
const LEADS_QUERY_KEY = "leads";

/** Resultado de una fila ya mapeado al número REAL de fila del Excel (nunca el índice de array que usa el contrato del backend). */
export interface CargaMasivaResultadoMapeado {
  filaExcel: number;
  estado: CargaMasivaEstadoFila;
  leadId?: string;
  motivo?: string;
}

export interface CargaMasivaResultadoFinal {
  resumen: CargaMasivaResumen;
  resultados: CargaMasivaResultadoMapeado[];
}

export interface CargaMasivaProgreso {
  tandaActual: number;
  totalTandas: number;
}

/**
 * Orquesta la carga masiva: trocea las filas ya validadas en tandas de
 * `CARGA_MASIVA_MAX_LEADS_POR_TANDA` (contrato de Mateo, `carga-masiva.api.ts`)
 * y manda una tanda a la vez -- SECUENCIAL, nunca en paralelo, para no
 * saturar el backend ni perder el orden de los resultados.
 *
 * Mapeo `fila` (índice 1-based del array que se mandó en cada request) ->
 * número real de fila del Excel: en vez de reconstruir el offset a mano
 * (encabezado + tanda), se indexa directamente sobre el MISMO array de
 * `FilaCargaMasivaParseada` que se mandó en esa tanda -- `tanda[fila - 1]`
 * ya trae su `filaExcel` real guardado desde el parseo
 * (`carga-masiva.utils.ts::parsearExcelCargaMasiva`). Ejemplo concreto: un
 * Excel con encabezado en la fila 1 y 150 filas de datos (filas 2 a 151) se
 * particiona en 2 tandas de 100 y 50. En la segunda tanda, el resultado
 * `{ fila: 1, ... }` no es la fila 1 del Excel -- es `tanda[0].filaExcel`,
 * que corresponde a la fila 102 real (fila 2 + 100 filas ya mandadas en la
 * primera tanda).
 *
 * `ejecutar` recibe `empresaId` como tercer parámetro y lo reenvía en cada
 * tanda -- `CargaMasivaLeadsDialog.tsx` lo arma con
 * `useVistaEmpresa().empresaVistaId` (mismo criterio que el resto de las
 * pantallas holding-wide del bloque), `undefined` para una sesión `company`
 * normal (el backend real resuelve la empresa desde la sesión, ver
 * `carga-masiva.api.ts`).
 */
export function useCargaMasivaLeads() {
  const queryClient = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState<CargaMasivaProgreso | null>(null);
  const [resultado, setResultado] = useState<CargaMasivaResultadoFinal | null>(null);

  async function ejecutar(
    filasValidas: FilaCargaMasivaParseada[],
    canalLoteId: string | undefined,
    empresaId: string | undefined,
  ): Promise<CargaMasivaResultadoFinal> {
    setEnviando(true);
    setResultado(null);

    const tandas: FilaCargaMasivaParseada[][] = [];
    for (let i = 0; i < filasValidas.length; i += CARGA_MASIVA_MAX_LEADS_POR_TANDA) {
      tandas.push(filasValidas.slice(i, i + CARGA_MASIVA_MAX_LEADS_POR_TANDA));
    }
    // Sin filas válidas (caso límite defensivo): igual se reporta un
    // resultado final vacío, en vez de dejar `enviando` colgado.
    const totalTandas = Math.max(tandas.length, tandas.length === 0 ? 0 : 1);

    const resultadosMapeados: CargaMasivaResultadoMapeado[] = [];
    const resumenAcumulado: CargaMasivaResumen = {
      solicitados: 0,
      creados: 0,
      duplicados: 0,
      fallidos: 0,
    };

    try {
      for (let indiceTanda = 0; indiceTanda < tandas.length; indiceTanda += 1) {
        setProgreso({ tandaActual: indiceTanda + 1, totalTandas });
        const tanda = tandas[indiceTanda];

        const respuesta = await crearLeadsMasivoApi({
          empresaId,
          canalManualId: canalLoteId,
          leads: tanda.map(filaParseadaALeadInput),
        });

        resumenAcumulado.solicitados += respuesta.resumen.solicitados;
        resumenAcumulado.creados += respuesta.resumen.creados;
        resumenAcumulado.duplicados += respuesta.resumen.duplicados;
        resumenAcumulado.fallidos += respuesta.resumen.fallidos;

        for (const resultadoFila of respuesta.resultados) {
          resultadosMapeados.push({
            filaExcel: tanda[resultadoFila.fila - 1].filaExcel,
            estado: resultadoFila.estado,
            leadId: resultadoFila.leadId,
            motivo: resultadoFila.motivo,
          });
        }
      }

      const final: CargaMasivaResultadoFinal = { resumen: resumenAcumulado, resultados: resultadosMapeados };
      setResultado(final);
      // Backend real: los leads creados/duplicados de esta tanda ya existen
      // en la tabla real -- refresca el listado (`LeadsPage.tsx`) sin que el
      // usuario tenga que recargar la página a mano (AGENTS.md, "no frozen
      // UI"). Solo al terminar TODAS las tandas sin lanzar (éxito completo).
      void queryClient.invalidateQueries({ queryKey: [LEADS_QUERY_KEY] });
      return final;
    } finally {
      setEnviando(false);
      setProgreso(null);
    }
  }

  function reiniciar() {
    setResultado(null);
    setProgreso(null);
  }

  return { ejecutar, enviando, progreso, resultado, reiniciar };
}
