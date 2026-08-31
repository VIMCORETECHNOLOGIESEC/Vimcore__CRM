import { zodResolver } from "@hookform/resolvers/zod";
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
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Empresa activa (drill-down de holding). Se reenvía al listar y al crear. */
  empresaVistaId?: string;
  /**
   * `useVistaEmpresa().esVistaSoloLectura` del caller -- un holding-wide en
   * "Ver en vivo" de una empresa puede navegar pero no escribir (no
   * soportado en esta versión de despliegue). Prop en vez de llamar
   * `useVistaEmpresa()` acá adentro a propósito: este componente se testea
   * sin `<MemoryRouter>` (`ProductosAdminDialog.test.tsx`), y ese hook
   * depende de `useSearchParams`.
   */
  esVistaSoloLectura?: boolean;
}

/**
 * Catálogo de productos (Bloque D, D14) -- diálogo controlado (mismo patrón
 * que `CargarLeadManualDialog.tsx`/`GestionarCanalesManualesDialog.tsx`), sin
 * trigger propio: cada caller (`OportunidadesPage.tsx`, con su botón
 * "Gestionar productos"; `NuevaOportunidadButton.tsx`, como redirección
 * cuando no hay productos y el usuario es Administrador -- tarea C1) decide
 * cuándo mostrarlo y controla su propio estado `open`. El backend solo
 * expone listar + crear (`GET /productos`, `POST /productos` con
 * `requireRole(ADMINISTRADOR)`), sin PATCH/DELETE/toggle -- ver "Productos
 * admin surface" en el plan del bloque. El gate de rol sigue viviendo acá
 * (única fuente de verdad, el servidor lo revalida igual) -- cada caller
 * además evita mostrar su propio trigger a un no-Administrador, pero ninguno
 * duplica la regla: solo repite la misma consulta `useAuth()/hasRole` ya
 * usada en el resto de la app (ver `LeadsPage.tsx::puedeGestionarCanales`).
 */
export function ProductosAdminDialog({
  open,
  onOpenChange,
  empresaVistaId,
  esVistaSoloLectura = false,
}: ProductosAdminDialogProps) {
  const { user } = useAuth();
  const esAdmin = user?.rol === "ADMINISTRADOR";

  const { data: productos = [], isLoading } = useProductos({ empresaId: empresaVistaId });
  const crearProducto = useCrearProducto();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearProductoValues>({ resolver: zodResolver(crearProductoSchema) });

  if (!esAdmin || esVistaSoloLectura) return null;

  const enviar = handleSubmit((valores) => {
    crearProducto.mutate(
      { nombre: valores.nombre, empresaId: empresaVistaId },
      { onSuccess: () => reset() },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                onClick={() => onOpenChange(false)}
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
  );
}
