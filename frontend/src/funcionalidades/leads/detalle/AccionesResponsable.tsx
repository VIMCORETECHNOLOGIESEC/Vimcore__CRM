import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Lead } from "@/tipos/lead";
import type { AuthenticatedUser } from "@/tipos/usuario";
import { getCatalogoResponsables, getCatalogoVendedores } from "../leads.api";
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
 */
export function AccionesResponsable({ lead, user }: AccionesResponsableProps) {
  const [vendedorElegido, setVendedorElegido] = useState("");
  const [responsableElegido, setResponsableElegido] = useState("");

  const handoff = useHandoffToVendedor(lead.id);
  const reassign = useReassignLead(lead.id);

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
              <Select value={vendedorElegido} onValueChange={setVendedorElegido}>
                <SelectTrigger className="w-56" aria-label="Vendedor a traspasar">
                  <SelectValue placeholder="Elegir vendedor…" />
                </SelectTrigger>
                <SelectContent>
                  {getCatalogoVendedores().map((vendedor) => (
                    <SelectItem key={vendedor.id} value={vendedor.id}>
                      {vendedor.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Select value={responsableElegido} onValueChange={setResponsableElegido}>
            <SelectTrigger className="w-56" aria-label="Nuevo responsable">
              <SelectValue placeholder="Elegir responsable…" />
            </SelectTrigger>
            <SelectContent>
              {getCatalogoResponsables().map((responsable) => (
                <SelectItem key={responsable.id} value={responsable.id}>
                  {responsable.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
