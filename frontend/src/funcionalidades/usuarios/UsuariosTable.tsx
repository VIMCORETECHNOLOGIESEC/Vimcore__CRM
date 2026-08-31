import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AdminUsuario } from "@/tipos/usuario";
import { ROL_ETIQUETAS } from "./catalogos";
import { EstadoUsuarioBadge } from "./EstadoUsuarioBadge";
import { useCargaActivaDeUsuario } from "./useUsuarios";

interface UsuariosTableProps {
  usuarios: AdminUsuario[];
  onEditar: (usuario: AdminUsuario) => void;
  onRestablecerPassword: (usuario: AdminUsuario) => void;
  onDarDeBaja: (usuario: AdminUsuario) => void;
  onReactivar: (usuarioId: string) => void;
  /** `id` del usuario que se está reactivando ahora mismo, o `null` -- acota el `disabled` a SU fila, no a toda la tabla (la mutación es una sola, compartida por todas las filas). */
  reactivandoId: string | null;
  /**
   * Atenúa (opacidad) la fila de un usuario inactivo -- solo tiene sentido
   * cuando el filtro de estado no está acotado a "Activos" (ver
   * `UsuariosPage.tsx`), momento en el que activos e inactivos se muestran
   * mezclados en la misma tabla.
   */
  atenuarInactivos: boolean;
}

const columnHelper = createColumnHelper<AdminUsuario>();

/**
 * Anchos fijos por columna, en px (mismo criterio que
 * `leads/LeadsTable.tsx`): Rol, Estado, Carga activa y Acciones tienen
 * contenido acotado (catálogo fijo o botones), así que se les da un ancho
 * chico y determinístico; Nombre y Correo son de longitud libre y se
 * reparten el resto -- por eso son las únicas dos con `truncate` + `Tooltip`.
 *
 * Fuente de verdad ÚNICA vía `<colgroup>` (ver el `<Table>` de abajo), no
 * clases `w-*` por celda -- declarar el ancho en cada celda deja a
 * `table-layout: fixed` con una fuente de verdad ambigua y produce
 * corrimiento de columnas (bug real corregido en `leads/LeadsTable.tsx`).
 */
const COLUMN_WIDTHS_PX: Record<string, number> = {
  nombre: 224,
  correo: 256,
  rol: 128,
  estado: 112,
  cargaActiva: 144,
  acciones: 72,
};

/** Celda de texto libre truncada con elipsis + tooltip con el valor completo. */
function CeldaTruncada({ valor }: { valor: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block truncate">{valor}</span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={6}>
        {valor}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Celda de "carga activa de leads" (F7): backend real, una consulta por
 * fila (`useCargaActivaDeUsuario`) -- ver la nota INTEGRACION-BACKEND-GAP en
 * `usuarios.api.ts::getCargaActivaDeUsuario` sobre el límite de 100.
 * Extraída como componente propio (no una función inline en `cell`) para
 * que el hook tenga una identidad de React estable por fila.
 */
function CeldaCargaActiva({ usuarioId }: { usuarioId: string }) {
  const { data: cargaActiva, isLoading } = useCargaActivaDeUsuario(usuarioId);
  if (isLoading) return <span className="text-muted-foreground">…</span>;
  return <span className="tabular-nums">{cargaActiva ?? 0}</span>;
}

/**
 * Tabla del listado de usuarios (F7, "Listado con rol, estado y carga
 * activa de leads"). La columna de carga activa es backend real -- ver
 * `usuarios.api.ts::getCargaActivaDeUsuario`.
 */
export function UsuariosTable({
  usuarios,
  onEditar,
  onRestablecerPassword,
  onDarDeBaja,
  onReactivar,
  reactivandoId,
  atenuarInactivos,
}: UsuariosTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor((u) => u.nombre, {
        id: "nombre",
        header: "Nombre",
        cell: ({ getValue }) => <CeldaTruncada valor={getValue()} />,
      }),
      columnHelper.accessor((u) => u.correo, {
        id: "correo",
        header: "Correo",
        cell: ({ getValue }) => <CeldaTruncada valor={getValue()} />,
      }),
      columnHelper.accessor((u) => u.rol, {
        id: "rol",
        header: "Rol",
        cell: ({ getValue }) => ROL_ETIQUETAS[getValue()],
      }),
      columnHelper.accessor((u) => u.activo, {
        id: "estado",
        header: "Estado",
        cell: ({ getValue }) => <EstadoUsuarioBadge activo={getValue()} />,
      }),
      columnHelper.display({
        id: "cargaActiva",
        header: "Carga activa de leads",
        cell: ({ row }) => {
          const usuario = row.original;
          if (usuario.rol !== "ASESOR" && usuario.rol !== "VENDEDOR") {
            return <span className="text-muted-foreground">No aplica</span>;
          }
          return <CeldaCargaActiva usuarioId={usuario.id} />;
        },
      }),
      columnHelper.display({
        id: "acciones",
        header: "Acciones",
        cell: ({ row }) => {
          const usuario = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={`Acciones de ${usuario.nombre}`}>
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEditar(usuario)}>Editar perfil</DropdownMenuItem>
                {usuario.activo ? (
                  <>
                    <DropdownMenuItem onClick={() => onRestablecerPassword(usuario)}>
                      Restablecer contraseña
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDarDeBaja(usuario)}
                      className="text-destructive focus:text-destructive"
                    >
                      Dar de baja
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onReactivar(usuario.id)}
                      disabled={reactivandoId === usuario.id}
                      className="text-success focus:text-success"
                    >
                      Reactivar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }),
    ],
    [onEditar, onRestablecerPassword, onDarDeBaja, onReactivar, reactivandoId],
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

  const table = useReactTable({ data: usuarios, columns, getCoreRowModel: getCoreRowModel() });

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
        {table.getRowModel().rows.map((row) => {
          const usuario = row.original;
          return (
            <TableRow
              key={row.id}
              data-state={atenuarInactivos && !usuario.activo ? "selected" : undefined}
              className={cn(
                "leads-table-row relative h-12",
                atenuarInactivos && !usuario.activo && "opacity-60",
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
