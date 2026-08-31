import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useEmpresaHolding,
  useEmpresasHolding,
} from "@/funcionalidades/empresa-apariencia/useEmpresaAparienciaHolding";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/**
 * Página "razonable" mientras no hay término de búsqueda -- primeras N
 * empresas por orden alfabético (mismo default que el backend, ver
 * `GestorEmpresasPage.tsx::EMPRESAS_POR_PAGINA`), nunca todas de una.
 *
 * Reemplaza el `pageSize: 500` fijo de la versión anterior: el backend
 * (`empresa-apariencia.schema.ts::listEmpresasQuerySchema`) topea `pageSize`
 * en 100, así que 500 disparaba un 400 antes de tocar la base -- y aunque se
 * lo hubiera clampeado a 100, esta instancia tiene ~478 empresas reales, con
 * lo cual "una sola página trae todo" nunca fue cierto.
 */
const EMPRESAS_PAGE_SIZE_SELECTOR = 25;

/** Debounce del buscador -- mismo criterio que `GestorEmpresasPage.tsx` (478 empresas reales, evita un `GET /empresas` por cada tecla). */
const BUSQUEDA_DEBOUNCE_MS = 300;

/** Sentinela de "sin acotar a una empresa" -- nunca se manda al backend, solo gobierna el combobox. */
export const VALOR_TODO_EL_HOLDING = "__TODO_EL_HOLDING__";

/**
 * Selector de empresa del dashboard (docs/23 item 14, "Dashboard con filtro
 * por empresa (holding)"). Exclusivo de `ADMINISTRADOR` + sesión
 * `holding` -- `DashboardPage.tsx` decide ese gate, este componente no lo
 * repite.
 *
 * Reusa exactamente el mecanismo ya en producción para "vista de empresa"
 * (`useVistaEmpresa`, `?empresaId=` en la URL -- mismo que
 * `EmpresaDetallePage.tsx`/`GestorEmpresasPage.tsx`/`ReportesPage.tsx`).
 *
 * A diferencia del combobox genérico `ResponsableCombobox` (100%
 * client-side, pensado para listas de cientos como mucho -- asesores/
 * vendedores de leads), este busca server-side con debounce
 * (`GET /empresas?search=`, ya en producción vía `GestorEmpresasPage.tsx`):
 * con ~478 empresas reales no hay forma correcta de traerlas todas a memoria
 * para filtrar en el cliente. Es un combobox dedicado, no una extensión de
 * `ResponsableCombobox`, para no arriesgar su comportamiento síncrono en sus
 * otros consumidores (selectores de asesor/vendedor de leads).
 *
 * El nombre de la empresa seleccionada se resuelve con `useEmpresaHolding`
 * (`GET /empresas/:id`), no buscando en la página de resultados actual: si
 * hay una búsqueda activa, o si la empresa seleccionada no cae en la primera
 * página alfabética, igual se muestra su nombre real en el botón.
 */
export function SelectorEmpresaDashboard() {
  const { empresaVistaId, entrarAEmpresa, salirDeEmpresa } = useVistaEmpresa();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebouncedValue(busqueda, BUSQUEDA_DEBOUNCE_MS);

  const params = useMemo(() => {
    const termino = busquedaDebounced.trim();
    return {
      page: 1,
      pageSize: EMPRESAS_PAGE_SIZE_SELECTOR,
      ...(termino ? { search: termino } : {}),
    };
  }, [busquedaDebounced]);

  const { data, isLoading } = useEmpresasHolding(params);
  const { data: empresaSeleccionada } = useEmpresaHolding(empresaVistaId ?? undefined);

  const empresas = useMemo(
    () => (data?.items ?? []).map((empresa) => ({ id: empresa.id, nombre: empresa.nombre })),
    [data],
  );

  function seleccionar(valor: string) {
    if (valor === VALOR_TODO_EL_HOLDING) {
      salirDeEmpresa();
    } else {
      entrarAEmpresa(valor);
    }
    setAbierto(false);
  }

  const textoBoton = !empresaVistaId ? "Todo el holding" : (empresaSeleccionada?.nombre ?? "Cargando…");

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">Empresa</Label>
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
            aria-label="Empresa"
            className="justify-start font-normal"
          >
            {textoBoton}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {/* shouldFilter=false: el filtro es server-side (`search`), no hace
              falta que cmdk vuelva a filtrar por su cuenta los resultados ya
              acotados por el backend. */}
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar empresa…" value={busqueda} onValueChange={setBusqueda} />
            <CommandList>
              {/* Igual que `ResponsableCombobox`: con la opción "Todo el
                  holding" siempre presente, el conteo interno de cmdk nunca
                  da cero, así que `Command.Empty` quedaría mudo -- se
                  reemplaza por texto plano con el mismo estilo visual. */}
              {isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Buscando…</p>
              ) : empresas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin coincidencias.</p>
              ) : null}
              <CommandGroup>
                <CommandItem value={VALOR_TODO_EL_HOLDING} onSelect={() => seleccionar(VALOR_TODO_EL_HOLDING)}>
                  Todo el holding
                </CommandItem>
                {empresas.map((empresa) => (
                  <CommandItem key={empresa.id} value={empresa.id} onSelect={() => seleccionar(empresa.id)}>
                    {empresa.nombre}
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
