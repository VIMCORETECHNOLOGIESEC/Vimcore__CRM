import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveToken } from "../useBridges";

const tokenFormSchema = z.object({
  token: z.string().trim().min(1, "Ingresá el token."),
});

type TokenFormValues = z.infer<typeof tokenFormSchema>;

interface TokenFormProps {
  bridgeId: string;
}

/**
 * Formulario de carga y renovación de token con verificación inmediata
 * (F8). El campo **siempre se muestra vacío, nunca precargado** (docs/07 F8:
 * "El token nunca se devuelve por la API... Se envía solo al guardar") --
 * `defaultValues` es siempre `{ token: "" }`, nunca se inicializa con nada
 * proveniente del bridge (que de hecho ni siquiera tiene ese campo en
 * `tipos/bridge.ts`: el token nunca llega al frontend). Tras guardar
 * correctamente, `reset()` vuelve a vaciar el campo -- no queda el valor
 * recién escrito en pantalla ni un segundo después.
 *
 * La "verificación inmediata" ocurre en el propio `saveTokenApi` (mock): la
 * mutación no se resuelve hasta que la "plataforma" acepta o rechaza el
 * token -- ver `bridges.api.ts` para la simulación exacta.
 */
export function TokenForm({ bridgeId }: TokenFormProps) {
  const saveToken = useSaveToken(bridgeId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TokenFormValues>({ resolver: zodResolver(tokenFormSchema), defaultValues: { token: "" } });

  const enviar = handleSubmit((valores) => {
    saveToken.mutate(valores.token, { onSuccess: () => reset({ token: "" }) });
  });

  return (
    <form onSubmit={enviar} noValidate className="flex flex-wrap items-end gap-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="bridge-token">Token</Label>
        <Input
          id="bridge-token"
          type="password"
          autoComplete="off"
          placeholder="Pegá el token nuevo…"
          disabled={saveToken.isPending}
          aria-invalid={errors.token ? "true" : undefined}
          {...register("token")}
        />
        {errors.token ? <p className="text-sm text-destructive">{errors.token.message}</p> : null}
      </div>
      <Button type="submit" disabled={saveToken.isPending}>
        {saveToken.isPending ? "Verificando…" : "Guardar y verificar"}
      </Button>
    </form>
  );
}
