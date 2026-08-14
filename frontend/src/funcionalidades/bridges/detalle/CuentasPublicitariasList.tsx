import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import type { CuentaPublicitariaBridge } from "@/tipos/bridge";
import { useToggleCuentaActiva } from "../useBridges";

interface CuentasPublicitariasListProps {
  bridgeId: string;
  cuentas: CuentaPublicitariaBridge[];
}

/**
 * Cuentas publicitarias asociadas al bridge (F8, "Detalle con cuentas
 * publicitarias asociadas"). Activar/desactivar se agrega porque
 * `docs/05-bridges.md` §7 lo documenta explícitamente ("Alta y baja de
 * cuentas publicitarias") aunque el checklist de docs/07 solo pide
 * mostrarlas -- ver la nota de mock en `bridges.api.ts::toggleCuentaActivaApi`.
 * No hay alta de cuentas nuevas: no está en ningún checklist de frontend y
 * requeriría decidir de dónde saldría el `idExterno` (¿un catálogo que trae
 * el backend desde la plataforma? ¿texto libre?) -- fuera de alcance de
 * este cambio, señalado para no inventarlo.
 */
export function CuentasPublicitariasList({ bridgeId, cuentas }: CuentasPublicitariasListProps) {
  const toggleActiva = useToggleCuentaActiva(bridgeId);

  if (cuentas.length === 0) {
    return (
      <EmptyState
        title="Sin cuentas publicitarias asociadas"
        description="Este bridge todavía no tiene ninguna cuenta vinculada."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {cuentas.map((cuenta) => (
        <li
          key={cuenta.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{cuenta.nombre}</span>
            <span className="text-xs text-muted-foreground">ID externo: {cuenta.idExterno}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                cuenta.activa
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {cuenta.activa ? "Activa" : "Inactiva"}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={toggleActiva.isPending}
              onClick={() =>
                toggleActiva.mutate({ cuentaId: cuenta.id, activa: !cuenta.activa })
              }
            >
              {cuenta.activa ? "Desactivar" : "Activar"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
