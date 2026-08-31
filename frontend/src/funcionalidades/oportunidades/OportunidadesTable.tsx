import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { Link } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Oportunidad } from "@/tipos/oportunidad";
import { ETAPA_OPORTUNIDAD_ETIQUETAS } from "./catalogos";

const FORMATO_MONTO = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

/** `DD/MM/AAAA HH:mm` en horario local del navegador (docs/07, criterios transversales). */
function formatFecha(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

function nombreResponsable(oportunidad: Oportunidad): string {
  return oportunidad.vendedor?.nombre ?? oportunidad.asesor?.nombre ?? "Sin asignar";
}

/** Anchos fijos por columna, en px -- mismo criterio que `leads/LeadsTable.tsx` (fuente única vía `<colgroup>`). */
const COLUMN_WIDTHS_PX: Record<string, number> = {
  cliente: 208,
  producto: 176,
  etapa: 112,
  responsable: 160,
  monto: 128,
  creada: 144,
};

const columnHelper = createColumnHelper<Oportunidad>();

interface OportunidadesTableProps {
  oportunidades: Oportunidad[];
}

/**
 * Tabla del listado de oportunidades (Bloque D) -- misma estructura que
 * `leads/LeadsTable.tsx`: TanStack Table para el modelo de columnas, orden y
 * paginación server-side viven en `OportunidadesPage.tsx`/`useOportunidades.ts`.
 */
export function OportunidadesTable({ oportunidades }: OportunidadesTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "cliente",
        header: "Cliente",
        cell: ({ row }) => (
          <Link
            to={`/oportunidades/${row.original.id}`}
            className="block min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline"
          >
            {row.original.lead.cliente.nombre || "Sin nombre"}
          </Link>
        ),
      }),
      columnHelper.accessor((o) => o.producto?.nombre ?? "—", {
        id: "producto",
        header: "Producto",
        cell: ({ getValue }) => <span className="block truncate">{getValue()}</span>,
      }),
      columnHelper.accessor((o) => o.etapa, {
        id: "etapa",
        header: "Etapa",
        cell: ({ getValue }) => (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {ETAPA_OPORTUNIDAD_ETIQUETAS[getValue()]}
          </span>
        ),
      }),
      columnHelper.display({
        id: "responsable",
        header: "Responsable",
        cell: ({ row }) => (
          <span className="block truncate">{nombreResponsable(row.original)}</span>
        ),
      }),
      columnHelper.accessor((o) => o.montoVenta, {
        id: "monto",
        header: "Monto",
        cell: ({ getValue }) => {
          const monto = getValue();
          return (
            <span className="tabular-nums">
              {monto == null ? "—" : FORMATO_MONTO.format(monto)}
            </span>
          );
        },
      }),
      columnHelper.accessor((o) => o.creadaEn, {
        id: "creada",
        header: "Creada",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-xs">{formatFecha(getValue())}</span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({ data: oportunidades, columns, getCoreRowModel: getCoreRowModel() });

  const colWidthsPx = columns.map((columna) => COLUMN_WIDTHS_PX[columna.id as string]);
  const anchoTotalPx = colWidthsPx.reduce((suma, w) => suma + w, 0);

  return (
    <Table className="table-fixed" wrapperClassName="min-h-0" style={{ minWidth: anchoTotalPx }}>
      <colgroup>
        {colWidthsPx.map((ancho, indice) => (
          // eslint-disable-next-line react/no-array-index-key -- orden estable, derivado de `columns`.
          <col key={indice} style={{ width: ancho }} />
        ))}
      </colgroup>
      <TableHeader className="sticky top-0 z-20 bg-sidebar">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="h-10 hover:bg-transparent">
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id} className="text-sidebar-foreground/80">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody className="bg-card">
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} className="h-12">
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
