import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/tipos/lead";
import type { AuthenticatedUser } from "@/tipos/usuario";
import { getCatalogoResponsables, getCatalogoVendedores } from "../leads.api";
import { ResponsableCombobox } from "../ResponsableCombobox";
import { canHandoffToVendedor, canReassignLead } from "./leadDetalle.guards";
import { useHandoffToVendedor, useReassignLead } from "./useLeadDetalle";

interface AccionesResponsableProps {
  lead: Lead;
  user: AuthenticatedUser;
}

/**
 * Traspaso a vendedor y reasignación (F4, docs/02-reglas-negocio.md §5).
 * `canHandoffToVendedor`/`canReassignLead` (`leadDetalle.guards.ts`) deciden
 * qué botón se muestra -- son guards de UX, la autorización real es
 * responsabilidad del backend cuando exista M6/M7.
 *
 * Cada buscador restringe su propio listado (`getCatalogoResponsables`,
 * `leads.api.ts`): "Reasignar" busca solo entre `ASESORES` -- el responsable
 * del primer contacto -- y "Traspasar"/"Traspasar a vendedor" busca solo
 * entre `VENDEDORES` -- el responsable del proceso de venta. Nunca mezclan
 * ambas poblaciones, a diferencia del catálogo general
 * (`getCatalogoResponsables()` sin argumento) que usan a propósito el
 * dashboard y la tabla de leads.
 */
export function AccionesResponsable({ lead, user }: AccionesResponsableProps) {
  const [vendedorElegido, setVendedorElegido] = useState("");
  const [responsableElegido, setResponsableElegido] = useState("");

  const handoff = useHandoffToVendedor(lead.id);
  const reassign = useReassignLead(lead.id);

  // Backend real (D-A2, integración F3/F4): `getCatalogoVendedores`/
  // `getCatalogoResponsables` ahora son async.
  const { data: vendedores = [] } = useQuery({
    queryKey: ["catalogo-responsables", "VENDEDORES"],
    queryFn: () => getCatalogoVendedores(),
  });
  const { data: asesores = [] } = useQuery({
    queryKey: ["catalogo-responsables", "ASESORES"],
    queryFn: () => getCatalogoResponsables("ASESORES"),
  });

  const puedeTraspasar = canHandoffToVendedor(lead, user);
  const puedeReasignar = canReassignLead(lead, user);
  const eligeVendedorManualmente = user.rol === "ADMINISTRADOR" || user.rol === "SUPERVISOR";

  if (!puedeTraspasar && !puedeReasignar) return null;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Responsable del lead</h2>

      {puedeTraspasar ? (
        <div className="flex flex-wrap items-center gap-2">
          {eligeVendedorManualmente ? (
            <>
              <ResponsableCombobox
                valor={vendedorElegido}
                onChange={setVendedorElegido}
                responsables={vendedores}
                ariaLabel="Vendedor a traspasar"
                placeholder="Elegir vendedor…"
                placeholderBusqueda="Buscar vendedor…"
                className="w-56"
              />
              <Button
                size="sm"
                disabled={!vendedorElegido || handoff.isPending}
                onClick={() => handoff.mutate(vendedorElegido)}
              >
                {handoff.isPending ? "Traspasando…" : "Traspasar"}
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={handoff.isPending} onClick={() => handoff.mutate(undefined)}>
              {handoff.isPending ? "Traspasando…" : "Traspasar a vendedor"}
            </Button>
          )}
        </div>
      ) : null}

      {puedeReasignar ? (
        <div className="flex flex-wrap items-center gap-2">
          <ResponsableCombobox
            valor={responsableElegido}
            onChange={setResponsableElegido}
            responsables={asesores}
            ariaLabel="Nuevo asesor"
            placeholder="Elegir asesor…"
            placeholderBusqueda="Buscar asesor…"
            className="w-56"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!responsableElegido || reassign.isPending}
            onClick={() => reassign.mutate(responsableElegido)}
          >
            {reassign.isPending ? "Reasignando…" : "Reasignar"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
