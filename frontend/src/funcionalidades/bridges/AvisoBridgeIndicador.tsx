import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Bridge } from "@/tipos/bridge";
import { evaluateAvisoBridge, hasAvisoDestacado, listAvisosBridge } from "./bridges.utils";

const CANTIDAD_VISIBLE = 2;

interface AvisoBridgeIndicadorProps {
  bridge: Bridge;
}

/**
 * Ícono de aviso por fila del listado de bridges (F8), reemplaza la pila de
 * `<AvisoBridge>` que `BridgesPage.tsx` mostraba arriba de toda la tabla
 * (una alerta completa por bridge con aviso -- no escalaba con muchos
 * bridges problemáticos a la vez). `AvisoBridge.tsx`/`evaluateAvisoBridge()`
 * siguen usándose tal cual en `detalle/BridgeDetallePage.tsx` (ahí solo hay
 * UN bridge, no hay problema de apilamiento) -- sin cambios en este
 * archivo.
 *
 * Accesibilidad (docs/07, criterio transversal -- nunca solo color): el
 * ícono es solo delineado (`stroke`, sin relleno ni círculo de fondo) en
 * `text-warning`, pero el `aria-label` describe el problema y el popover
 * repite el texto completo al hacer clic. El botón mide 40px de área de
 * clic (`size-10`) aunque el ícono visual sea de 16px (`size-4`) -- se
 * extiende con padding, no agrandando el ícono.
 *
 * Sin aviso, no renderiza nada (ni ícono ni espacio reservado) -- la celda
 * de la tabla queda vacía para un bridge sano.
 */
export function AvisoBridgeIndicador({ bridge }: AvisoBridgeIndicadorProps) {
  const [expandido, setExpandido] = useState(false);

  const aviso = evaluateAvisoBridge(bridge);
  if (!hasAvisoDestacado(aviso)) return null;

  const avisos = listAvisosBridge(bridge);
  const visibles = expandido ? avisos : avisos.slice(0, CANTIDAD_VISIBLE);
  const restantes = avisos.length - CANTIDAD_VISIBLE;

  return (
    <Popover
      onOpenChange={(abierto) => {
        if (!abierto) setExpandido(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Avisos de ${bridge.nombre}`}
          className="inline-flex size-10 items-center justify-center rounded-md text-warning hover:bg-warning/10"
        >
          <AlertTriangle className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <p className="mb-2 text-sm font-medium">{bridge.nombre}</p>
        <div
          className={
            expandido ? "flex max-h-96 flex-col gap-2 overflow-y-auto pr-1" : "flex flex-col gap-2"
          }
        >
          {visibles.map((item, indice) => (
            <p
              key={indice}
              className={
                item.severidad === "alta"
                  ? "text-sm font-medium text-foreground"
                  : "text-sm text-muted-foreground"
              }
            >
              {item.mensaje}
            </p>
          ))}
        </div>
        {!expandido && restantes > 0 ? (
          <button
            type="button"
            onClick={() => setExpandido(true)}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            +{restantes} más
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
