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
 * Anchos fijos por columna (`table-fixed`, ver el `<Table>` de abajo) --
 * mismo criterio que `usuarios/UsuariosTable.tsx`: Cliente y Campaña son
 * texto libre sin tope y se reparten el resto con `truncate` + `Tooltip`;
 * el resto tiene contenido acotado (catálogo, badge o formato fijo), así que
 * alcanza un ancho chico y determinístico.
 */
const COLUMN_WIDTHS: Record<string, string> = {
  // Anchos fijos acotados, no porcentuales (F3, feedback QA: la tabla no debe
  // extenderse tanto que las columnas de ESTADO -- etapa/semáforo/SLA --
  // queden fuera de la vista inicial sin scroll). truncate + Tooltip ya
  // cubren el desborde de texto largo en ambas.
  cliente: "w-48",
  telefono: "w-32",
  redSocial: "w-28",
  campania: "w-36",
  etapa: "w-28",
  semaforo: "w-32",
  responsable: "w-32",
  sla: "w-36",
  ingreso: "w-36",
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

    return mostrarColumnaResponsable
      ? [...base, responsable, sla, ingreso]
      : [...base, sla, ingreso];
  }, [mostrarColumnaResponsable]);

  const table = useReactTable({ data: leads, columns, getCoreRowModel: getCoreRowModel() });

  return (
    // `min-w` fijo en la <table> (no en celdas sueltas -- `table-fixed` solo
    // respeta `width` de la primera fila e ignora `min-width` por celda, que
    // es justo lo que causaba el choque de columnas de antes): suma exacta
    // de las columnas, todas con ancho fijo desde el fix de COLUMN_WIDTHS
    // (768px teléfono/red social/etapa/semáforo/SLA/ingreso + 192px Cliente +
    // 144px Campaña + 128px Responsable + 40px checkbox, caso admin
    // completo) -- por debajo de ese piso, gana el scroll horizontal del
    // wrapper (`overflow-auto` en `Table`), nunca la compresión.
    <Table className="table-fixed min-w-[1280px]">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {permitirSeleccion ? (
              <TableHead className="w-10">
                <Checkbox
                  checked={todosSeleccionados}
                  onCheckedChange={(marcar) => onToggleSeleccionTodos(marcar === true)}
                  aria-label="Seleccionar todos los leads de esta página"
                />
              </TableHead>
            ) : null}
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id} className={COLUMN_WIDTHS[header.id]}>
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
            {permitirSeleccion ? (
              <TableCell className="relative z-10">
                <Checkbox
                  checked={seleccionados.has(row.original.id)}
                  onCheckedChange={() => onToggleSeleccion(row.original.id)}
                  aria-label={`Seleccionar a ${row.original.cliente.nombre}`}
                />
              </TableCell>
            ) : null}
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id} className={COLUMN_WIDTHS[cell.column.id]}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
