import { Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTADO_BRIDGE_ETIQUETAS, ESTADOS_BRIDGE, RED_SOCIAL_ETIQUETAS } from "./catalogos";
import { FILTRO_TODOS, FILTROS_BRIDGES_VACIOS, type BridgesFiltrosState } from "./bridges.utils";
import { useRedesSocialesSoportadas } from "./useBridges";

interface BridgesFiltrosProps {
  filtros: BridgesFiltrosState;
  onChange: (filtros: BridgesFiltrosState) => void;
  /**
   * Abre el diálogo de alta de bridge (el estado del diálogo vive en
   * `BridgesPage`). Opcional: omitido (`undefined`) oculta el botón "Nuevo
   * bridge" por completo -- caso de un holding-wide en "Ver en vivo" de una
   * empresa (`useVistaEmpresa().esVistaSoloLectura`), que solo puede
   * navegar, nunca escribir.
   */
  onNuevo?: () => void;
}

/**
 * Barra de búsqueda y filtros del listado de bridges (F8), mismo patrón
 * visual que `leads/LeadsFiltros.tsx` y `usuarios/UsuariosFiltros.tsx`:
 * título a la izquierda, búsqueda + botón "Filtros" (popover) a la derecha,
 * y chips de filtros activos con su `X` para quitarlos. El popover agrupa
 * los filtros acotados (red social, estado) que antes estaban como selects
 * inline. El selector de red social usa el catálogo COMPLETO de redes
 * soportadas (`useRedesSocialesSoportadas`), no solo las redes con bridges
 * activos -- acá se filtra el listado completo del administrador.
 */
export function BridgesFiltros({ filtros, onChange, onNuevo }: BridgesFiltrosProps) {
  const { data: redesSociales = [] } = useRedesSocialesSoportadas();

  function update<K extends keyof BridgesFiltrosState>(campo: K, valor: BridgesFiltrosState[K]) {
    onChange({ ...filtros, [campo]: valor });
  }

  function removeFiltro(campo: keyof BridgesFiltrosState) {
    update(campo, FILTROS_BRIDGES_VACIOS[campo] as never);
  }

  const filtrosActivos = useMemo(() => {
    const chips: { campo: keyof BridgesFiltrosState; etiqueta: string; valorLegible: string }[] = [];
    if (filtros.redSocial !== FILTRO_TODOS) {
      chips.push({
        campo: "redSocial",
        etiqueta: "Red social",
        valorLegible: RED_SOCIAL_ETIQUETAS[filtros.redSocial],
      });
    }
    if (filtros.estado !== FILTRO_TODOS) {
      chips.push({
        campo: "estado",
        etiqueta: "Estado",
        valorLegible: ESTADO_BRIDGE_ETIQUETAS[filtros.estado],
      });
    }
    return chips;
  }, [filtros]);

  const cantidadFiltrosAvanzados = filtrosActivos.length;
  const hayFiltrosActivos = filtrosActivos.length > 0;

  return (
    <div className="flex flex-col gap-3 p-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex shrink-0 items-center gap-3">
          <h2 className="text-2xl">Gestión de Bridges</h2>
          {onNuevo ? (
            <Button onClick={onNuevo} className="rounded-2xl">
              <Plus className="size-4" aria-hidden="true" />
              Nuevo bridge
            </Button>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:ml-auto sm:w-full sm:max-w-xl sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={filtros.busqueda}
              onChange={(event) => update("busqueda", event.target.value)}
              placeholder="Buscar por nombre…"
              aria-label="Buscar bridges"
              className="pl-9"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-2xl bg-transparent self-start sm:self-auto"
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Filtros
                {cantidadFiltrosAvanzados > 0 ? (
                  <Badge variant="secondary">{cantidadFiltrosAvanzados}</Badge>
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
                    etiqueta="Red social"
                    valor={filtros.redSocial}
                    onChange={(v) => update("redSocial", v as BridgesFiltrosState["redSocial"])}
                    opciones={redesSociales.map((red) => ({
                      valor: red,
                      etiqueta: RED_SOCIAL_ETIQUETAS[red],
                    }))}
                  />
                  <CampoSelect
                    etiqueta="Estado"
                    valor={filtros.estado}
                    onChange={(v) => update("estado", v as BridgesFiltrosState["estado"])}
                    opciones={ESTADOS_BRIDGE.map((estado) => ({
                      valor: estado,
                      etiqueta: ESTADO_BRIDGE_ETIQUETAS[estado],
                    }))}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
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
            onClick={() => onChange(FILTROS_BRIDGES_VACIOS)}
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
