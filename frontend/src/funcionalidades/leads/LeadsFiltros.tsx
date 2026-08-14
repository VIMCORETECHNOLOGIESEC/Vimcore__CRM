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
import type { EstadoSla, EtapaLead, RedSocial, SemaforoLead } from "@/tipos/lead";
import {
  ESTADO_SLA_ETIQUETAS,
  ETAPA_ETIQUETAS,
  RED_SOCIAL_ETIQUETAS,
  SEMAFORO_ETIQUETAS,
} from "./catalogos";
import { FILTRO_TODOS, type LeadsFiltrosState } from "./leads.utils";

interface LeadsFiltrosProps {
  filtros: LeadsFiltrosState;
  onChange: (filtros: LeadsFiltrosState) => void;
  campanias: { id: string; nombre: string }[];
  /** Oculto para asesor/vendedor: su cartera ya está implícita en el rol (docs/07 F3). */
  mostrarFiltroResponsable: boolean;
  responsables: { id: string; nombre: string }[];
}

const ETAPAS: EtapaLead[] = ["NUEVO", "CONTACTADO", "CITA", "VENTA", "NO_VENTA"];
const SEMAFOROS: SemaforoLead[] = ["VERDE", "AMARILLO", "ROJO"];
const REDES_SOCIALES: RedSocial[] = ["FACEBOOK", "INSTAGRAM", "X", "LINKEDIN", "GOOGLE_FORMS"];
const ESTADOS_SLA: EstadoSla[] = ["A_TIEMPO", "EN_RIESGO", "ATRASADO"];

/** Barra de filtros combinables y búsqueda del listado de leads (docs/07 F3). */
export function LeadsFiltros({
  filtros,
  onChange,
  campanias,
  mostrarFiltroResponsable,
  responsables,
}: LeadsFiltrosProps) {
  function update<K extends keyof LeadsFiltrosState>(campo: K, valor: LeadsFiltrosState[K]) {
    onChange({ ...filtros, [campo]: valor });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={filtros.busqueda}
          onChange={(event) => update("busqueda", event.target.value)}
          placeholder="Buscar por nombre, teléfono o correo…"
          aria-label="Buscar leads"
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <CampoSelect
          etiqueta="Etapa"
          valor={filtros.etapa}
          onChange={(v) => update("etapa", v as LeadsFiltrosState["etapa"])}
          opciones={ETAPAS.map((e) => ({ valor: e, etiqueta: ETAPA_ETIQUETAS[e] }))}
        />
        <CampoSelect
          etiqueta="Semáforo"
          valor={filtros.semaforo}
          onChange={(v) => update("semaforo", v as LeadsFiltrosState["semaforo"])}
          opciones={SEMAFOROS.map((s) => ({ valor: s, etiqueta: SEMAFORO_ETIQUETAS[s] }))}
        />
        <CampoSelect
          etiqueta="Red social"
          valor={filtros.redSocial}
          onChange={(v) => update("redSocial", v as LeadsFiltrosState["redSocial"])}
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
        <CampoSelect
          etiqueta="Estado de SLA"
          valor={filtros.estadoSla}
          onChange={(v) => update("estadoSla", v as LeadsFiltrosState["estadoSla"])}
          opciones={ESTADOS_SLA.map((e) => ({ valor: e, etiqueta: ESTADO_SLA_ETIQUETAS[e] }))}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="filtro-fecha-desde" className="text-xs text-muted-foreground">
            Ingreso desde
          </Label>
          <Input
            id="filtro-fecha-desde"
            type="date"
            value={filtros.fechaDesde}
            onChange={(event) => update("fechaDesde", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filtro-fecha-hasta" className="text-xs text-muted-foreground">
            Ingreso hasta
          </Label>
          <Input
            id="filtro-fecha-hasta"
            type="date"
            value={filtros.fechaHasta}
            onChange={(event) => update("fechaHasta", event.target.value)}
          />
        </div>
      </div>
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
