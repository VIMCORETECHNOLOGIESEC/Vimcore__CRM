import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { hexColorSchema, logoUrlSchema, nombreMarcaSchema } from "schemas";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoColorHex } from "@/componentes/formularios/CampoColorHex";
import { CampoLogoUpload } from "@/componentes/formularios/CampoLogoUpload";
import { contrastRatio, foregroundForContrast, hexToRgbTriplet } from "@/lib/color-marca";

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

/** Mismo umbral WCAG AA (4.5:1) que ya usa `foregroundForContrast`
 * (`color-marca.ts`) para elegir el foreground del shell autenticado -- acá
 * se reutiliza solo para decidir si corresponde mostrar la advertencia de
 * bajo contraste en la vista previa, nunca para bloquear el guardado. */
const CONTRASTE_MINIMO_AA = 4.5;

/** "124 45 18" (triplete RGB espaciado que usa `color-marca.ts` para
 * componer con las variables CSS del tema) -> "rgb(124, 45, 18)" para un
 * `style` inline puntual de esta vista previa -- no se reusa el formato
 * espaciado de `index.css` porque acá no hay una variable CSS de por medio,
 * es un color en vivo calculado en JS. */
function cssRgb(triplet: string): string {
  return `rgb(${triplet.trim().split(/\s+/).join(", ")})`;
}

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
  /**
   * Sube el archivo de isotipo elegido y resuelve con su URL pública. Cada
   * consumidor real pasa su propia función (`uploadLogoEmpresaApi` en
   * `EmpresaAparienciaPage.tsx`); se omite en el editor cross-empresa de
   * holding sobre OTRA empresa (`EditarEmpresaHoldingDialog.tsx` /
   * `CrearEmpresaHoldingDialog.tsx`) porque ese endpoint todavía no existe
   * (`POST /empresas/:empresaId/apariencia/logo`) -- el campo queda
   * deshabilitado en ese caso, ver `CampoLogoUpload`.
   */
  onSubirLogo?: (file: File) => Promise<string>;
}

export function EmpresaAparienciaForm({
  mostrarNombre,
  valoresIniciales,
  enviando,
  onSubmit,
  submitLabel = "Guardar cambios",
  onSubirLogo,
}: EmpresaAparienciaFormProps) {
  const schema = mostrarNombre
    ? empresaAparienciaSchema.extend({ nombre: nombreMarcaSchema })
    : empresaAparienciaSchema;

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
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

  // Advertencia de bajo contraste (no bloqueante -- el color se guarda igual):
  // `foregroundForContrast` ya elige el mejor foreground posible entre blanco
  // y el oscuro del tema para cada fondo, así que si ESE contraste no llega a
  // 4.5:1 (WCAG AA), ninguno de los dos candidatos lo alcanza. Solo se avisa
  // sobre un color realmente elegido por el usuario, nunca sobre el gris de
  // reemplazo ("#9ca3af") que se muestra mientras el campo está vacío o a
  // medio escribir.
  const colorPrimarioValido = HEX_COLOR_REGEX.test(colorPrimarioTecleado);
  const colorSecundarioValido = HEX_COLOR_REGEX.test(colorSecundarioTecleado);

  const tripletPrimario = hexToRgbTriplet(previewColorPrimario);
  const tripletSecundario = hexToRgbTriplet(previewColorSecundario);
  const foregroundPrimario = foregroundForContrast(tripletPrimario);
  const foregroundSecundario = foregroundForContrast(tripletSecundario);

  const bajoContrastePrimario =
    colorPrimarioValido &&
    contrastRatio(tripletPrimario, foregroundPrimario) < CONTRASTE_MINIMO_AA;
  const bajoContrasteSecundario =
    colorSecundarioValido &&
    contrastRatio(tripletSecundario, foregroundSecundario) < CONTRASTE_MINIMO_AA;

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

      <CampoLogoUpload
        id="empresa-apariencia-logo"
        label="Isotipo"
        valorActual={watch("logoUrl")}
        disabled={enviando}
        onSubirLogo={onSubirLogo}
        onLogoUrlChange={(url) => setValue("logoUrl", url, { shouldValidate: true })}
      />
      {errors.logoUrl ? <p className="text-sm text-destructive">{errors.logoUrl.message}</p> : null}

      <div className="flex flex-col gap-2">
        <Label>Vista previa</Label>
        <div
          className="flex h-16 items-center justify-center rounded-lg text-center text-sm font-medium text-white shadow-inner"
          style={{
            background: `linear-gradient(135deg, ${previewColorPrimario}, ${previewColorSecundario})`,
          }}
        >
          Así se ve la marca de esta empresa
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <div
              data-testid="vista-previa-sidebar"
              className="flex h-20 flex-col justify-center gap-1 rounded-lg px-3 shadow-inner"
              style={{ backgroundColor: cssRgb(tripletPrimario), color: cssRgb(foregroundPrimario) }}
            >
              <span className="text-xs font-semibold">Panel lateral</span>
              <span className="text-[0.7rem] opacity-90">Leads</span>
            </div>
            {bajoContrastePrimario ? (
              <p className="text-xs text-muted-foreground">
                Este color tiene bajo contraste, el texto podría costar leerse.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted">
              <span
                data-testid="vista-previa-acento-boton"
                className="rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm"
                style={{
                  backgroundColor: cssRgb(tripletSecundario),
                  color: cssRgb(foregroundSecundario),
                }}
              >
                Botón de ejemplo
              </span>
            </div>
            {bajoContrasteSecundario ? (
              <p className="text-xs text-muted-foreground">
                Este color tiene bajo contraste, el texto podría costar leerse.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={enviando} className="w-fit">
        {enviando ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
