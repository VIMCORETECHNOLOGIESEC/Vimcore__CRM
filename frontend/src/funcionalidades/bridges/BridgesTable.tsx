import { AlertTriangle } from "lucide-react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Bridge } from "@/tipos/bridge";
import { evaluarAvisoBridge, formatFecha, tieneAvisoDestacado } from "./bridges.utils";
import { RED_SOCIAL_ETIQUETAS } from "./catalogos";
import { EstadoBridgeBadge } from "./EstadoBridgeBadge";

interface BridgesTableProps {
  bridges: Bridge[];
}

const columnHelper = createColumnHelper<Bridge>();

/**
 * Listado de bridges (F8, "Listado con estado, último lead recibido y
 * expiración de token"). El indicador de aviso combina ícono **y** texto
 * (docs/07, criterio transversal de accesibilidad -- nunca solo un ícono de
 * color) y enlaza al detalle, donde el aviso completo se repite destacado.
 */
export function BridgesTable({ bridges }: BridgesTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor((b) => b.redSocial, {
        id: "redSocial",
        header: "Red social",
        cell: ({ getValue }) => RED_SOCIAL_ETIQUETAS[getValue()],
      }),
      columnHelper.accessor((b) => b.nombre, {
        id: "nombre",
        header: "Nombre",
        cell: ({ row }) => (
          <Link to={`/bridges/${row.original.id}`} className="font-medium text-primary hover:underline">
            {row.original.nombre}
          </Link>
        ),
      }),
      columnHelper.accessor((b) => b.estado, {
        id: "estado",
        header: "Estado",
        cell: ({ getValue }) => <EstadoBridgeBadge estado={getValue()} />,
      }),
      columnHelper.accessor((b) => b.ultimoLeadEn, {
        id: "ultimoLeadEn",
        header: "Último lead recibido",
        cell: ({ getValue }) => {
          const valor = getValue();
          return valor ? formatFecha(valor) : <span className="text-muted-foreground">Nunca</span>;
        },
      }),
      columnHelper.accessor((b) => b.tokenExpiraEn, {
        id: "tokenExpiraEn",
        header: "Expiración de token",
        cell: ({ getValue }) => {
          const valor = getValue();
          return valor ? formatFecha(valor) : <span className="text-muted-foreground">No expira</span>;
        },
      }),
      columnHelper.display({
        id: "aviso",
        header: "Aviso",
        cell: ({ row }) => {
          const aviso = evaluarAvisoBridge(row.original);
          if (!tieneAvisoDestacado(aviso)) {
            return <span className="text-muted-foreground">—</span>;
          }
          const etiqueta =
            aviso.tokenExpirado && aviso.sinActividad
              ? "Token expirado y sin actividad"
              : aviso.tokenExpirado
                ? "Token expirado"
                : "Sin actividad";
          return (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {etiqueta}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "acciones",
        header: "Acciones",
        cell: ({ row }) => (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/bridges/${row.original.id}`}>Ver detalle</Link>
          </Button>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({ data: bridges, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <Table>
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
          <TableRow key={row.id}>
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
