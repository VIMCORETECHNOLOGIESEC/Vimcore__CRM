import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RED_SOCIAL_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import { FILTRO_TODOS } from "@/funcionalidades/leads/leads.utils";
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

/** Filtros combinables del dashboard: red social, campaña y responsable (docs/08 §4). */
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
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-3">
      <CampoSelect
        etiqueta="Red social"
        valor={filtros.redSocial}
        onChange={(v) => update("redSocial", v as DashboardFiltrosState["redSocial"])}
        opciones={REDES_SOCIALES.map((r) => ({ valor: r, etiqueta: RED_SOCIAL_ETIQUETAS[r] }))}
      />
      <CampoSelect
        etiqueta="Campaña"
        valor={filtros.campaniaId}
        onChange={(v) => update("campaniaId", v)}
        opciones={campanias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
      />
      {mostrarFiltroResponsable ? (
        <CampoSelect
          etiqueta="Responsable"
          valor={filtros.responsableId}
          onChange={(v) => update("responsableId", v)}
          opciones={responsables.map((r) => ({ valor: r.id, etiqueta: r.nombre }))}
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
    <div className="flex flex-col gap-1">
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
