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
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <Link
                to={`/leads/${row.original.id}`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {row.original.cliente.nombre}
              </Link>
              {row.original.origen === "REINGRESO" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
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
              <span className="text-xs text-muted-foreground">
                {row.original.cliente.correoPrincipal}
              </span>
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
      cell: ({ row }) => getResponsable(row.original)?.nombre ?? "Sin asignar",
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
    <Table>
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
          >
            {permitirSeleccion ? (
              <TableCell>
                <Checkbox
                  checked={seleccionados.has(row.original.id)}
                  onCheckedChange={() => onToggleSeleccion(row.original.id)}
                  aria-label={`Seleccionar a ${row.original.cliente.nombre}`}
                />
              </TableCell>
            ) : null}
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
