import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import type { CanalManual } from "./canal-manual.api";
import { EstadoUsuarioBadge } from "../usuarios/EstadoUsuarioBadge";
import {
  useActualizarCanalManual,
  useCanalesManuales,
  useCrearCanalManual,
} from "./useCanalesManuales";

/**
 * Duplica localmente la validación de `nombre` de
 * `backend/src/schemas/canal-manual.schema.ts::crearCanalManualBodySchema`
 * (`z.string().trim().min(1).max(200)`) -- mismo criterio que
 * `NuevoBridgeDialog.tsx::crearBridgeSchema`. El resto de los campos
 * (`activo`, `id`, `empresaId`) los decide el servidor, no hay nada más que
 * replicar acá.
 */
const nuevoCanalSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresa el nombre del canal.")
    .max(200, "El nombre no puede superar los 200 caracteres."),
});

type NuevoCanalValues = z.infer<typeof nuevoCanalSchema>;

interface GestionarCanalesManualesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
}

/**
 * Administración del catálogo de canales manuales (Bloque D, backend real,
 * docs/blocks/d-routing-oportunidad.md, "Gestión del catálogo
 * (`CanalManual`) en manos de Administrador"). Exclusivo Administrador de
 * sesión `company` --
 * el guard de rol/scope vive en `LeadsPage.tsx`, este componente no lo
 * revalida. Alta + rename + activar/desactivar, sin baja física (mismo
 * criterio que usuarios/bridges: desactivar, nunca borrar, para no invalidar
 * leads históricos que ya usaron ese canal).
 */
export function GestionarCanalesManualesDialog({
  open,
  onOpenChange,
  empresaId,
}: GestionarCanalesManualesDialogProps) {
  const { data: canales, isLoading, isError, error, refetch } = useCanalesManuales(empresaId);
  const crear = useCrearCanalManual(empresaId);
  const actualizar = useActualizarCanalManual(empresaId);
  const [canalEnEdicion, setCanalEnEdicion] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NuevoCanalValues>({ resolver: zodResolver(nuevoCanalSchema) });

  const agregar = handleSubmit((valores) => {
    crear.mutate(
      { nombre: valores.nombre },
      { onSuccess: () => reset({ nombre: "" }) },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Canales de ingreso manual</DialogTitle>
          <DialogDescription>
            Catálogo de canales sin Bridge (referido, llamada, feria) disponibles al cargar un lead
            manual.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={agregar} noValidate className="flex flex-col gap-1.5">
          <Label htmlFor="nuevo-canal-nombre">Nuevo canal</Label>
          <div className="flex gap-2">
            <Input
              id="nuevo-canal-nombre"
              placeholder="Ej. Referido"
              disabled={crear.isPending}
              aria-invalid={errors.nombre ? "true" : undefined}
              {...register("nombre")}
            />
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending ? "Agregando…" : "Agregar"}
            </Button>
          </div>
          {errors.nombre ? (
            <p className="text-sm text-destructive">{errors.nombre.message}</p>
          ) : crear.isError ? (
            <p className="text-sm text-destructive">{getErrorMessage(crear.error)}</p>
          ) : null}
        </form>

        {isLoading ? (
          <LoadingState rows={3} rowHeight="h-10" />
        ) : isError ? (
          <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
        ) : !canales || canales.length === 0 ? (
          <EmptyState
            title="Todavía no hay canales configurados"
            description="Agrega el primero con el campo de arriba."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {canales.map((canal) => (
              <FilaCanal
                key={canal.id}
                canal={canal}
                editando={canalEnEdicion === canal.id}
                onEditar={() => setCanalEnEdicion(canal.id)}
                onCancelarEdicion={() => setCanalEnEdicion(null)}
                onRenombrar={(nombre) =>
                  actualizar.mutate(
                    { canalId: canal.id, input: { nombre } },
                    { onSuccess: () => setCanalEnEdicion(null) },
                  )
                }
                onToggleActivo={() =>
                  actualizar.mutate({ canalId: canal.id, input: { activo: !canal.activo } })
                }
                guardando={actualizar.isPending && actualizar.variables?.canalId === canal.id}
                error={
                  actualizar.isError && actualizar.variables?.canalId === canal.id
                    ? getErrorMessage(actualizar.error)
                    : null
                }
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FilaCanalProps {
  canal: CanalManual;
  editando: boolean;
  onEditar: () => void;
  onCancelarEdicion: () => void;
  onRenombrar: (nombre: string) => void;
  onToggleActivo: () => void;
  guardando: boolean;
  /** Mensaje del último intento de rename fallido para este canal (ej. 409 nombre duplicado), `null` sin error pendiente. */
  error: string | null;
}

function FilaCanal({
  canal,
  editando,
  onEditar,
  onCancelarEdicion,
  onRenombrar,
  onToggleActivo,
  guardando,
  error,
}: FilaCanalProps) {
  const [nombreEditado, setNombreEditado] = useState(canal.nombre);

  if (editando) {
    return (
      <li className="flex flex-col gap-1.5 rounded-md border border-border p-2">
        <div className="flex items-center gap-2">
          <Input
            aria-label={`Nuevo nombre para ${canal.nombre}`}
            value={nombreEditado}
            disabled={guardando}
            onChange={(e) => setNombreEditado(e.target.value)}
            className="h-8"
          />
          <Button
            type="button"
            size="sm"
            disabled={guardando || nombreEditado.trim().length === 0}
            onClick={() => onRenombrar(nombreEditado.trim())}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={guardando} onClick={onCancelarEdicion}>
            Cancelar
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{canal.nombre}</span>
        <EstadoUsuarioBadge activo={canal.activo} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onEditar}>
          Editar
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={guardando} onClick={onToggleActivo}>
          {guardando ? "…" : canal.activo ? "Desactivar" : "Activar"}
        </Button>
      </div>
    </li>
  );
}
