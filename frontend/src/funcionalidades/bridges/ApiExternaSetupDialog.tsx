import { Check, ChevronRight, Info, Plus, ShieldCheck, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ApiExternaSetupDialogProps {
  open: boolean;
  nombre: string;
  onClose: () => void;
}

const CAMPOS_INTERNOS = [
  "idExternoLead",
  "nombre",
  "telefono",
  "correo",
  "idExternoCampania",
  "nombreCampania",
  "idExternoCuenta",
];

const PASOS = ["Conexión", "Mapeo de campos", "Probar"];

export function ApiExternaSetupDialog({ open, nombre, onClose }: ApiExternaSetupDialogProps) {
  const [paso, setPaso] = useState(0);
  const [mapeos, setMapeos] = useState([{ clave: "id", campo: "idExternoLead" }]);
  const [resultado, setResultado] = useState<"idle" | "success">("idle");

  function cerrar() {
    setPaso(0);
    setResultado("idle");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && cerrar()}>
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
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="flex flex-col gap-1.5"><FieldLabel htmlFor="api-externa-url" label="Dirección de tus leads" info="Es la dirección web que nos tiene que pasar quien mantiene tu sistema. Normalmente termina en /leads." /><Input id="api-externa-url" placeholder="https://api.ejemplo.com/leads" /></div>
              <div className="flex flex-col gap-1.5"><FieldLabel htmlFor="api-externa-header" label="Nombre de la llave" info="Es el nombre que usa tu sistema para recibir la API key. Si no te indicaron otro, dejá X-Api-Key." /><Input id="api-externa-header" defaultValue="X-Api-Key" /></div>
            </div>
            <div className="flex flex-col gap-1.5"><FieldLabel htmlFor="api-externa-credencial" label="Llave de acceso" info="Es la contraseña que permite leer los leads. Pedísela a quien administra tu sistema." /><Input id="api-externa-credencial" type="password" placeholder="Pegá acá la llave que te dieron" /><p className="text-xs text-muted-foreground">La usamos para conectar, pero no la mostramos ni la compartimos.</p></div>
          </div>
        ) : null}

        {paso === 1 ? (
          <div className="flex flex-col gap-4 py-1">
            <div><p className="flex items-center gap-2 text-sm font-medium">Decinos qué significa cada dato <InfoButton text="Acá relacionás los nombres que usa tu sistema (por ejemplo, customer_id) con los campos que entiende el CRM. El ID del lead es obligatorio para no cargar dos veces la misma consulta." /></p><p className="mt-1 text-xs text-muted-foreground">El primer renglón ya está preparado: cada lead necesita un identificador único.</p></div>
            <div className="flex flex-col gap-2">
              {mapeos.map((mapeo, indice) => (
                <div key={`${mapeo.clave}-${indice}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div className="flex flex-col gap-1"><Label className="text-xs text-muted-foreground">Nombre en tu sistema</Label><Input value={mapeo.clave} onChange={(event) => setMapeos((actual) => actual.map((item, i) => i === indice ? { ...item, clave: event.target.value } : item))} placeholder="customer_id" /></div>
                  <div className="flex flex-col gap-1"><Label className="text-xs text-muted-foreground">Lo guardamos como</Label><Select value={mapeo.campo} onValueChange={(campo) => setMapeos((actual) => actual.map((item, i) => i === indice ? { ...item, campo } : item))}><SelectTrigger aria-label={`Campo interno ${indice + 1}`}><SelectValue /></SelectTrigger><SelectContent>{CAMPOS_INTERNOS.map((campo) => <SelectItem key={campo} value={campo}>{campo}</SelectItem>)}</SelectContent></Select></div>
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-2xl" aria-label={`Quitar mapeo ${indice + 1}`} onClick={() => setMapeos((actual) => actual.filter((_, i) => i !== indice))} disabled={mapeos.length === 1}><Trash2 className="size-4" aria-hidden="true" /></Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-fit rounded-2xl" onClick={() => setMapeos((actual) => [...actual, { clave: "", campo: "nombre" }])}><Plus className="size-4" aria-hidden="true" />Agregar campo</Button>
            <div className="flex flex-col gap-1.5"><Label htmlFor="api-externa-fecha">Parámetro de fecha <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="api-externa-fecha" placeholder="updated_since" /><p className="text-xs text-muted-foreground">Enviaremos la fecha en formato ISO 8601 UTC.</p></div>
          </div>
        ) : null}

        {paso === 2 ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            {resultado === "success" ? <div className="flex size-12 items-center justify-center rounded-full bg-foreground text-background"><Check aria-hidden="true" /></div> : <div className="flex size-12 items-center justify-center rounded-full border border-border"><Zap aria-hidden="true" /></div>}
            <div><h3 className="font-semibold">{resultado === "success" ? "Conexión verificada" : "Probemos que todo funcione"}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{resultado === "success" ? "Encontramos leads y el bridge ya está preparado para usarlos." : "Vamos a hacer una prueba sin cambiar ni borrar nada de tu sistema."}</p></div>
            {resultado === "success" ? <p className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm"><strong>12 leads</strong> encontrados en la respuesta</p> : <Button type="button" className="rounded-2xl" onClick={() => setResultado("success")}><Zap className="size-4" aria-hidden="true" />Probar conexión</Button>}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-2xl" onClick={paso === 0 ? cerrar : () => setPaso((actual) => actual - 1)}> {paso === 0 ? "Cancelar" : "Atrás"}</Button>
          {paso < 2 ? <Button type="button" className="rounded-2xl" onClick={() => setPaso((actual) => actual + 1)}>{paso === 0 ? "Continuar" : "Guardar y continuar"}<ChevronRight className="size-4" aria-hidden="true" /></Button> : <Button type="button" className="rounded-2xl" onClick={cerrar} disabled={resultado !== "success"}>Finalizar</Button>}
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
