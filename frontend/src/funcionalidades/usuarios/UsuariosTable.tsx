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
 * Anchos fijos por columna (`table-fixed`, ver el `<Table>` de abajo). Rol,
 * Estado, Carga activa y Acciones tienen contenido acotado (catálogo fijo o
 * botones), así que se les da un ancho chico y determinístico; Nombre y
 * Correo son de longitud libre y se reparten el resto -- por eso son las
 * únicas dos con `truncate` + `Tooltip` (evita que un nombre/correo largo
 * deforme el resto de la tabla, ver informe de esta tarea).
 */
const COLUMN_WIDTHS: Record<string, string> = {
  nombre: "w-[20%]",
  correo: "w-[24%]",
  rol: "w-32",
  estado: "w-28",
  cargaActiva: "w-36",
  acciones: "w-16",
};

/** Celda de texto libre truncada con elipsis + tooltip con el valor completo. */
function CeldaTruncada({ valor }: { valor: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block truncate">{valor}</span>
      </TooltipTrigger>
      <TooltipContent>{valor}</TooltipContent>
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

  const table = useReactTable({ data: usuarios, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <Table className="table-fixed">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
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
            className={cn(atenuarInactivos && !row.original.activo && "opacity-60")}
          >
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
