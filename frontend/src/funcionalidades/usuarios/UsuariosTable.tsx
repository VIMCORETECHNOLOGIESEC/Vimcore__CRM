import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdminUsuario } from "@/tipos/usuario";
import { ROL_ETIQUETAS } from "./catalogos";
import { EstadoUsuarioBadge } from "./EstadoUsuarioBadge";
import { useCargaActivaDeUsuario } from "./useUsuarios";

interface UsuariosTableProps {
  usuarios: AdminUsuario[];
  onEditar: (usuario: AdminUsuario) => void;
  onRestablecerPassword: (usuario: AdminUsuario) => void;
  onDarDeBaja: (usuario: AdminUsuario) => void;
}

const columnHelper = createColumnHelper<AdminUsuario>();

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
}: UsuariosTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor((u) => u.nombre, {
        id: "nombre",
        header: "Nombre",
      }),
      columnHelper.accessor((u) => u.correo, {
        id: "correo",
        header: "Correo",
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
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onEditar(usuario)}>
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRestablecerPassword(usuario)}
              >
                Restablecer contraseña
              </Button>
              {usuario.activo ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDarDeBaja(usuario)}
                >
                  Dar de baja
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button variant="destructive" size="sm" disabled>
                        Dar de baja
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Este usuario ya está inactivo</TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      }),
    ],
    [onEditar, onRestablecerPassword, onDarDeBaja],
  );

  const table = useReactTable({ data: usuarios, columns, getCoreRowModel: getCoreRowModel() });

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
