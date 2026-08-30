import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { useCrearProducto, useProductos } from "./useOportunidades";

// Espejo de crearProductoBodySchema del backend
// (backend/src/schemas/negociacion/producto.schema.ts).
const crearProductoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre.")
    .max(200, "El nombre no puede superar los 200 caracteres."),
});

type CrearProductoValues = z.infer<typeof crearProductoSchema>;

interface ProductosAdminDialogProps {
  /** Empresa activa (drill-down de holding). Se reenvía al listar y al crear. */
  empresaVistaId?: string;
}

/**
 * Catálogo de productos (Bloque D, D14) -- diálogo dentro de la propia página
 * de oportunidades, NO una ruta nueva: el backend solo expone listar + crear
 * (`GET /productos`, `POST /productos` con `requireRole(ADMINISTRADOR)`), sin
 * PATCH/DELETE/toggle -- ver "Productos admin surface" en el plan del bloque.
 * El trigger es visible únicamente para ADMINISTRADOR (mismo rol que exige el
 * servidor en la creación); el servidor lo revalida igual.
 */
export function ProductosAdminDialog({ empresaVistaId }: ProductosAdminDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const esAdmin = user?.rol === "ADMINISTRADOR";

  const { data: productos = [], isLoading } = useProductos({ empresaId: empresaVistaId });
  const crearProducto = useCrearProducto();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearProductoValues>({ resolver: zodResolver(crearProductoSchema) });

  if (!esAdmin) return null;

  const enviar = handleSubmit((valores) => {
    crearProducto.mutate(
      { nombre: valores.nombre, empresaId: empresaVistaId },
      { onSuccess: () => reset() },
    );
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Gestionar productos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catálogo de productos</DialogTitle>
            <DialogDescription>
              Consultá los productos disponibles y agregá uno nuevo para vincularlo a las
              oportunidades.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : productos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay productos cargados.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {productos.map((producto) => (
                  <li key={producto.id} className="text-sm text-foreground">
                    {producto.nombre}
                  </li>
                ))}
              </ul>
            )}

            <form
              onSubmit={enviar}
              noValidate
              className="flex flex-col gap-3 border-t border-border pt-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="producto-nombre">Nombre del producto</Label>
                <Input
                  id="producto-nombre"
                  disabled={crearProducto.isPending}
                  aria-invalid={errors.nombre ? "true" : undefined}
                  {...register("nombre")}
                />
                {errors.nombre ? (
                  <p className="text-sm text-destructive">{errors.nombre.message}</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={crearProducto.isPending}
                >
                  Cerrar
                </Button>
                <Button type="submit" disabled={crearProducto.isPending}>
                  {crearProducto.isPending ? "Creando…" : "Crear producto"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
