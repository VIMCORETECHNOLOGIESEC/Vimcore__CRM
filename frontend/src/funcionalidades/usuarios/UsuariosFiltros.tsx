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
import { ROLES_USUARIO } from "@/tipos/usuario";
import { ROL_ETIQUETAS } from "./catalogos";
import { FILTRO_TODOS, type UsuariosFiltrosState } from "./usuarios.utils";

interface UsuariosFiltrosProps {
  filtros: UsuariosFiltrosState;
  onChange: (filtros: UsuariosFiltrosState) => void;
}

/**
 * Barra de búsqueda y filtros del listado de usuarios (F7), mismo patrón de
 * estado controlado (`filtros`/`onChange`) que `leads/LeadsFiltros.tsx`. Sin
 * `Popover` de filtros avanzados a diferencia de leads: solo dos filtros
 * (rol, estado) además de la búsqueda, no justifican esa complejidad extra.
 */
export function UsuariosFiltros({ filtros, onChange }: UsuariosFiltrosProps) {
  function update<K extends keyof UsuariosFiltrosState>(campo: K, valor: UsuariosFiltrosState[K]) {
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
          placeholder="Buscar por nombre o correo…"
          aria-label="Buscar usuarios"
          className="pl-9"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground sm:sr-only">Rol</Label>
        <Select
          value={filtros.rol}
          onValueChange={(valor) => update("rol", valor as UsuariosFiltrosState["rol"])}
        >
          <SelectTrigger aria-label="Rol" className="w-full sm:w-44">
            <SelectValue placeholder="Todos los roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todos los roles</SelectItem>
            {ROLES_USUARIO.map((rol) => (
              <SelectItem key={rol} value={rol}>
                {ROL_ETIQUETAS[rol]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground sm:sr-only">Estado</Label>
        <Select
          value={filtros.estado}
          onValueChange={(valor) => update("estado", valor as UsuariosFiltrosState["estado"])}
        >
          <SelectTrigger aria-label="Estado" className="w-full sm:w-40">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los estados</SelectItem>
            <SelectItem value="ACTIVOS">Activos</SelectItem>
            <SelectItem value="INACTIVOS">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
