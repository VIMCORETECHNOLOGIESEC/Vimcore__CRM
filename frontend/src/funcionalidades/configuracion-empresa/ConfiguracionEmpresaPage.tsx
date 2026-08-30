import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, type Control, type FieldErrors } from "react-hook-form";
import { hexColorSchema, logoUrlSchema, nombreMarcaSchema } from "schemas";
import { z } from "zod";
import { getErrorMessage } from "@/api/httpClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import {
  CONFIGURACION_EMPRESA_DEFAULT,
  type ConfiguracionEmpresa,
  type UpdateConfiguracionEmpresaInput,
} from "./configuracion-empresa.api";
import { useConfiguracionEmpresa, useUpdateConfiguracionEmpresa } from "./useConfiguracionEmpresa";

/**
 * `nombreMarcaSchema`/`hexColorSchema`/`logoUrlSchema` (paquete compartido
 * `schemas`, AGENTS.md "Formularios con RHF+Zod, reutilizando los esquemas
 * del backend"): mismas reglas de largo/formato que
 * `backend/src/schemas/configuracion-empresa.schema.ts` -- antes de esto
 * este formulario tenía su propio `.max(120)` para `nombre` (backend: 80) y
 * sin `.max()` para `logoUrl` (backend: 2048), así que un envío podía pasar
 * la validación del cliente y romper igual con un 400 del backend.
 *
 * PASO 6 (tema-empresarial-integracion): `logoUrl` acepta además cadena
 * vacía como valor válido acá (significa "sin isotipo") -- el input HTML
 * siempre maneja `string` (nunca `null`), la conversión "" <-> `null` ocurre
 * al precargar/enviar el formulario (`defaultValues`/`enviar` en
 * `ConfiguracionEmpresaForm`).
 */
/**
 * Mismo patrón que `hexColorSchema` (paquete `schemas`) -- acá aparte porque
 * se usa para un chequeo rápido de vista previa en vivo (abajo), no para
 * validación de Zod del formulario.
 */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const configuracionEmpresaSchema = z.object({
  nombre: nombreMarcaSchema,
  colorPrimario: hexColorSchema,
  colorSecundario: hexColorSchema,
  logoUrl: logoUrlSchema.or(z.literal("")),
});

type ConfiguracionEmpresaValues = z.infer<typeof configuracionEmpresaSchema>;

/**
 * Pantalla de configuración de marca de la empresa (tema empresarial --
 * integración login + splash de bienvenida, ruta protegida solo
 * `ADMINISTRADOR` en `router.tsx`). App single-tenant (AGENTS.md §1): esta
 * es la ÚNICA configuración para todo el despliegue -- no hay selector ni
 * tabla de tenants, y a propósito NO se agrega lógica multi-tenant acá.
 *
 * Sin estado "vacío": a diferencia de un listado, este recurso siempre
 * existe (el backend devuelve los defaults documentados si nunca se
 * configuró nada, ver `CONFIGURACION_EMPRESA_DEFAULT`) -- por eso esta
 * pantalla solo tiene carga/error/formulario, no un cuarto estado vacío.
 *
 * Vista previa en vivo del gradiente diagonal (`linear-gradient(135deg, ...)`)
 * que usa `WelcomeSplashLoader` (`--marca-color-1`/`--marca-color-2`,
 * `temas/variante-empresarial/tema-empresarial.css`) -- se actualiza con
 * cada tecleo, sin esperar a guardar. A propósito NO se envuelve nada acá en
 * `.tema-empresarial`: esta pantalla vive en el chrome normal (shadcn) del
 * resto de la app administrativa, la paleta indigo/gradiente queda acotada
 * al recuadro de vista previa.
 */
export function ConfiguracionEmpresaPage() {
  usePageHeader({ title: "Apariencia" });

  const { data, isLoading, isError, error, refetch } = useConfiguracionEmpresa();
  const actualizar = useUpdateConfiguracionEmpresa();
  const [confirmandoRestauracion, setConfirmandoRestauracion] = useState(false);

  if (isLoading) {
    return <LoadingState rows={3} rowHeight="h-12" />;
  }

  if (isError) {
    return <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />;
  }

  const configuracion = data ?? CONFIGURACION_EMPRESA_DEFAULT;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Personalizá el nombre y los colores de marca que ve tu equipo en la pantalla de
        bienvenida al iniciar sesión.
      </p>
      <ConfiguracionEmpresaForm
        configuracion={configuracion}
        enviando={actualizar.isPending}
        onSubmit={(valores) => actualizar.mutate(valores)}
      />

      <div className="flex flex-col gap-1.5 border-t border-border pt-5">
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={actualizar.isPending}
          onClick={() => setConfirmandoRestauracion(true)}
        >
          Restaurar valores predeterminados
        </Button>
      </div>

      <AlertDialog open={confirmandoRestauracion} onOpenChange={setConfirmandoRestauracion}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar los valores predeterminados?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a perder el nombre, los colores de marca y el isotipo configurados
              actualmente para todo el holding -- se reemplazan por los valores de fábrica
              ({CONFIGURACION_EMPRESA_DEFAULT.nombre}, {CONFIGURACION_EMPRESA_DEFAULT.colorPrimario}
              {" "}y {CONFIGURACION_EMPRESA_DEFAULT.colorSecundario}, sin isotipo).
              Esta acción no se puede deshacer, y cada persona con la app abierta necesita
              recargar la página (F5) para ver el cambio reflejado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={actualizar.isPending}
              onClick={() => actualizar.mutate(CONFIGURACION_EMPRESA_DEFAULT)}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ConfiguracionEmpresaFormProps {
  configuracion: ConfiguracionEmpresa;
  enviando: boolean;
  onSubmit: (valores: UpdateConfiguracionEmpresaInput) => void;
}

function ConfiguracionEmpresaForm({
  configuracion,
  enviando,
  onSubmit,
}: ConfiguracionEmpresaFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ConfiguracionEmpresaValues>({
    resolver: zodResolver(configuracionEmpresaSchema),
    // El input de logoUrl siempre maneja `string` -- `null` (sin isotipo
    // configurado) se precarga como cadena vacía.
    defaultValues: { ...configuracion, logoUrl: configuracion.logoUrl ?? "" },
  });

  const enviar = handleSubmit((valores) =>
    onSubmit({ ...valores, logoUrl: valores.logoUrl === "" ? null : valores.logoUrl }),
  );

  // Vista previa en vivo: mientras el usuario teclea un hex incompleto, se
  // sostiene el último color válido en vez de romper el gradiente con un
  // valor a medio escribir.
  const colorPrimarioTecleado = watch("colorPrimario");
  const colorSecundarioTecleado = watch("colorSecundario");
  const previewColorPrimario = HEX_COLOR_REGEX.test(colorPrimarioTecleado)
    ? colorPrimarioTecleado
    : configuracion.colorPrimario;
  const previewColorSecundario = HEX_COLOR_REGEX.test(colorSecundarioTecleado)
    ? colorSecundarioTecleado
    : configuracion.colorSecundario;

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="config-nombre">Nombre de la empresa</Label>
        <Input
          id="config-nombre"
          disabled={enviando}
          aria-invalid={errors.nombre ? "true" : undefined}
          {...register("nombre")}
        />
        {errors.nombre ? <p className="text-sm text-destructive">{errors.nombre.message}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <CampoColor
          name="colorPrimario"
          label="Color primario"
          control={control}
          errors={errors}
          enviando={enviando}
        />
        <CampoColor
          name="colorSecundario"
          label="Color secundario"
          control={control}
          errors={errors}
          enviando={enviando}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="config-logo-url">URL del isotipo (opcional)</Label>
        <Input
          id="config-logo-url"
          type="url"
          placeholder="https://cdn.miempresa.com/logo.svg"
          disabled={enviando}
          aria-invalid={errors.logoUrl ? "true" : undefined}
          {...register("logoUrl")}
        />
        {errors.logoUrl ? (
          <p className="text-sm text-destructive">{errors.logoUrl.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Vista previa</Label>
        <div
          className="flex h-24 items-center justify-center rounded-lg text-center text-sm font-medium text-white shadow-inner"
          style={{
            background: `linear-gradient(135deg, ${previewColorPrimario}, ${previewColorSecundario})`,
          }}
        >
          Así se ve la pantalla de bienvenida al iniciar sesión
        </div>
      </div>

      <Button type="submit" disabled={enviando} className="w-fit">
        {enviando ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

interface CampoColorProps {
  name: "colorPrimario" | "colorSecundario";
  label: string;
  control: Control<ConfiguracionEmpresaValues>;
  errors: FieldErrors<ConfiguracionEmpresaValues>;
  enviando: boolean;
}

/**
 * Selector de color + input hex de respaldo, sincronizados sobre el mismo
 * campo de RHF (`Controller`, no dos fuentes de verdad separadas). El
 * selector visual (`type="color"`) exige siempre un hex de 6 dígitos válido
 * -- si el hex tecleado todavía no lo es (a medio escribir), se le muestra
 * negro como placeholder neutro sin tocar el valor real del campo.
 */
function CampoColor({ name, label, control, errors, enviando }: CampoColorProps) {
  const inputId = `config-${name}`;
  const error = errors[name]?.message;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${label} (selector visual)`}
              disabled={enviando}
              value={HEX_COLOR_REGEX.test(field.value) ? field.value : "#000000"}
              onChange={(event) => field.onChange(event.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
            />
            <Input
              id={inputId}
              type="text"
              placeholder="#1e2a5e"
              disabled={enviando}
              aria-invalid={error ? "true" : undefined}
              className="flex-1 font-mono"
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
            />
          </div>
        )}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
