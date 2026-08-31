import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/componentes/states/EmptyState";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { ProductosAdminDialog } from "./ProductosAdminDialog";
import { useCrearOportunidad, useProductos } from "./useOportunidades";

/** Sentinela para "sin producto" en el `<Select>` (Radix Select no admite `value=""`). */
const SIN_PRODUCTO = "SIN_PRODUCTO";

interface NuevaOportunidadButtonProps {
  leadId: string;
}

/**
 * Alta de una Oportunidad desde un Lead (Bloque D, `POST /oportunidades`).
 * El producto es opcional -- el servidor acepta `productoId` ausente y deja
 * la oportunidad `SIN_ASIGNAR` de todas formas (201 igual, riesgo #3 del
 * plan). Al crear con éxito navega al detalle recién creado y toastea; un
 * rechazo (409 `oportunidad_duplicada`/`producto_invalido`, 404
 * `lead_no_encontrado`) se muestra inline y el diálogo permanece abierto --
 * no hay `onSuccess` que navegue, así que el error nunca cierra nada por sí
 * solo (el toast global de `queryClient` también dispara, señal secundaria).
 *
 * Sin productos en el catálogo (tarea C1): Administrador se redirige al
 * `ProductosAdminDialog` (mismo componente controlado que
 * `OportunidadesPage.tsx`, embebido acá con su propio estado `open`) en vez
 * de ver el selector de producto vacío. Roles no Administrador conservan el
 * selector con "Sin producto" como única opción -- el producto es opcional,
 * así que igual pueden crear la oportunidad.
 */
export function NuevaOportunidadButton({ leadId }: NuevaOportunidadButtonProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const esAdmin = user?.rol === "ADMINISTRADOR";
  const [open, setOpen] = useState(false);
  const [productoId, setProductoId] = useState(SIN_PRODUCTO);
  const [dialogProductosAbierto, setDialogProductosAbierto] = useState(false);
  const { data: productos = [], isLoading: cargandoProductos } = useProductos({});
  const crearOportunidad = useCrearOportunidad();
  const sinProductos = !cargandoProductos && productos.length === 0;

  function enviar() {
    crearOportunidad.mutate(
      { leadId, productoId: productoId === SIN_PRODUCTO ? undefined : productoId },
      {
        onSuccess: (nuevaOportunidad) => {
          setOpen(false);
          setProductoId(SIN_PRODUCTO);
          toast.success("Oportunidad creada");
          navigate(`/oportunidades/${nuevaOportunidad.id}`);
        },
      },
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Nueva oportunidad</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva oportunidad</DialogTitle>
            <DialogDescription>
              Iniciá una negociación a partir de este lead. Podés elegir el producto ahora o más
              adelante.
            </DialogDescription>
          </DialogHeader>

          {sinProductos && esAdmin ? (
            <EmptyState
              title="Todavía no hay productos en el catálogo"
              description="Creá al menos un producto antes de vincularlo a una oportunidad."
              action={
                <Button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setDialogProductosAbierto(true);
                  }}
                >
                  Ir a gestionar productos
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nueva-oportunidad-producto">Producto</Label>
                  <Select
                    value={productoId}
                    onValueChange={setProductoId}
                    disabled={crearOportunidad.isPending}
                  >
                    <SelectTrigger id="nueva-oportunidad-producto" aria-label="Producto">
                      <SelectValue placeholder="Elegir producto…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_PRODUCTO}>Sin producto</SelectItem>
                      {productos.map((producto) => (
                        <SelectItem key={producto.id} value={producto.id}>
                          {producto.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {crearOportunidad.isError ? (
                  <p className="text-sm text-destructive">{getErrorMessage(crearOportunidad.error)}</p>
                ) : null}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={crearOportunidad.isPending}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={enviar} disabled={crearOportunidad.isPending}>
                  {crearOportunidad.isPending ? "Creando…" : "Crear oportunidad"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {dialogProductosAbierto ? (
        <ProductosAdminDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogProductosAbierto(false);
          }}
        />
      ) : null}
    </>
  );
}
