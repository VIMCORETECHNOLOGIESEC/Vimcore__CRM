import { useEffect, useState } from "react";

/**
 * Devuelve `value`, pero recién actualizado luego de que transcurran
 * `delayMs` sin que vuelva a cambiar -- pensado para buscadores que
 * disparan un request por cada cambio (`GestorEmpresasPage.tsx`, primer
 * consumidor: 478 empresas reales en este entorno, sin debounce se dispara
 * un `GET /empresas` por cada tecla).
 *
 * No existía un hook de debounce reutilizable en el proyecto antes de este
 * cambio (revisado: los buscadores de `usuarios/UsuariosFiltros.tsx` y
 * `leads/LeadsFiltros.tsx` no debouncean, confían en que el volumen real de
 * usuarios/leads es bajo) -- este es el primero, pensado para que otras
 * pantallas lo reutilicen en vez de reescribir el patrón.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}
