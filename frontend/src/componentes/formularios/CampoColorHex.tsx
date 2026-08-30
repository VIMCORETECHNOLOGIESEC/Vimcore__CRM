import { Controller, type Control, type FieldErrors, type FieldValues, type Path } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Mismo regex que `hexColorSchema` (paquete compartido `schemas`) -- acá
 * aparte porque se usa para el chequeo rápido del selector visual
 * (`type="color"` exige siempre un hex de 6 dígitos completo), no para
 * validación de Zod del formulario que lo use.
 */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

interface CampoColorHexProps<TFieldValues extends FieldValues> {
  name: Path<TFieldValues>;
  label: string;
  control: Control<TFieldValues>;
  errors: FieldErrors<TFieldValues>;
  disabled?: boolean;
}

/**
 * Selector de color (`type="color"`) + input hex de respaldo, sincronizados
 * sobre el mismo campo de RHF (`Controller`, no dos fuentes de verdad
 * separadas). Extraído de `ConfiguracionEmpresaPage.tsx` (única aparición
 * previa) para reutilizarlo también en `empresa-apariencia/` (self-service y
 * admin cross-empresa de holding, `docs/blocks/d0-visualizacion-multitenant.md`
 * PASO 8) -- las tres pantallas editan el mismo tipo de campo
 * (colorPrimario/colorSecundario) y antes solo una lo tenía implementado.
 *
 * Genérico sobre `TFieldValues`: cada pantalla define su propio esquema Zod
 * (los tres endpoints difieren en si el color es nullable/opcional), este
 * componente solo sincroniza la UI de un campo `string` puntual del
 * formulario que lo use -- la conversión `"" <-> null` en los formularios que
 * lo permiten ocurre en el `onSubmit` del formulario, no acá.
 */
export function CampoColorHex<TFieldValues extends FieldValues>({
  name,
  label,
  control,
  errors,
  disabled,
}: CampoColorHexProps<TFieldValues>) {
  const inputId = `campo-color-${String(name)}`;
  const error = errors[name]?.message as string | undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const valorActual = typeof field.value === "string" ? field.value : "";
          return (
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${label} (selector visual)`}
                disabled={disabled}
                value={HEX_COLOR_REGEX.test(valorActual) ? valorActual : "#000000"}
                onChange={(event) => field.onChange(event.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              <Input
                id={inputId}
                type="text"
                placeholder="#1e2a5e"
                disabled={disabled}
                aria-invalid={error ? "true" : undefined}
                className="flex-1 font-mono"
                value={valorActual}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
              />
            </div>
          );
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
