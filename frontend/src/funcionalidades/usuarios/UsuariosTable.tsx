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
  acciones: "w-80",
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
          <TableRow key={row.id}>
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
