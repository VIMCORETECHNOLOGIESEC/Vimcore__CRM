import { Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { ROLES_USUARIO } from "@/tipos/usuario";
import { ROL_ETIQUETAS } from "./catalogos";
import { FILTRO_TODOS, FILTROS_USUARIOS_VACIOS, type UsuariosFiltrosState } from "./usuarios.utils";

/** Etiqueta del toggle "solo holding-wide" -- misma cadena en el `<Label>`, el chip y `aria-label` del `Checkbox`. */
const ETIQUETA_SOLO_HOLDING_WIDE = "Solo usuarios holding-wide (sin empresa)";

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
  const { user } = useAuth();
  /**
   * El toggle "solo holding-wide" solo tiene sentido para una sesión
   * holding-wide -- `sessionScope` es el campo real resuelto server-side
   * (`AuthenticatedUser`), nunca se infiere localmente (ver
   * `tipos/usuario.ts::AuthenticatedUser`). Una sesión company-scoped ni
   * siquiera ve el control (backend lo ignora igual, ver el docblock de
   * `UsuariosQueryParams::soloHoldingWide`).
   */
  const esHoldingWide = user?.sessionScope === "holding";

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
    if (filtros.soloHoldingWide) {
      chips.push({ campo: "soloHoldingWide", etiqueta: "Alcance", valorLegible: ETIQUETA_SOLO_HOLDING_WIDE });
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

                {esHoldingWide ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="filtro-solo-holding-wide"
                      checked={filtros.soloHoldingWide}
                      onCheckedChange={(marcado) => update("soloHoldingWide", marcado === true)}
                      aria-label={ETIQUETA_SOLO_HOLDING_WIDE}
                    />
                    <Label htmlFor="filtro-solo-holding-wide" className="text-sm font-normal">
                      {ETIQUETA_SOLO_HOLDING_WIDE}
                    </Label>
                  </div>
                ) : null}
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
