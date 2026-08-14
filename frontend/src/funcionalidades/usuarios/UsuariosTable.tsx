import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdminUsuario } from "@/tipos/usuario";
import { ROL_ETIQUETAS } from "./catalogos";
import { EstadoUsuarioBadge } from "./EstadoUsuarioBadge";
import { getCargaActivaDeUsuario } from "./usuarios.api";

interface UsuariosTableProps {
  usuarios: AdminUsuario[];
  onEditar: (usuario: AdminUsuario) => void;
  onRestablecerPassword: (usuario: AdminUsuario) => void;
  onDarDeBaja: (usuario: AdminUsuario) => void;
}

const columnHelper = createColumnHelper<AdminUsuario>();

/**
 * Tabla del listado de usuarios (F7, "Listado con rol, estado y carga
 * activa de leads"). La columna de carga activa es un mock -- ver el
 * comentario de brecha en `usuarios.api.ts::getCargaActivaDeUsuario`.
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
          return <span className="tabular-nums">{getCargaActivaDeUsuario(usuario.id)}</span>;
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
