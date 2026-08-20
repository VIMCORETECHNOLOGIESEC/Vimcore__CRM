import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTADO_BRIDGE_ETIQUETAS, ESTADOS_BRIDGE, RED_SOCIAL_ETIQUETAS } from "./catalogos";
import { FILTRO_TODOS, type BridgesFiltrosState } from "./bridges.utils";
import { useRedesSocialesSoportadas } from "./useBridges";

interface BridgesFiltrosProps {
  filtros: BridgesFiltrosState;
  onChange: (filtros: BridgesFiltrosState) => void;
}

/**
 * Barra de búsqueda y filtros del listado de bridges (F8), mismo patrón de
 * estado controlado (`filtros`/`onChange`) y misma complejidad visual que
 * `usuarios/UsuariosFiltros.tsx` (sin el `Popover` de filtros avanzados de
 * `leads/LeadsFiltros.tsx`): solo dos filtros (red social, estado) además de
 * la búsqueda, no justifican esa complejidad extra. El selector de red
 * social usa el catálogo COMPLETO de redes soportadas
 * (`useRedesSocialesSoportadas`, el mismo que ya alimenta
 * `NuevoBridgeDialog`), no solo las redes con bridges activos -- acá se
 * filtra el listado completo del administrador, no la cartera de leads.
 */
export function BridgesFiltros({ filtros, onChange }: BridgesFiltrosProps) {
  const { data: redesSociales = [] } = useRedesSocialesSoportadas();

  function update<K extends keyof BridgesFiltrosState>(campo: K, valor: BridgesFiltrosState[K]) {
    onChange({ ...filtros, [campo]: valor });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
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

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground sm:sr-only">Red social</Label>
        <Select
          value={filtros.redSocial}
          onValueChange={(valor) => update("redSocial", valor as BridgesFiltrosState["redSocial"])}
        >
          <SelectTrigger aria-label="Red social" className="w-full sm:w-44">
            <SelectValue placeholder="Todas las redes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todas las redes</SelectItem>
            {redesSociales.map((red) => (
              <SelectItem key={red} value={red}>
                {RED_SOCIAL_ETIQUETAS[red]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground sm:sr-only">Estado</Label>
        <Select
          value={filtros.estado}
          onValueChange={(valor) => update("estado", valor as BridgesFiltrosState["estado"])}
        >
          <SelectTrigger aria-label="Estado" className="w-full sm:w-44">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todos los estados</SelectItem>
            {ESTADOS_BRIDGE.map((estado) => (
              <SelectItem key={estado} value={estado}>
                {ESTADO_BRIDGE_ETIQUETAS[estado]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
