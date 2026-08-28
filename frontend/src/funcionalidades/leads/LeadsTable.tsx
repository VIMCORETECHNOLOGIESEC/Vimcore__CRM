import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Lead } from "@/tipos/lead";
import { ETAPA_ETIQUETAS, RED_SOCIAL_ETIQUETAS } from "./catalogos";
import { getResponsable } from "./leads.utils";
import { SemaforoBadge } from "./SemaforoBadge";
import { SlaCountdownCell } from "./SlaCountdownCell";

function formatFechaIngreso(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

const columnHelper = createColumnHelper<Lead>();

/**
 * Anchos fijos por columna, en px -- mismo criterio que
 * `usuarios/UsuariosTable.tsx`: Cliente y Campaña son texto libre sin tope y
 * se reparten el resto con `truncate` + `Tooltip`; el resto tiene contenido
 * acotado (catálogo, badge o formato fijo), así que alcanza un ancho chico y
 * determinístico.
 *
 * Fuente de verdad ÚNICA vía `<colgroup>` (ver el `<Table>` de abajo), NO
 * clases `w-*` sueltas por `<th>`/`<td>` (bug real encontrado y corregido
 * 2026-08-28, ver el comentario junto al `<colgroup>`): declarar el ancho
 * en la celda de cabecera y dejar la celda de cuerpo sin ancho explícito
 * (como estaba antes acá) deja a `table-layout: fixed` con una fuente de
 * verdad AMBIGUA por columna -- en Chromium (confirmado con
 * `getBoundingClientRect`/`getComputedStyle` en vivo, no una suposición)
 * eso produce un corrimiento de una columna completa: cada celda de cuerpo
 * termina con el ancho declarado de la columna ANTERIOR, y la última
 * columna ("Fecha de ingreso") queda con una franja de ~8px, su contenido
 * literalmente cortado fuera del borde de la tabla.
 */
const COLUMN_WIDTHS_PX: Record<string, number> = {
  // Anchos fijos acotados, no porcentuales (F3, feedback QA: la tabla no debe
  // extenderse tanto que las columnas de ESTADO -- etapa/semáforo/SLA --
  // queden fuera de la vista inicial sin scroll). truncate + Tooltip ya
  // cubren el desborde de texto largo en ambas.
  seleccion: 40, // w-10 -- checkbox, ahora una columna TanStack real (ver useMemo de `columns`)
  cliente: 192, // w-48
  telefono: 128, // w-32
  redSocial: 112, // w-28
  campania: 144, // w-36
  etapa: 112, // w-28
  semaforo: 128, // w-32
  responsable: 128, // w-32
  sla: 144, // w-36
  ingreso: 144, // w-36
};

interface LeadsTableProps {
  leads: Lead[];
  mostrarColumnaResponsable: boolean;
  permitirSeleccion: boolean;
  seleccionados: ReadonlySet<string>;
  onToggleSeleccion: (leadId: string) => void;
  onToggleSeleccionTodos: (marcar: boolean) => void;
}

/**
 * Tabla densa del listado de leads (docs/07 F3). Usa TanStack Table para la
 * definición de columnas (docs/09 §4: "columnas dinámicas por rol, orden,
 * paginación server-side") -- el orden/paginación real viven en
 * `LeadsPage.tsx`/`useLeads.ts`, acá solo se arma el modelo de columnas.
 */
export function LeadsTable({
  leads,
  mostrarColumnaResponsable,
  permitirSeleccion,
  seleccionados,
  onToggleSeleccion,
  onToggleSeleccionTodos,
}: LeadsTableProps) {
  const todosSeleccionados = leads.length > 0 && leads.every((l) => seleccionados.has(l.id));

  const columns = useMemo(() => {
    /*
     * Columna de selección: ahora una columna TanStack real (`columnHelper.display`),
     * NO un `<th>`/`<td>` manual insertado por fuera del modelo (como estaba antes,
     * 2026-08-28) -- ese patrón mixto (9 columnas vía TanStack + 1 columna a mano,
     * fuera de `headerGroup.headers`/`row.getVisibleCells()`) es la causa real de un
     * bug de corrimiento de columnas encontrado con `getBoundingClientRect()` en
     * navegador real: cada celda de cuerpo terminaba con el ancho de la columna
     * ANTERIOR y la última columna quedaba con un resto de pocos px, contenido
     * literalmente cortado. Ni declarar el ancho en cada celda NI un `<colgroup>`
     * explícito (ambos probados, ninguno alcanzó) resolvieron el corrimiento
     * mientras la columna de checkbox siguiera fuera del modelo de columnas de
     * TanStack -- la única fila REALMENTE correcta fue unificar TODO en una sola
     * fuente: una columna de TanStack más, recorrida por el mismo `.map()` que las
     * demás, sin ninguna celda especial insertada a mano antes del loop.
     */
    const seleccion = columnHelper.display({
      id: "seleccion",
      header: () => (
        <Checkbox
          checked={todosSeleccionados}
          onCheckedChange={(marcar) => onToggleSeleccionTodos(marcar === true)}
          aria-label="Seleccionar todos los leads de esta página"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={seleccionados.has(row.original.id)}
          onCheckedChange={() => onToggleSeleccion(row.original.id)}
          aria-label={`Seleccionar a ${row.original.cliente.nombre}`}
        />
      ),
    });

    const base = [
      columnHelper.accessor((lead) => lead.cliente.nombre, {
        id: "cliente",
        header: "Cliente",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Fila clickeable completa (F3, accesos en pantallas angostas donde
                      esta es la única columna que sobrevive el scroll horizontal):
                      único <a> semántico de la fila (un solo tab-stop, Cmd/Ctrl/click
                      medio abren en pestaña nueva, igual que antes), con su hit-area
                      estirada a todo el <tr> vía `after:absolute after:inset-0` -- el
                      pseudo-elemento se posiciona contra el ancestro posicionado más
                      cercano (el `<tr>` de abajo tiene `relative`), no contra su <td>.
                      El checkbox de selección se eleva con `relative z-10` para no
                      quedar debajo de este overlay invisible. */}
                  <Link
                    to={`/leads/${row.original.id}`}
                    className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline after:absolute after:inset-0 after:content-[''] after:rounded-sm focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-1"
                  >
                    {row.original.cliente.nombre}
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{row.original.cliente.nombre}</TooltipContent>
              </Tooltip>
              {row.original.origen === "REINGRESO" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                      <RotateCcw className="size-2.5" aria-hidden="true" />
                      Reingreso
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Cliente conocido que volvió a ingresar por el embudo (nueva oportunidad,
                    ventana de 90 días)
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            {row.original.cliente.correoPrincipal ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.original.cliente.correoPrincipal}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{row.original.cliente.correoPrincipal}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor((lead) => lead.cliente.telefonoOriginal, {
        id: "telefono",
        header: "Teléfono",
        cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
      }),
      columnHelper.accessor((lead) => lead.redSocial, {
        id: "redSocial",
        header: "Red social",
        cell: ({ getValue }) => RED_SOCIAL_ETIQUETAS[getValue()],
      }),
      columnHelper.accessor((lead) => lead.campania?.nombre ?? "—", {
        id: "campania",
        header: "Campaña",
        cell: ({ getValue }) => {
          const nombre = getValue();
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate">{nombre}</span>
              </TooltipTrigger>
              <TooltipContent>{nombre}</TooltipContent>
            </Tooltip>
          );
        },
      }),
      columnHelper.accessor((lead) => lead.etapa, {
        id: "etapa",
        header: "Etapa",
        cell: ({ getValue }) => (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {ETAPA_ETIQUETAS[getValue()]}
          </span>
        ),
      }),
      columnHelper.accessor((lead) => lead.semaforo, {
        id: "semaforo",
        header: "Semáforo",
        cell: ({ getValue }) => <SemaforoBadge semaforo={getValue()} />,
      }),
    ];

    const responsable = columnHelper.display({
      id: "responsable",
      header: "Responsable",
      cell: ({ row }) => {
        const nombre = getResponsable(row.original)?.nombre ?? "Sin asignar";
        return <span className="block truncate">{nombre}</span>;
      },
    });

    const sla = columnHelper.display({
      id: "sla",
      header: "Estado de SLA",
      cell: ({ row }) => (
        <SlaCountdownCell
          slaInicioEn={row.original.slaInicioEn}
          cerradoEn={row.original.cerradoEn}
        />
      ),
    });

    const ingreso = columnHelper.accessor((lead) => lead.ingresadoEn, {
      id: "ingreso",
      header: "Fecha de ingreso",
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap text-xs">{formatFechaIngreso(getValue())}</span>
      ),
    });

    const datos = mostrarColumnaResponsable
      ? [...base, responsable, sla, ingreso]
      : [...base, sla, ingreso];

    return permitirSeleccion ? [seleccion, ...datos] : datos;
    // `seleccionados`/`onToggleSeleccion`/`onToggleSeleccionTodos`/`todosSeleccionados`
    // en las deps a propósito -- son closures capturadas dentro de `seleccion.cell`/
    // `.header` arriba; sin esto, un toggle de selección seguiría viendo el estado
    // "seleccionados" de la última vez que `columns` se recalculó (closure obsoleta).
  }, [
    mostrarColumnaResponsable,
    permitirSeleccion,
    seleccionados,
    onToggleSeleccion,
    onToggleSeleccionTodos,
    todosSeleccionados,
  ]);

  /**
   * Anchos del `<colgroup>`, en el MISMO orden que `columns` de arriba --
   * derivado de ese mismo array (no una lista separada mantenida a mano)
   * para que ambos queden siempre sincronizados por construcción, sin
   * posibilidad de desalinearse entre sí.
   */
  const colWidthsPx = useMemo(
    () => columns.map((columna) => COLUMN_WIDTHS_PX[columna.id as string]),
    [columns],
  );

  const table = useReactTable({ data: leads, columns, getCoreRowModel: getCoreRowModel() });

  /**
   * Ancho total = suma de `colWidthsPx` (checkbox incluido, ahora una
   * columna TanStack más).
   *
   * `min-width`, NO `width` exacto (2026-08-28, tercera vuelta sobre este
   * mismo bug -- ver el historial completo abajo): con `width` exacto
   * (igual a esta suma), en viewports donde la card queda MÁS ANCHA que la
   * tabla (sin necesidad de scroll horizontal), la ÚLTIMA columna
   * ("Fecha de ingreso") colapsa a 0px -- su contenido queda invisible,
   * aunque el `<thead>` de la MISMA tabla sí respeta el `<colgroup>`
   * correctamente (confirmado con capturas reales en el navegador, no
   * `getBoundingClientRect` aislado -- esa API mintió varias veces durante
   * esta investigación y no es confiable para medir celdas de esta tabla en
   * este entorno). Con `min-width` en cambio, la tabla crece para llenar el
   * contenedor y ninguna columna queda invisible -- el costo es que la
   * columna que absorbe el sobrante (normalmente la última) queda más
   * ancha que su `colgroup` declarado en viewports muy anchos. Peor visual,
   * pero NUNCA pérdida de datos.
   *
   * Se probaron y descartaron, todos con el mismo resultado o peor:
   * `width` exacto solo o con buffer fijo (mueve el colapso a otra
   * columna, no lo elimina), ancho redundante por celda además del
   * `<colgroup>`, `!important` en la celda de checkbox, `table-layout:
   * auto`, quitar `position: relative` de las filas, forzar reflow del
   * `<tbody>` (`display:none`/`display:''`). Ninguno resolvió el bug de
   * raíz -- parece un defecto real del motor de layout de esta build de
   * Chromium (`table-layout: fixed` + `<colgroup>` + `<tbody>` renderizado
   * por React/TanStack) que un `min-width` simplemente evita en vez de
   * corregir.
   */
  const anchoTotalPx = colWidthsPx.reduce((suma, w) => suma + w, 0);

  return (
    /*
     * `<colgroup>` -- fuente de los anchos de columna: un `<col>` por
     * columna, en el MISMO orden que `columns`/`colWidthsPx`. `<th>`/`<td>`
     * ya no declaran su propio ancho.
     *
     * TODAS las columnas (incluida "seleccion") se recorren con el MISMO
     * `.map()` de abajo, ninguna insertada a mano por fuera del modelo de
     * TanStack -- ver el comentario junto a la columna `seleccion` en el
     * `useMemo` de arriba. Esto NO elimina el bug de la nota de
     * `anchoTotalPx` de arriba (se pensó que sí en una vuelta anterior,
     * era incorrecto), pero sigue siendo la forma correcta de declarar
     * anchos de columna vs. celdas sueltas por fuera del modelo.
     */
    <Table className="table-fixed" style={{ minWidth: anchoTotalPx }}>
      <colgroup>
        {colWidthsPx.map((ancho, indice) => (
          // eslint-disable-next-line react/no-array-index-key -- el orden de `colWidthsPx` es estable dentro de un mismo render (deriva de `columns`, memoizado junto con él); no hay reordenamiento que justifique otra key.
          <col key={indice} style={{ width: ancho }} />
        ))}
      </colgroup>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            data-state={seleccionados.has(row.original.id) ? "selected" : undefined}
            // `relative`: ancla la fila estirada del <Link> de Cliente (ver comentario
            // ahí). `.leads-table-row` trae el glow de hover (index.css).
            className="leads-table-row relative"
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                // `relative z-10` SOLO en la celda de checkbox -- se eleva por
                // encima del overlay invisible del `<Link>` de Cliente (ver
                // comentario ahí), para no quedar debajo y volverse
                // inclickeable.
                className={cell.column.id === "seleccion" ? "relative z-10" : undefined}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
