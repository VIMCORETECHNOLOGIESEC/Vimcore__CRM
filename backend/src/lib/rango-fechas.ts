import type { RangoPreset } from "../schemas/metricas.schema.js";

export interface RangoResuelto {
  desde: Date;
  hasta: Date;
  anteriorDesde: Date;
  anteriorHasta: Date;
}

const DIA_MS = 24 * 60 * 60 * 1000;

function inicioDiaUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 0, 0, 0, 0));
}

export function finDiaUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 23, 59, 59, 999));
}

function inicioMesUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Día 0 del mes siguiente = último día del mes de `fecha`, a las 23:59:59.999. */
function finMesUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function mesRelativo(fecha: Date, deltaMeses: number): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + deltaMeses, 1));
}

/**
 * docs/08 §4: calcula el rango pedido y el "período inmediatamente anterior
 * de igual duración" (comparativa). Decisión propia (no escrita literal en
 * docs/08, que solo nombra los seis presets sin fórmula): dos familias de
 * cálculo distintas —
 *
 * - Ventanas de duración fija (`hoy`/`7d`/`30d`/`personalizado`): el período
 *   anterior es CONTIGUO y de duración EXACTAMENTE IGUAL — termina 1 ms antes
 *   de que empiece el actual. Estos presets no tienen una unidad calendario
 *   propia, así que "igual duración" se satisface al pie de la letra.
 * - Presets de calendario (`mes_actual`/`mes_anterior`): el "período anterior"
 *   es el MES CALENDARIO inmediatamente previo COMPLETO (día 1 a último día),
 *   aunque el período actual sea parcial (`mes_actual` va del día 1 al
 *   instante `ahora`, nunca hasta fin de mes). Comparar "1-18 de agosto"
 *   contra "todo julio" es la lectura más útil de "inmediatamente anterior"
 *   cuando la unidad natural del filtro es el mes calendario, no una ventana
 *   de N días — la alternativa (una ventana de exactamente los mismos N días
 *   antes del 1° del mes) no tiene ningún significado calendario para el
 *   usuario. Se documenta acá porque no hay margen para preguntar a mitad de
 *   una tarea en background.
 */
export function resolveRangoFechas(
  rango: RangoPreset,
  ahora: Date,
  desde?: Date,
  hasta?: Date,
): RangoResuelto {
  switch (rango) {
    case "hoy": {
      const d = inicioDiaUTC(ahora);
      const h = finDiaUTC(ahora);
      const duracion = h.getTime() - d.getTime();
      const anteriorHasta = new Date(d.getTime() - 1);
      const anteriorDesde = new Date(anteriorHasta.getTime() - duracion);
      return { desde: d, hasta: h, anteriorDesde, anteriorHasta };
    }
    case "7d": {
      const d = new Date(ahora.getTime() - 7 * DIA_MS);
      const duracion = ahora.getTime() - d.getTime();
      return { desde: d, hasta: ahora, anteriorDesde: new Date(d.getTime() - duracion), anteriorHasta: d };
    }
    case "30d": {
      const d = new Date(ahora.getTime() - 30 * DIA_MS);
      const duracion = ahora.getTime() - d.getTime();
      return { desde: d, hasta: ahora, anteriorDesde: new Date(d.getTime() - duracion), anteriorHasta: d };
    }
    case "mes_actual": {
      const d = inicioMesUTC(ahora);
      const mesAnterior = mesRelativo(ahora, -1);
      return {
        desde: d,
        hasta: ahora,
        anteriorDesde: inicioMesUTC(mesAnterior),
        anteriorHasta: finMesUTC(mesAnterior),
      };
    }
    case "mes_anterior": {
      const mesAnterior = mesRelativo(ahora, -1);
      const dosMesesAtras = mesRelativo(ahora, -2);
      return {
        desde: inicioMesUTC(mesAnterior),
        hasta: finMesUTC(mesAnterior),
        anteriorDesde: inicioMesUTC(dosMesesAtras),
        anteriorHasta: finMesUTC(dosMesesAtras),
      };
    }
    case "personalizado": {
      if (!desde || !hasta) {
        // Zod (metricasQuerySchema) ya garantiza esto antes de llegar acá;
        // guarda defensiva, nunca debería dispararse en producción.
        throw new Error("rango personalizado requiere desde/hasta resueltos");
      }
      const duracion = hasta.getTime() - desde.getTime();
      const anteriorHasta = new Date(desde.getTime() - 1);
      const anteriorDesde = new Date(anteriorHasta.getTime() - duracion);
      return { desde, hasta, anteriorDesde, anteriorHasta };
    }
  }
}
