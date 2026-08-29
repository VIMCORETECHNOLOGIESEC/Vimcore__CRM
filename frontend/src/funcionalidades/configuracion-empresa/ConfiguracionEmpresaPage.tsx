import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { getErrorMessage } from "@/api/httpClient";
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
 * Hex de 6 dígitos con `#` -- mismo formato que devuelve/acepta el backend
 * (contrato confirmado, ver `configuracion-empresa.api.ts`).
 */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const hexColorSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR_REGEX, "Ingresá un color hexadecimal válido (ej. #1e2a5e).");

const configuracionEmpresaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre de la empresa.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
  colorPrimario: hexColorSchema,
  colorSecundario: hexColorSchema,
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
    defaultValues: configuracion,
  });

  const enviar = handleSubmit((valores) => onSubmit(valores));

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
