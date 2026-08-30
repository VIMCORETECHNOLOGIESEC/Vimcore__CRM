import { useEffect, useState } from "react";

/**
 * tema-empresarial-integracion: gap real corregido -- en una recarga en frío
 * de una ruta ya autenticada (F5 con sesión vigente, sin pasar por
 * `LoginPage.tsx`), `AppLayout.tsx` no tiene ninguna precarga de
 * `useConfiguracionEmpresa()` (a diferencia del login, que sí la precarga
 * antes de arrancar su propio splash) -- había una ventana real donde el
 * shell pintaba con la paleta de fábrica y recién después saltaba al color
 * real de marca, apenas la query resolvía.
 *
 * `minMs` es un PISO, no un techo: el gate nunca se apaga antes de `minMs`
 * (evita un parpadeo de "carga instantánea" cuando la query ya está tibia
 * en caché), pero se extiende más allá de `minMs` mientras `loading` siga
 * `true` (nunca revela un shell a medio pintar por vencimiento de timer).
 */
export function useSplashGate(loading: boolean, minMs: number): boolean {
  const [minFloorReached, setMinFloorReached] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMinFloorReached(true), minMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return loading || !minFloorReached;
}
