import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MAX_RESULTADOS_POR_DEFECTO = 5;

interface ResponsableComboboxOption {
  id: string;
  nombre: string;
}

interface ResponsableComboboxProps {
  valor: string;
  onChange: (valor: string) => void;
  responsables: ResponsableComboboxOption[];
  /** Label visible arriba del control. Si se omite no se renderiza (p. ej. cuando el contexto ya lo deja claro). */
  etiqueta?: string;
  /** Nombre accesible del botón, se muestre o no `etiqueta`. */
  ariaLabel: string;
  /** Texto del botón sin selección. Ignorado si `mostrarOpcionTodos` (esa opción ya cubre el estado "sin filtro"). */
  placeholder?: string;
  /** Placeholder del campo de búsqueda. */
  placeholderBusqueda?: string;
  /**
   * Agrega una opción fija al tope de la lista (p. ej. "Todos los responsables"),
   * con valor `valorOpcionTodos`. La usa el filtro de la tabla de leads; el
   * selector de asignación del detalle de lead no la necesita (docs/07 F3/F4).
   */
  mostrarOpcionTodos?: boolean;
  valorOpcionTodos?: string;
  /** Texto de la opción dentro de la lista (p. ej. "Todos los responsables"). */
  etiquetaOpcionTodos?: string;
  /** Texto mostrado en el botón cuando la opción fija está seleccionada -- puede ser más corto que `etiquetaOpcionTodos`. */
  etiquetaBotonOpcionTodos?: string;
  /** Máximo de coincidencias mostradas. */
  maxResultados?: number;
  className?: string;
}

/**
 * Combobox buscable para elegir un responsable/vendedor entre listas
 * potencialmente largas, mostrando como máximo `maxResultados` coincidencias
 * (docs/07 F3/F4). Reutilizado por el filtro de responsable del listado de
 * leads y por los selectores de traspaso/reasignación del detalle de lead.
 */
export function ResponsableCombobox({
  valor,
  onChange,
  responsables,
  etiqueta,
  ariaLabel,
  placeholder = "Elegir…",
  placeholderBusqueda = "Buscar…",
  mostrarOpcionTodos = false,
  valorOpcionTodos = "TODOS",
  etiquetaOpcionTodos = "Todos los responsables",
  etiquetaBotonOpcionTodos = "Todos",
  maxResultados = MAX_RESULTADOS_POR_DEFECTO,
  className,
}: ResponsableComboboxProps) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const seleccionado = responsables.find((r) => r.id === valor);

  const coincidencias = useMemo(() => {
    const termino = busqueda.toLocaleLowerCase();
    return responsables
      .filter((r) => r.nombre.toLocaleLowerCase().includes(termino))
      .slice(0, maxResultados);
  }, [responsables, busqueda, maxResultados]);

  function seleccionar(id: string) {
    onChange(id);
    setAbierto(false);
  }

  const textoBoton =
    mostrarOpcionTodos && valor === valorOpcionTodos
      ? etiquetaBotonOpcionTodos
      : (seleccionado?.nombre ?? (mostrarOpcionTodos ? valor : placeholder));

  const control = (
    <Popover
      open={abierto}
      onOpenChange={(open: boolean) => {
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
          aria-label={ariaLabel}
          className={cn("justify-start font-normal", className)}
        >
          {textoBoton}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* shouldFilter=false: ya filtramos y limitamos `coincidencias` a mano,
            no hace falta que cmdk vuelva a filtrar por su cuenta. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholderBusqueda} value={busqueda} onValueChange={setBusqueda} />
          <CommandList>
            {/* cmdk decide si renderizar `Command.Empty` según su propio conteo
                interno de ítems registrados, no según si lo montamos o no --
                con la opción "Todos" siempre presente, ese conteo nunca da
                cero y el mensaje quedaría mudo aunque `coincidencias` esté
                vacío. Se reemplaza por texto plano con el mismo estilo visual. */}
            {coincidencias.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin coincidencias.</p>
            ) : null}
            <CommandGroup>
              {mostrarOpcionTodos ? (
                <CommandItem value={valorOpcionTodos} onSelect={() => seleccionar(valorOpcionTodos)}>
                  {etiquetaOpcionTodos}
                </CommandItem>
              ) : null}
              {coincidencias.map((r) => (
                <CommandItem key={r.id} value={r.id} onSelect={() => seleccionar(r.id)}>
                  {r.nombre}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  if (!etiqueta) return control;

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      {control}
    </div>
  );
}
