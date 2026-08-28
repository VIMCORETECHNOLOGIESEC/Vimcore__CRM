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
import { ROLES_USUARIO } from "@/tipos/usuario";
import { ROL_ETIQUETAS } from "./catalogos";
import { FILTRO_TODOS, FILTROS_USUARIOS_VACIOS, type UsuariosFiltrosState } from "./usuarios.utils";

interface UsuariosFiltrosProps {
  filtros: UsuariosFiltrosState;
  onChange: (filtros: UsuariosFiltrosState) => void;
  /** Abre el diálogo de alta de usuario (el estado del diálogo vive en `UsuariosPage`). */
  onNuevo: () => void;
}

/**
 * Barra de búsqueda y filtros del listado de usuarios (F7), mismo patrón
 * visual que `leads/LeadsFiltros.tsx`: título a la izquierda, búsqueda +
 * botón "Filtros" (popover) a la derecha, y chips de filtros activos con
 * su `X` para quitarlos. El popover agrupa los filtros acotados (rol,
 * estado) que antes estaban como selects inline.
 */
export function UsuariosFiltros({ filtros, onChange, onNuevo }: UsuariosFiltrosProps) {
  function update<K extends keyof UsuariosFiltrosState>(campo: K, valor: UsuariosFiltrosState[K]) {
    onChange({ ...filtros, [campo]: valor });
  }

  function removeFiltro(campo: keyof UsuariosFiltrosState) {
    update(campo, FILTROS_USUARIOS_VACIOS[campo] as never);
  }

  const filtrosActivos = useMemo(() => {
    const chips: { campo: keyof UsuariosFiltrosState; etiqueta: string; valorLegible: string }[] = [];
    if (filtros.rol !== FILTRO_TODOS) {
      chips.push({ campo: "rol", etiqueta: "Rol", valorLegible: ROL_ETIQUETAS[filtros.rol] });
    }
    if (filtros.estado !== "ACTIVOS") {
      const estadoLegible =
        filtros.estado === "INACTIVOS" ? "Inactivos" : filtros.estado === "TODOS" ? "Todos" : filtros.estado;
      chips.push({ campo: "estado", etiqueta: "Estado", valorLegible: estadoLegible });
    }
    return chips;
  }, [filtros]);

  const cantidadFiltrosAvanzados = filtrosActivos.length;
  const hayFiltrosActivos = filtrosActivos.length > 0;

  return (
    <div className="flex flex-col gap-3 p-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex shrink-0 items-center gap-3">
          <h2 className="text-2xl">Gestión de Usuarios</h2>
          <Button onClick={onNuevo} className="rounded-2xl">
            <Plus className="size-4" aria-hidden="true" />
            Nuevo usuario
          </Button>
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
              placeholder="Buscar por nombre o correo…"
              aria-label="Buscar usuarios"
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
                    etiqueta="Rol"
                    valor={filtros.rol}
                    onChange={(v) => update("rol", v as UsuariosFiltrosState["rol"])}
                    opciones={ROLES_USUARIO.map((rol) => ({ valor: rol, etiqueta: ROL_ETIQUETAS[rol] }))}
                  />
                  <CampoSelect
                    etiqueta="Estado"
                    valor={filtros.estado}
                    onChange={(v) => update("estado", v as UsuariosFiltrosState["estado"])}
                    includeAllOption={false}
                    opciones={[
                      { valor: "TODOS", etiqueta: "Todos" },
                      { valor: "ACTIVOS", etiqueta: "Activos" },
                      { valor: "INACTIVOS", etiqueta: "Inactivos" },
                    ]}
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
            onClick={() => onChange(FILTROS_USUARIOS_VACIOS)}
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
  includeAllOption?: boolean;
  opciones: { valor: string; etiqueta: string }[];
}

function CampoSelect({ etiqueta, valor, onChange, includeAllOption = true, opciones }: CampoSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger aria-label={etiqueta}>
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          {includeAllOption ? <SelectItem value={FILTRO_TODOS}>Todos</SelectItem> : null}
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
