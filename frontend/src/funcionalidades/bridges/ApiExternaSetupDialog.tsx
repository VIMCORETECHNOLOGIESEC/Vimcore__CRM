import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronRight, Info, Plus, ShieldCheck, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CampoInternoApiExterna } from "@/tipos/bridge";
import {
  useSaveConexionApiExterna,
  useSaveMapeoApiExterna,
  useTestConexionApiExterna,
} from "./useBridgeApiExterna";

interface ApiExternaSetupDialogProps {
  open: boolean;
  /**
   * Bridge ya creado (`POST /bridges { redSocial: "API_EXTERNA" }`, disparado
   * por `BridgesPage.tsx` antes de montar este diálogo) -- los 3 pasos de
   * acá cargan configuración sobre ESTE bridge, nunca crean uno nuevo.
   */
  bridgeId: string;
  nombre: string;
  onClose: () => void;
}

const CAMPOS_INTERNOS: CampoInternoApiExterna[] = [
  "idExternoLead",
  "nombre",
  "telefono",
  "correo",
  "idExternoCampania",
  "nombreCampania",
  "idExternoCuenta",
];

const PASOS = ["Conexión", "Mapeo de campos", "Probar"];

/**
 * Reglas idénticas a
 * `backend/src/schemas/bridges.schema.ts::conexionBridgeApiBodySchema`. No se
 * reutiliza ese schema directamente: vive en `backend/src/schemas`, fuera de
 * `packages/schemas` (el único paquete Zod compartido real con el frontend
 * hoy -- ver `loginBodySchema`/`logoUrlSchema` ahí) y fuera del scope
 * frontend-only de esta sesión.
 */
const conexionSchema = z.object({
  url: z.string().trim().url("Ingresa una dirección web válida."),
  nombreHeaderApiKey: z.string().trim().min(1, "Ingresa el nombre de la llave.").optional(),
  credencialExterna: z.string().trim().min(1, "Ingresa la llave de acceso."),
});
type ConexionValues = z.infer<typeof conexionSchema>;

/**
 * Reglas idénticas a `backend/src/schemas/bridges.schema.ts::mapeoCamposSchema`
 * -- mismo criterio de duplicación local que `conexionSchema` arriba (sin
 * paquete Zod compartido para `bridges/*`, ver AGENTS.md §4). El refinamiento
 * exige al menos una clave no vacía mapeada a `idExternoLead`: es la clave de
 * idempotencia contra `LeadRecibido`, el backend rechaza con 400 si falta.
 */
const mapeoSchema = z
  .object({
    mapeos: z
      .array(
        z.object({
          clave: z.string().trim(),
          campo: z.enum(CAMPOS_INTERNOS as [CampoInternoApiExterna, ...CampoInternoApiExterna[]]),
        }),
      )
      .min(1),
    parametroFecha: z.string().trim().optional(),
  })
  .refine((valores) => valores.mapeos.some((fila) => fila.clave !== "" && fila.campo === "idExternoLead"), {
    message:
      "Marca al menos un campo como idExternoLead: es el identificador único de cada lead, sin eso no podemos evitar duplicados.",
    path: ["mapeos"],
  });
type MapeoValues = z.infer<typeof mapeoSchema>;

const MAPEO_INICIAL: MapeoValues["mapeos"] = [{ clave: "id", campo: "idExternoLead" }];

/**
 * Asistente de configuración de un bridge `API_EXTERNA` (material de prueba,
 * `docs/contrato-frontend-bridge-api_mat_01.md`) -- 3 pasos, cada uno
 * disparando una mutación real sobre el `bridgeId` recibido:
 * `PATCH .../conexion` → `PATCH .../mapeo` → `POST .../probar-conexion`. Cada
 * paso solo avanza cuando el backend responde 200 (`useBridgeApiExterna.ts`);
 * un error se muestra en el paso donde ocurrió, sin avanzar, y el usuario
 * puede reintentar sin perder el resto del formulario.
 *
 * LÍMITE DE CONTRATO CONOCIDO (documentado en el material de prueba): el job
 * de backend que efectivamente trae los leads por polling todavía NO EXISTE.
 * Terminar este asistente configura y verifica la conexión, pero el bridge no
 * va a traer leads reales todavía en este entorno.
 */
export function ApiExternaSetupDialog({ open, bridgeId, nombre, onClose }: ApiExternaSetupDialogProps) {
  const [paso, setPaso] = useState(0);

  const saveConexion = useSaveConexionApiExterna(bridgeId);
  const saveMapeo = useSaveMapeoApiExterna(bridgeId);
  const testConexion = useTestConexionApiExterna(bridgeId);

  const {
    register: registerConexion,
    handleSubmit: handleSubmitConexion,
    formState: { errors: erroresConexion },
  } = useForm<ConexionValues>({
    resolver: zodResolver(conexionSchema),
    defaultValues: { url: "", nombreHeaderApiKey: "X-Api-Key", credencialExterna: "" },
  });

  const {
    register: registerMapeo,
    control: controlMapeo,
    handleSubmit: handleSubmitMapeo,
    formState: { errors: erroresMapeo },
    reset: resetMapeo,
  } = useForm<MapeoValues>({
    resolver: zodResolver(mapeoSchema),
    defaultValues: { mapeos: MAPEO_INICIAL, parametroFecha: "" },
  });
  const {
    fields: filasMapeo,
    append: addFilaMapeo,
    remove: removeFilaMapeo,
  } = useFieldArray({ control: controlMapeo, name: "mapeos" });

  function close() {
    setPaso(0);
    resetMapeo({ mapeos: MAPEO_INICIAL, parametroFecha: "" });
    saveConexion.reset();
    saveMapeo.reset();
    testConexion.reset();
    onClose();
  }

  const submitConexion = handleSubmitConexion((valores) => {
    saveConexion.mutate(
      {
        url: valores.url,
        credencialExterna: valores.credencialExterna,
        nombreHeaderApiKey: valores.nombreHeaderApiKey || undefined,
      },
      { onSuccess: () => setPaso(1) },
    );
  });

  const submitMapeo = handleSubmitMapeo((valores) => {
    const mapeoCampos: Record<string, CampoInternoApiExterna> = {};
    for (const fila of valores.mapeos) {
      if (fila.clave) mapeoCampos[fila.clave] = fila.campo;
    }
    saveMapeo.mutate(
      { mapeoCampos, parametroFecha: valores.parametroFecha || undefined },
      { onSuccess: () => setPaso(2) },
    );
  });

  const tituloPrueba = testConexion.data?.ok
    ? "Conexión verificada"
    : testConexion.data
      ? "No pudimos verificar la conexión"
      : "Probemos que todo funcione";
  const descripcionPrueba = testConexion.data
    ? testConexion.data.mensaje
    : "Vamos a hacer una prueba sin cambiar ni borrar nada de tu sistema.";

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">A</span>
            API externa
          </div>
          <DialogTitle>Configurar {nombre}</DialogTitle>
          <DialogDescription>
            Conectá el sistema donde hoy recibís tus consultas. Nosotros vamos a consultar sus leads y acomodarlos en el CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 border-b border-border pb-4">
          {PASOS.map((etiqueta, indice) => (
            <div key={etiqueta} className="flex items-center gap-2 text-xs font-medium">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${indice <= paso ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>
                {indice < paso ? <Check className="size-3.5" aria-hidden="true" /> : indice + 1}
              </span>
              <span className={indice === paso ? "text-foreground" : "text-muted-foreground"}>{etiqueta}</span>
            </div>
          ))}
        </div>

        {paso === 0 ? (
          <div className="flex flex-col gap-4 py-1">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div><p className="font-medium">Tus datos quedan protegidos</p><p className="mt-1 text-muted-foreground">La clave se guarda de forma segura y no vuelve a mostrarse en pantalla.</p></div>
              </div>
            </div>
            {saveConexion.isError ? (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {getErrorMessage(saveConexion.error)}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="api-externa-url" label="Dirección de tus leads" info="Es la dirección web que nos tiene que pasar quien mantiene tu sistema. Normalmente termina en /leads." />
                <Input id="api-externa-url" placeholder="https://api.ejemplo.com/leads" aria-invalid={erroresConexion.url ? "true" : undefined} {...registerConexion("url")} />
                {erroresConexion.url ? <p className="text-sm text-destructive">{erroresConexion.url.message}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="api-externa-header" label="Nombre de la llave" info="Es el nombre que usa tu sistema para recibir la API key. Si no te indicaron otro, deja X-Api-Key." />
                <Input id="api-externa-header" aria-invalid={erroresConexion.nombreHeaderApiKey ? "true" : undefined} {...registerConexion("nombreHeaderApiKey")} />
                {erroresConexion.nombreHeaderApiKey ? <p className="text-sm text-destructive">{erroresConexion.nombreHeaderApiKey.message}</p> : null}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="api-externa-credencial" label="Llave de acceso" info="Es la contraseña que permite leer los leads. Pedísela a quien administra tu sistema." />
              <Input id="api-externa-credencial" type="password" placeholder="Pega aquí la llave que te dieron" aria-invalid={erroresConexion.credencialExterna ? "true" : undefined} {...registerConexion("credencialExterna")} />
              {erroresConexion.credencialExterna ? <p className="text-sm text-destructive">{erroresConexion.credencialExterna.message}</p> : null}
              <p className="text-xs text-muted-foreground">La usamos para conectar, pero no la mostramos ni la compartimos.</p>
            </div>
          </div>
        ) : null}

        {paso === 1 ? (
          <div className="flex flex-col gap-4 py-1">
            <div><p className="flex items-center gap-2 text-sm font-medium">Cuéntanos qué significa cada dato <InfoButton text="Aquí relacionas los nombres que usa tu sistema (por ejemplo, customer_id) con los campos que entiende el CRM. El ID del lead es obligatorio para no cargar dos veces la misma consulta." /></p><p className="mt-1 text-xs text-muted-foreground">El primer renglón ya está preparado: cada lead necesita un identificador único.</p></div>
            {erroresMapeo.mapeos?.root?.message ? (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erroresMapeo.mapeos.root.message}</p>
            ) : saveMapeo.isError ? (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{getErrorMessage(saveMapeo.error)}</p>
            ) : null}
            <div className="flex flex-col gap-2">
              {filasMapeo.map((fila, indice) => (
                <div key={fila.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div className="flex flex-col gap-1"><Label className="text-xs text-muted-foreground">Nombre en tu sistema</Label><Input placeholder="customer_id" {...registerMapeo(`mapeos.${indice}.clave`)} /></div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Lo guardamos como</Label>
                    <Controller
                      control={controlMapeo}
                      name={`mapeos.${indice}.campo`}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label={`Campo interno ${indice + 1}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{CAMPOS_INTERNOS.map((campo) => <SelectItem key={campo} value={campo}>{campo}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-2xl" aria-label={`Quitar mapeo ${indice + 1}`} onClick={() => removeFilaMapeo(indice)} disabled={filasMapeo.length === 1}><Trash2 className="size-4" aria-hidden="true" /></Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-fit rounded-2xl" onClick={() => addFilaMapeo({ clave: "", campo: "nombre" })}><Plus className="size-4" aria-hidden="true" />Agregar campo</Button>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-externa-fecha">Parámetro de fecha <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="api-externa-fecha" placeholder="updated_since" {...registerMapeo("parametroFecha")} />
              <p className="text-xs text-muted-foreground">Enviaremos la fecha en formato ISO 8601 UTC.</p>
            </div>
          </div>
        ) : null}

        {paso === 2 ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            {testConexion.data?.ok ? <div className="flex size-12 items-center justify-center rounded-full bg-foreground text-background"><Check aria-hidden="true" /></div> : <div className="flex size-12 items-center justify-center rounded-full border border-border"><Zap aria-hidden="true" /></div>}
            <div>
              <h3 className="font-semibold">{tituloPrueba}</h3>
              <p className={`mt-1 max-w-md text-sm ${testConexion.data && !testConexion.data.ok ? "text-destructive" : "text-muted-foreground"}`}>{descripcionPrueba}</p>
            </div>
            {testConexion.data?.ok ? (
              testConexion.data.cantidadLeads !== undefined ? (
                <p className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm"><strong>{testConexion.data.cantidadLeads}</strong> leads encontrados en la respuesta</p>
              ) : null
            ) : (
              <>
                {testConexion.isError ? (
                  <p role="alert" className="text-sm text-destructive">{getErrorMessage(testConexion.error)}</p>
                ) : null}
                <Button type="button" className="rounded-2xl" onClick={() => testConexion.mutate()} disabled={testConexion.isPending}>
                  <Zap className="size-4" aria-hidden="true" />
                  {testConexion.isPending ? "Probando…" : "Probar conexión"}
                </Button>
              </>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            disabled={saveConexion.isPending || saveMapeo.isPending}
            onClick={paso === 0 ? close : () => setPaso((actual) => actual - 1)}
          >
            {paso === 0 ? "Cancelar" : "Atrás"}
          </Button>
          {paso < 2 ? (
            <Button
              type="button"
              className="rounded-2xl"
              disabled={paso === 0 ? saveConexion.isPending : saveMapeo.isPending}
              onClick={paso === 0 ? submitConexion : submitMapeo}
            >
              {paso === 0
                ? saveConexion.isPending ? "Guardando…" : "Continuar"
                : saveMapeo.isPending ? "Guardando…" : "Guardar y continuar"}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" className="rounded-2xl" onClick={close} disabled={testConexion.data?.ok !== true}>
              Finalizar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ htmlFor, label, info }: { htmlFor: string; label: string; info: string }) {
  return <span className="flex items-center gap-1.5"><Label htmlFor={htmlFor}>{label}</Label><InfoButton text={info} /></span>;
}

function InfoButton({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Más información" className="size-6 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <Info className="size-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 text-xs leading-relaxed">
        {text}
      </PopoverContent>
    </Popover>
  );
}
