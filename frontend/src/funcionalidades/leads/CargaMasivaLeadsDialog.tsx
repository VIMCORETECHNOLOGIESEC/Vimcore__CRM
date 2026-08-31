import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import type { CanalManual } from "./canal-manual.api";
import {
  descargarTemplateCargaMasiva,
  parsearExcelCargaMasiva,
  type ParseoExcelCargaMasiva,
} from "./carga-masiva.utils";
import { useCargaMasivaLeads } from "./useCargaMasiva";

/** Sentinel del `<Select>` de canal de lote: "sin canal" es una opción real y explícita, no simplemente vaciar el campo (Radix Select no admite `value=""`). */
const SIN_CANAL_LOTE = "sin-canal-lote";

const MENSAJE_ARCHIVO_INVALIDO =
  "No se pudo leer el archivo. Verificá que sea un Excel válido (.xlsx o .xls) y que respete las columnas del template.";

interface CargaMasivaLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canales: CanalManual[];
}

/**
 * "Carga masiva (Excel)" -- alta de leads en lote por empresa, subiendo un
 * Excel con el template fijo de columnas (backend real, ver el docblock de
 * `carga-masiva.api.ts`). Mismo guard de rol/scope que "Cargar lead manual"
 * (Administrador/Supervisor/Asesor de sesión `company`) -- vive en
 * `LeadsPage.tsx`, este componente no lo revalida.
 *
 * Flujo de varios pasos dentro del mismo diálogo:
 * 1. Descargar el template + elegir un canal para todo el lote (opcional) +
 *    subir el archivo.
 * 2. Vista previa: filas válidas/inválidas detectadas ANTES de enviar nada,
 *    para que el usuario pueda corregir el archivo si hace falta.
 * 3. Envío en tandas (progreso "Tanda X de Y…", `useCargaMasiva.ts`).
 * 4. Resumen final (creados/duplicados/fallidos) + filas con error, con el
 *    NÚMERO REAL de fila del Excel (nunca el índice del array del contrato).
 *
 * El `<Select>` de abajo (`canalLoteId`) elige el canal DEFAULT para todo el
 * lote. El template del Excel también trae una columna `canalManualId`
 * opcional (`carga-masiva.utils.ts::CARGA_MASIVA_COLUMNAS`) para pisar ese
 * default fila por fila -- este diálogo no ofrece un selector por fila
 * (tendría que ser dentro de la vista previa), el override es exclusivamente
 * vía esa columna del Excel.
 *
 * `empresaId` sale de `useVistaEmpresa().empresaVistaId` -- mismo criterio
 * que el resto de las pantallas holding-wide del bloque
 * (`ReportesPage`/`UsuariosPage`/`OportunidadesPage`/`BridgesPage`): `undefined`
 * para una sesión `company` normal (el backend real usa la empresa de la
 * sesión), con valor solo cuando un actor holding-wide está mirando una
 * empresa puntual vía `?empresaId=`. Este diálogo hoy solo se monta desde
 * `LeadsPage.tsx` para sesión `company` (`empresaId` de sesión, nunca
 * `useVistaEmpresa`) -- este wiring queda listo para cuando ese alcance se
 * amplíe, sin requerir otro cambio acá.
 */
export function CargaMasivaLeadsDialog({ open, onOpenChange, canales }: CargaMasivaLeadsDialogProps) {
  const canalesActivos = canales.filter((c) => c.activo);
  const { ejecutar, enviando, progreso, resultado, reiniciar } = useCargaMasivaLeads();
  const { empresaVistaId } = useVistaEmpresa();

  const [canalLoteId, setCanalLoteId] = useState(SIN_CANAL_LOTE);
  const [parseo, setParseo] = useState<ParseoExcelCargaMasiva | null>(null);
  const [errorParseo, setErrorParseo] = useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);

  function reiniciarTodo() {
    setParseo(null);
    setErrorParseo(null);
    setNombreArchivo(null);
    reiniciar();
  }

  async function handleArchivoChange(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    // Limpia el input para poder volver a elegir el mismo archivo tras corregirlo.
    event.target.value = "";
    if (!archivo) return;

    setErrorParseo(null);
    setNombreArchivo(archivo.name);
    try {
      const resultadoParseo = await parsearExcelCargaMasiva(archivo);
      setParseo(resultadoParseo);
    } catch {
      setParseo(null);
      setErrorParseo(MENSAJE_ARCHIVO_INVALIDO);
    }
  }

  async function handleCargar() {
    if (!parseo || parseo.validas.length === 0) return;
    await ejecutar(
      parseo.validas,
      canalLoteId === SIN_CANAL_LOTE ? undefined : canalLoteId,
      empresaVistaId ?? undefined,
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        if (!abierto) reiniciarTodo();
        onOpenChange(abierto);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Carga masiva de leads</DialogTitle>
          <DialogDescription>
            Subí un Excel con varios leads a la vez, sin cargarlos uno por uno.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Button type="button" variant="outline" onClick={descargarTemplateCargaMasiva}>
            Descargar template
          </Button>

          {!resultado ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="carga-masiva-canal-lote">Canal del lote (opcional)</Label>
                <Select value={canalLoteId} onValueChange={setCanalLoteId} disabled={enviando}>
                  <SelectTrigger id="carga-masiva-canal-lote" aria-label="Canal del lote">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_CANAL_LOTE}>Sin canal para el lote</SelectItem>
                    {canalesActivos.map((canal) => (
                      <SelectItem key={canal.id} value={canal.id}>
                        {canal.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se aplica a todos los leads del archivo que no traigan su propio canal en la
                  columna opcional "canalManualId" del template.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="carga-masiva-archivo">Archivo Excel</Label>
                <input
                  id="carga-masiva-archivo"
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={enviando}
                  onChange={(event) => void handleArchivoChange(event)}
                  className="text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
                {nombreArchivo ? (
                  <p className="text-xs text-muted-foreground">Archivo elegido: {nombreArchivo}</p>
                ) : null}
                {errorParseo ? <p className="text-sm text-destructive">{errorParseo}</p> : null}
              </div>

              {parseo ? (
                <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <p className="text-sm text-foreground">
                    {parseo.validas.length} fila{parseo.validas.length === 1 ? "" : "s"} válida
                    {parseo.validas.length === 1 ? "" : "s"} · {parseo.invalidas.length} fila
                    {parseo.invalidas.length === 1 ? "" : "s"} inválida
                    {parseo.invalidas.length === 1 ? "" : "s"}
                  </p>
                  {parseo.invalidas.length > 0 ? (
                    <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto text-xs text-destructive">
                      {parseo.invalidas.map((fila) => (
                        <li key={fila.filaExcel}>
                          Fila {fila.filaExcel}: {fila.motivoInvalida}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {enviando && progreso ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Enviando tanda {progreso.tandaActual} de {progreso.totalTandas}…
                </p>
              ) : null}
            </>
          ) : (
            <ResumenCargaMasiva resultado={resultado} onCargarOtroArchivo={reiniciarTodo} />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            {resultado ? "Cerrar" : "Cancelar"}
          </Button>
          {!resultado ? (
            <Button
              type="button"
              disabled={!parseo || parseo.validas.length === 0 || enviando}
              onClick={() => void handleCargar()}
            >
              {enviando
                ? "Cargando…"
                : `Cargar ${parseo?.validas.length ?? 0} lead${parseo?.validas.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ResumenCargaMasivaProps {
  resultado: NonNullable<ReturnType<typeof useCargaMasivaLeads>["resultado"]>;
  onCargarOtroArchivo: () => void;
}

function ResumenCargaMasiva({ resultado, onCargarOtroArchivo }: ResumenCargaMasivaProps) {
  const filasConError = resultado.resultados.filter((r) => r.estado === "error");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <p>
          Solicitados: <strong>{resultado.resumen.solicitados}</strong>
        </p>
        <p>
          Creados: <strong>{resultado.resumen.creados}</strong>
        </p>
        <p>
          Duplicados: <strong>{resultado.resumen.duplicados}</strong>
        </p>
        <p>
          Fallidos: <strong>{resultado.resumen.fallidos}</strong>
        </p>
      </div>

      {filasConError.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">Filas con error (corregí y reintentá)</p>
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm text-destructive">
            {filasConError.map((fila) => (
              <li key={fila.filaExcel}>
                Fila {fila.filaExcel}: {fila.motivo}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button type="button" variant="outline" onClick={onCargarOtroArchivo}>
        Cargar otro archivo
      </Button>
    </div>
  );
}
