import { Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRedesSocialesActivas } from "@/funcionalidades/bridges/useBridges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
import type { EstadoSla, EtapaLead, RedSocial, SemaforoLead } from "@/tipos/lead";
import {
  ESTADO_SLA_ETIQUETAS,
  ETAPA_ETIQUETAS,
  RED_SOCIAL_ETIQUETAS,
  SEMAFORO_ETIQUETAS,
} from "./catalogos";
import {
  buildFiltrosActivos,
  FILTRO_TODOS,
  FILTROS_LEADS_VACIOS,
  type LeadsFiltrosState,
} from "./leads.utils";

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
const ESTADOS_SLA: EstadoSla[] = ["A_TIEMPO", "EN_RIESGO", "ATRASADO"];

const MAX_RESULTADOS_RESPONSABLE = 5;

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

  function removeFiltro(campo: keyof LeadsFiltrosState) {
    // FILTROS_LEADS_VACIOS[campo] siempre tiene el tipo correcto para ese
    // campo puntual, pero TS no lo infiere al recorrer la unión de claves.
    update(campo, FILTROS_LEADS_VACIOS[campo] as never);
  }

  const { data: redesSocialesActivas, isLoading: cargandoRedesSociales } = useRedesSocialesActivas();

  /**
   * Requirement: Red-Social Filter Sourced from Active Bridges. Edge case
   * documentado en el diseño: si el `redSocial` ya elegido dejó de estar
   * activo (se desactivó su bridge DESPUÉS de aplicar el filtro), se
   * mantiene como opción renderizada en vez de desaparecer -- si no,
   * un filtro activo se "esfumaría" silenciosamente sin que el usuario lo
   * haya tocado.
   */
  const opcionesRedSocial = useMemo<RedSocial[]>(() => {
    const activas = redesSocialesActivas ?? [];
    if (filtros.redSocial !== FILTRO_TODOS && !activas.includes(filtros.redSocial)) {
      return [...activas, filtros.redSocial];
    }
    return activas;
  }, [redesSocialesActivas, filtros.redSocial]);

  const filtrosActivos = useMemo(
    () => buildFiltrosActivos(filtros, campanias, responsables),
    [filtros, campanias, responsables],
  );
  const cantidadFiltrosAvanzados = filtrosActivos.filter((f) => f.campo !== "busqueda").length;
  const hayFiltrosActivos = filtrosActivos.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
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

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 self-start sm:self-auto">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filtros
              {cantidadFiltrosAvanzados > 0 ? (
                <Badge variant="secondary">{cantidadFiltrosAvanzados}</Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          {/* side="bottom" + collisionPadding.top: el Header de la app es fijo,
              así que se le resta espacio a la zona de arriba para que Radix
              nunca considere voltear el popover hacia "top" (quedaría
              cortado). A diferencia de avoidCollisions={false} (probado
              antes y descartado: apagaba TAMBIÉN el desplazamiento
              horizontal, corriendo el popover fuera de la pantalla hacia la
              derecha), esto deja el shift horizontal activo con su
              comportamiento default. align="end": el botón "Filtros" queda
              pegado al borde derecho de la barra, así que el popover crece
              hacia la izquierda desde ahí, no hacia la derecha (se saldría
              de la pantalla). */}
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
                  opciones={opcionesRedSocial.map((r) => ({ valor: r, etiqueta: RED_SOCIAL_ETIQUETAS[r] }))}
                  disabled={cargandoRedesSociales}
                />
                <CampoSelect
                  etiqueta="Campaña"
                  valor={filtros.campaniaId}
                  onChange={(v) => update("campaniaId", v)}
                  opciones={campanias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
                />
                {mostrarFiltroResponsable ? (
                  <ResponsableCombobox
                    valor={filtros.responsableId}
                    onChange={(v) => update("responsableId", v)}
                    responsables={responsables}
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
            onClick={() => onChange(FILTROS_LEADS_VACIOS)}
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
  disabled?: boolean;
}

function CampoSelect({ etiqueta, valor, onChange, opciones, disabled }: CampoSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      <Select value={valor} onValueChange={onChange} disabled={disabled}>
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

interface ResponsableComboboxProps {
  valor: string;
  onChange: (valor: string) => void;
  responsables: { id: string; nombre: string }[];
}

/** Combobox buscable del filtro de Responsable, máximo 5 coincidencias mostradas (docs/07 F3). */
function ResponsableCombobox({ valor, onChange, responsables }: ResponsableComboboxProps) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const seleccionado = responsables.find((r) => r.id === valor);

  const coincidencias = useMemo(() => {
    const termino = busqueda.toLocaleLowerCase();
    return responsables
      .filter((r) => r.nombre.toLocaleLowerCase().includes(termino))
      .slice(0, MAX_RESULTADOS_RESPONSABLE);
  }, [responsables, busqueda]);

  function selectResponsable(id: string) {
    onChange(id);
    setAbierto(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">Responsable</Label>
      <Popover
        open={abierto}
        onOpenChange={(open) => {
          setAbierto(open);
          if (!open) setBusqueda("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={abierto}
            aria-label="Responsable"
            className="justify-start font-normal"
          >
            {valor !== FILTRO_TODOS ? (seleccionado?.nombre ?? valor) : "Todos"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {/* shouldFilter=false: ya filtramos y limitamos `coincidencias` a mano,
              no hace falta que cmdk vuelva a filtrar por su cuenta. */}
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar asesor…"
              value={busqueda}
              onValueChange={setBusqueda}
            />
            <CommandList>
              {/* cmdk decide si renderizar `Command.Empty` según su propio conteo
                  interno de ítems registrados, no según si lo montamos o no --
                  con "Todos los responsables" siempre presente, ese conteo nunca
                  da cero y el mensaje quedaría mudo aunque `coincidencias` esté
                  vacío. Se reemplaza por texto plano con el mismo estilo visual. */}
              {coincidencias.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin coincidencias.</p>
              ) : null}
              <CommandGroup>
                <CommandItem value={FILTRO_TODOS} onSelect={() => selectResponsable(FILTRO_TODOS)}>
                  Todos los responsables
                </CommandItem>
                {coincidencias.map((r) => (
                  <CommandItem key={r.id} value={r.id} onSelect={() => selectResponsable(r.id)}>
                    {r.nombre}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
