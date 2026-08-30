import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RED_SOCIAL_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import { FILTRO_TODOS } from "@/funcionalidades/leads/leads.utils";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";
import type { RedSocial } from "@/tipos/lead";
import type { DashboardFiltrosState } from "./dashboard.utils";

interface DashboardFiltrosProps {
  filtros: DashboardFiltrosState;
  onChange: (filtros: DashboardFiltrosState) => void;
  campanias: { id: string; nombre: string }[];
  responsables: { id: string; nombre: string }[];
  /** Oculto para asesor/vendedor: su cartera ya está implícita en el rol (docs/08 §4). */
  mostrarFiltroResponsable: boolean;
}

const REDES_SOCIALES: RedSocial[] = ["FACEBOOK", "INSTAGRAM", "X", "LINKEDIN", "GOOGLE_FORMS"];

/**
 * Filtros combinables del dashboard: red social, campaña y responsable
 * (docs/08 §4). El selector de campaña manda el `nombre` como valor (texto
 * libre, `ILIKE` contra `payload_original ->> 'nombreCampania'` en el
 * backend real), no un id -- `campanias` sigue siendo el catálogo local fijo
 * `getCatalogoCampanias()` (mismo gap ya documentado en
 * `leads.api.ts::LeadsQueryParams.campaniaId`: no hay una entidad real de
 * campaña con id, M4/F8 fuera de alcance).
 */
export function DashboardFiltros({
  filtros,
  onChange,
  campanias,
  responsables,
  mostrarFiltroResponsable,
}: DashboardFiltrosProps) {
  function update<K extends keyof DashboardFiltrosState>(campo: K, valor: DashboardFiltrosState[K]) {
    onChange({ ...filtros, [campo]: valor });
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border border-border/70 bg-background/40 p-3 sm:grid-cols-3">
      <CampoSelect
        etiqueta="Red social"
        valor={filtros.redSocial}
        onChange={(v) => update("redSocial", v as DashboardFiltrosState["redSocial"])}
        opciones={REDES_SOCIALES.map((r) => ({ valor: r, etiqueta: RED_SOCIAL_ETIQUETAS[r] }))}
      />
      <CampoSelect
        etiqueta="Campaña"
        valor={filtros.campania}
        onChange={(v) => update("campania", v)}
        opciones={campanias.map((c) => ({ valor: c.nombre, etiqueta: c.nombre }))}
      />
      {mostrarFiltroResponsable ? (
        <ResponsableCombobox
          etiqueta="Responsable"
          ariaLabel="Responsable"
          valor={filtros.responsableId}
          onChange={(v) => update("responsableId", v)}
          responsables={responsables}
          mostrarOpcionTodos
          valorOpcionTodos={FILTRO_TODOS}
          etiquetaOpcionTodos="Todos los responsables"
          etiquetaBotonOpcionTodos="Todos"
        />
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
    <div className="flex min-w-0 flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger aria-label={etiqueta}>
          <SelectValue placeholder="Todas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTRO_TODOS}>Todas</SelectItem>
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
