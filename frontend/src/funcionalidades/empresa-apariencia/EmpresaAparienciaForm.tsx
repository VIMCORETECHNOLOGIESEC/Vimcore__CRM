import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { hexColorSchema, logoUrlSchema, nombreMarcaSchema } from "schemas";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoColorHex } from "@/componentes/formularios/CampoColorHex";

/**
 * Formulario compartido de apariencia de una `Empresa`
 * (`docs/blocks/d0-visualizacion-multitenant.md`, Tarea 3 + PASO 8), extraído
 * para que ninguno de los dos consumidores reimplemente el mismo par de
 * campos de color:
 * - `EmpresaAparienciaPage.tsx` (self-service, `PATCH /empresas/actual/
 *   apariencia`) -- `mostrarNombre={false}`, ambos colores son requeridos
 *   pero nullable (backend exige el par completo en cada envío).
 * - El editor cross-empresa de holding (`PATCH /empresas/:empresaId/
 *   apariencia`) -- `mostrarNombre={true}`, colores y nombre son
 *   independientes entre sí (backend acepta envío parcial).
 *
 * `colorPrimario`/`colorSecundario`/`logoUrl` viajan como `string` dentro del
 * formulario ("" representa "sin valor propio, heredar") y se convierten a
 * `null` recién en el `onSubmit` -- mismo criterio que ya usaba
 * `ConfiguracionEmpresaPage.tsx` para `logoUrl`.
 */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const empresaAparienciaSchema = z.object({
  nombre: z.string().optional(),
  colorPrimario: hexColorSchema.or(z.literal("")),
  colorSecundario: hexColorSchema.or(z.literal("")),
  logoUrl: logoUrlSchema.or(z.literal("")),
});

type EmpresaAparienciaValues = z.infer<typeof empresaAparienciaSchema>;

export interface EmpresaAparienciaSubmitValues {
  nombre?: string;
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}

export interface EmpresaAparienciaValoresIniciales {
  nombre?: string;
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}

interface EmpresaAparienciaFormProps {
  /** `true` para el editor cross-empresa de holding (PASO 8), `false` para el self-service. */
  mostrarNombre: boolean;
  valoresIniciales: EmpresaAparienciaValoresIniciales;
  enviando: boolean;
  onSubmit: (valores: EmpresaAparienciaSubmitValues) => void;
  submitLabel?: string;
}

export function EmpresaAparienciaForm({
  mostrarNombre,
  valoresIniciales,
  enviando,
  onSubmit,
  submitLabel = "Guardar cambios",
}: EmpresaAparienciaFormProps) {
  const schema = mostrarNombre
    ? empresaAparienciaSchema.extend({ nombre: nombreMarcaSchema })
    : empresaAparienciaSchema;

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EmpresaAparienciaValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: valoresIniciales.nombre ?? "",
      colorPrimario: valoresIniciales.colorPrimario ?? "",
      colorSecundario: valoresIniciales.colorSecundario ?? "",
      logoUrl: valoresIniciales.logoUrl ?? "",
    },
  });

  const enviar = handleSubmit((valores) => {
    const payload: EmpresaAparienciaSubmitValues = {
      colorPrimario: valores.colorPrimario === "" ? null : valores.colorPrimario,
      colorSecundario: valores.colorSecundario === "" ? null : valores.colorSecundario,
      logoUrl: valores.logoUrl === "" ? null : valores.logoUrl,
    };
    if (mostrarNombre) {
      payload.nombre = valores.nombre;
    }
    onSubmit(payload);
  });

  // Vista previa en vivo: mientras el usuario teclea un hex incompleto, se
  // sostiene el último color válido conocido en vez de romper el gradiente
  // con un valor a medio escribir. Sin color propio ("") se ve como gris
  // neutro -- ninguna paleta heredada se inventa acá.
  const colorPrimarioTecleado = watch("colorPrimario");
  const colorSecundarioTecleado = watch("colorSecundario");
  const previewColorPrimario = HEX_COLOR_REGEX.test(colorPrimarioTecleado)
    ? colorPrimarioTecleado
    : "#9ca3af";
  const previewColorSecundario = HEX_COLOR_REGEX.test(colorSecundarioTecleado)
    ? colorSecundarioTecleado
    : "#9ca3af";

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      {mostrarNombre ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="empresa-apariencia-nombre">Nombre de la empresa</Label>
          <Input
            id="empresa-apariencia-nombre"
            disabled={enviando}
            aria-invalid={errors.nombre ? "true" : undefined}
            {...register("nombre")}
          />
          {errors.nombre ? (
            <p className="text-sm text-destructive">{errors.nombre.message}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <CampoColorHex<EmpresaAparienciaValues>
          name="colorPrimario"
          label="Color primario"
          control={control}
          errors={errors}
          disabled={enviando}
        />
        <CampoColorHex<EmpresaAparienciaValues>
          name="colorSecundario"
          label="Color secundario"
          control={control}
          errors={errors}
          disabled={enviando}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Dejá un color en blanco para usar el color heredado del holding en su lugar.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="empresa-apariencia-logo-url">URL del isotipo (opcional)</Label>
        <Input
          id="empresa-apariencia-logo-url"
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
          Así se ve la marca de esta empresa
        </div>
      </div>

      <Button type="submit" disabled={enviando} className="w-fit">
        {enviando ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
