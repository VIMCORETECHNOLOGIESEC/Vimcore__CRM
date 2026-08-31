import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Bridge } from "@/tipos/bridge";
import { AvisoBridgeIndicador } from "./AvisoBridgeIndicador";
import { formatFecha, proximaExpiracionTokenBridge } from "./bridges.utils";
import { RED_SOCIAL_ETIQUETAS } from "./catalogos";
import { EstadoBridgeBadge } from "./EstadoBridgeBadge";

interface BridgesTableProps {
  bridges: Bridge[];
  /** Requirement: Hard Delete Only Without Leads / Soft Deactivate and Reactivate. */
  onDarDeBaja: (bridge: Bridge) => void;
  onReactivar: (bridgeId: string) => void;
  reactivando: boolean;
}

const columnHelper = createColumnHelper<Bridge>();

/**
 * Anchos fijos por columna, en px (mismo criterio que
 * `usuarios/UsuariosTable.tsx` y `leads/LeadsTable.tsx`): Red social, Estado,
 * Aviso y Acciones tienen contenido acotado (catálogo fijo, badge o botones),
 * así que se les da un ancho chico y determinístico; Nombre, Último lead y
 * Expiración de token son de formato acotado (texto/etiqueta/fecha).
 *
 * Fuente de verdad ÚNICA vía `<colgroup>` (ver el `<Table>` de abajo), NO
 * clases `w-*` por celda -- declarar el ancho en cada celda deja a
 * `table-layout: fixed` con una fuente de verdad ambigua y produce
 * corrimiento de columnas (bug real corregido en `leads/LeadsTable.tsx`).
 */
const COLUMN_WIDTHS_PX: Record<string, number> = {
  redSocial: 144,
  nombre: 176,
  estado: 128,
  ultimoLeadEn: 160,
  tokenExpiraEn: 160,
  aviso: 72,
  acciones: 72,
};

/**
 * Listado de bridges (F8, "Listado con estado, último lead recibido y
 * expiración de token"). El indicador de aviso por fila
 * (`AvisoBridgeIndicador`) nunca es solo color: ícono delineado **y**
 * `aria-label`/popover con texto completo (docs/07, criterio transversal de
 * accesibilidad) -- y enlaza al detalle, donde el aviso completo se repite
 * destacado (`AvisoBridge.tsx`, sin cambios en este trabajo).
 */
export function BridgesTable({ bridges, onDarDeBaja, onReactivar, reactivando }: BridgesTableProps) {
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
      columnHelper.display({
        id: "tokenExpiraEn",
        header: "Expiración de token",
        // No lee `Bridge.tokenExpiraEn` (constante muerta a nivel bridge,
        // ver `tipos/bridge.ts`) -- la fecha real vive por cuenta
        // publicitaria, y esta columna muestra la más urgente entre todas.
        cell: ({ row }) => {
          const valor = proximaExpiracionTokenBridge(row.original);
          return valor ? formatFecha(valor) : <span className="text-muted-foreground">No expira</span>;
        },
      }),
      columnHelper.display({
        id: "aviso",
        header: "Aviso",
        // Ícono por fila con popover (F8) -- reemplaza el badge de texto
        // apilado que tenía esta columna antes; `AvisoBridgeIndicador`
        // devuelve `null` para un bridge sano, la celda queda vacía.
        cell: ({ row }) => <AvisoBridgeIndicador bridge={row.original} />,
      }),
      columnHelper.display({
        id: "acciones",
        header: "Acciones",
        cell: ({ row }) => {
          const bridge = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={`Acciones de ${bridge.nombre}`}>
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={`/bridges/${bridge.id}`}>Ver detalle</Link>
                </DropdownMenuItem>
                {bridge.estado === "INACTIVO" ? (
                  <DropdownMenuItem
                    onClick={() => onReactivar(bridge.id)}
                    disabled={reactivando}
                    className="text-success focus:text-success"
                  >
                    Reactivar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => onDarDeBaja(bridge)}
                    className="text-destructive focus:text-destructive"
                  >
                    Dar de baja
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }),
    ],
    [onDarDeBaja, onReactivar, reactivando],
  );

  /**
   * Anchos del `<colgroup>`, en el MISMO orden que `columns` de arriba --
   * derivado de ese mismo array (no una lista separada mantenida a mano)
   * para que ambos queden siempre sincronizados por construcción.
   */
  const colWidthsPx = useMemo(
    () => columns.map((columna) => COLUMN_WIDTHS_PX[columna.id as string]),
    [columns],
  );

  const anchoTotalPx = colWidthsPx.reduce((suma, w) => suma + w, 0);

  const table = useReactTable({ data: bridges, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <Table className="table-fixed" wrapperClassName="min-h-0" style={{ minWidth: anchoTotalPx }}>
      <colgroup>
        {colWidthsPx.map((ancho, indice) => (
          // eslint-disable-next-line react/no-array-index-key -- el orden de `colWidthsPx` es estable dentro de un mismo render (deriva de `columns`, memoizado junto con él).
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
          <TableRow key={row.id} className="leads-table-row relative h-12">
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
