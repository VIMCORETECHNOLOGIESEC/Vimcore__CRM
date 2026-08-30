import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { getCatalogoResponsables } from "@/funcionalidades/leads/leads.api";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";
import type { EtapaLead } from "@/tipos/lead";
import { ETAPA_OPORTUNIDAD_ETIQUETAS } from "./catalogos";
import {
  buildFiltrosActivos,
  FILTRO_TODOS,
  FILTROS_VACIOS,
  type FiltrosState,
} from "./oportunidades.utils";

const ETAPAS: EtapaLead[] = ["NUEVO", "CONTACTADO", "CITA", "VENTA", "NO_VENTA"];

interface OportunidadesFiltrosProps {
  filtros: FiltrosState;
  onChange: (filtros: FiltrosState) => void;
}

/**
 * Barra de filtros combinables del listado de oportunidades (Bloque D) --
 * mismo patrón que `leads/LeadsFiltros.tsx`: `Popover` con los campos, chips de
 * filtros activos y limpiar-todo. El selector de asesor solo se muestra para
 * ADMINISTRADOR/SUPERVISOR (un ASESOR/VENDEDOR ya queda acotado a su cartera
 * por el `where` de rol del backend).
 */
export function OportunidadesFiltros({ filtros, onChange }: OportunidadesFiltrosProps) {
  const { hasRole } = useAuth();
  const esGestorDeCartera = hasRole(["ADMINISTRADOR", "SUPERVISOR"]);

  const { data: asesores = [] } = useQuery({
    queryKey: ["oportunidades-catalogo-asesores"],
    queryFn: () => getCatalogoResponsables("ASESORES"),
    enabled: esGestorDeCartera,
  });

  function update<K extends keyof FiltrosState>(campo: K, valor: FiltrosState[K]) {
    onChange({ ...filtros, [campo]: valor });
  }

  function removeFiltro(campo: keyof FiltrosState) {
    update(campo, FILTROS_VACIOS[campo] as never);
  }

  const filtrosActivos = useMemo(
    () => buildFiltrosActivos(filtros, asesores),
    [filtros, asesores],
  );
  const hayFiltrosActivos = filtrosActivos.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 text-2xl">Oportunidades</h2>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="ml-auto h-10 gap-2 rounded-2xl bg-transparent">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filtros
              {filtrosActivos.length > 0 ? (
                <Badge variant="secondary">{filtrosActivos.length}</Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={{ top: 80 }}
            className="w-[min(420px,calc(100vw-2rem))]"
          >
            <div className="flex flex-col gap-4">
              <p className="font-medium">Filtros</p>
              <div className="grid grid-cols-2 gap-3">
                <CampoSelect
                  etiqueta="Etapa"
                  valor={filtros.etapa}
                  onChange={(v) => update("etapa", v as FiltrosState["etapa"])}
                  opciones={ETAPAS.map((e) => ({ valor: e, etiqueta: ETAPA_OPORTUNIDAD_ETIQUETAS[e] }))}
                />
                {esGestorDeCartera ? (
                  <ResponsableCombobox
                    valor={filtros.asesorId}
                    onChange={(v) => update("asesorId", v)}
                    responsables={asesores}
                    etiqueta="Asesor"
                    ariaLabel="Asesor"
                    mostrarOpcionTodos
                    valorOpcionTodos={FILTRO_TODOS}
                    etiquetaOpcionTodos="Todos los asesores"
                    placeholderBusqueda="Buscar asesor…"
                  />
                ) : null}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {hayFiltrosActivos ? (
        <div className="flex flex-wrap items-center gap-2">
          {filtrosActivos.map((filtro) => (
            <span
              key={filtro.campo}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
            >
              {filtro.etiqueta}: {filtro.valorLegible}
              <button
                type="button"
                onClick={() => removeFiltro(filtro.campo)}
                aria-label={`Quitar filtro ${filtro.etiqueta}`}
                className="rounded-full p-0.5 hover:bg-accent"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Limpiar todos los filtros"
            onClick={() => onChange(FILTROS_VACIOS)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface CampoSelectProps {
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  opciones: { valor: string; etiqueta: string }[];
}

function CampoSelect({ etiqueta, valor, onChange, opciones }: CampoSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger aria-label={etiqueta}>
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTRO_TODOS}>Todos</SelectItem>
          {opciones.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
