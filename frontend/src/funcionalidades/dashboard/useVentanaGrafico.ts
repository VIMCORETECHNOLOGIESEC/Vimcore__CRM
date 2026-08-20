import { useEffect, useMemo, useState } from "react";

const RESALTADO_DURACION_MS = 2500;

export interface FilaVentana {
  id: string;
  nombre: string;
}

export interface VentanaGrafico<T extends FilaVentana> {
  visibles: T[];
  pagina: number;
  totalPaginas: number;
  irAPagina: (pagina: number) => void;
  seleccionar: (id: string) => void;
  /** `id` de la fila recién elegida por el buscador, para resaltarla brevemente en el gráfico. */
  resaltadoId: string | null;
}

/**
 * Ventana fija + paginación + salto por búsqueda (F5, "gráficos escalables"):
 * `GraficoPorAsesor`/`GraficoPorCampania` crecían sin techo con
 * `datos.length * 44px` de alto -- con muchos asesores el contenedor se
 * disparaba indefinidamente. `filas` ya viene ordenada por el backend (mayor
 * a menor, `ORDER BY total DESC`); acá solo se recorta a `tamanoVentana` por
 * página, nunca se reordena ni se pierde ningún dato.
 *
 * `seleccionar` (disparado por el buscador tipo `ResponsableCombobox`) salta
 * a la página que contiene el id elegido y lo resalta un instante -- no saca
 * la fila de su posición real ni reordena el set visible, a diferencia de un
 * carrusel autorrotativo (decisión del usuario: ventana fija + buscador, no
 * animación continua).
 */
export function useVentanaGrafico<T extends FilaVentana>(
  filas: readonly T[],
  tamanoVentana = 8,
): VentanaGrafico<T> {
  const [pagina, setPagina] = useState(0);
  const [resaltadoId, setResaltadoId] = useState<string | null>(null);

  const totalPaginas = Math.max(1, Math.ceil(filas.length / tamanoVentana));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);

  const visibles = useMemo(
    () => filas.slice(paginaSegura * tamanoVentana, paginaSegura * tamanoVentana + tamanoVentana),
    [filas, paginaSegura, tamanoVentana],
  );

  // Resalte temporal: se apaga solo, sin que el consumidor tenga que limpiarlo.
  useEffect(() => {
    if (resaltadoId === null) return;
    const timer = setTimeout(() => setResaltadoId(null), RESALTADO_DURACION_MS);
    return () => clearTimeout(timer);
  }, [resaltadoId]);

  function seleccionar(id: string) {
    const indice = filas.findIndex((fila) => fila.id === id);
    if (indice === -1) return;
    setPagina(Math.floor(indice / tamanoVentana));
    setResaltadoId(id);
  }

  return {
    visibles,
    pagina: paginaSegura,
    totalPaginas,
    irAPagina: setPagina,
    seleccionar,
    resaltadoId,
  };
}
