import { useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/componentes/states/LoadingState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { NivelBridgeLog } from "@/tipos/bridge";
import type { BridgeLogsFiltros } from "../bridges.api";
import { formatFecha } from "../bridges.utils";
import { NIVEL_LOG_ETIQUETAS } from "../catalogos";
import { NivelLogBadge } from "../NivelLogBadge";
import { useBridgeLogs } from "../useBridges";

/** Sentinela para "todos" en el filtro de nivel (Radix Select no admite `value=""`), mismo criterio que `leads.utils.ts::FILTRO_TODOS`. */
const FILTRO_TODOS = "TODOS";

interface BitacoraFiltrosState {
  nivel: NivelBridgeLog | typeof FILTRO_TODOS;
  /** ISO `YYYY-MM-DD` o cadena vacía. */
  fechaDesde: string;
  fechaHasta: string;
}

const FILTROS_VACIOS: BitacoraFiltrosState = { nivel: FILTRO_TODOS, fechaDesde: "", fechaHasta: "" };

const NIVELES: NivelBridgeLog[] = ["INFO", "ADVERTENCIA", "ERROR"];

function buildBridgeLogsQueryParams(filtros: BitacoraFiltrosState): BridgeLogsFiltros {
  const params: BridgeLogsFiltros = {};
  if (filtros.nivel !== FILTRO_TODOS) params.nivel = filtros.nivel;
  if (filtros.fechaDesde) params.fechaDesde = filtros.fechaDesde;
  if (filtros.fechaHasta) params.fechaHasta = filtros.fechaHasta;
  return params;
}

interface BitacoraErroresProps {
  bridgeId: string;
}

/** Bitácora de errores con filtro por nivel y rango de fechas (F8). */
export function BitacoraErrores({ bridgeId }: BitacoraErroresProps) {
  const [filtros, setFiltros] = useState<BitacoraFiltrosState>(FILTROS_VACIOS);
  const params = useMemo(() => buildBridgeLogsQueryParams(filtros), [filtros]);
  const { data, isLoading, isError, error, refetch } = useBridgeLogs(bridgeId, params);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Bitácora de errores</h2>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Nivel</Label>
          <Select
            value={filtros.nivel}
            onValueChange={(valor) =>
              setFiltros((actual) => ({ ...actual, nivel: valor as BitacoraFiltrosState["nivel"] }))
            }
          >
            <SelectTrigger aria-label="Nivel" className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTRO_TODOS}>Todos</SelectItem>
              {NIVELES.map((nivel) => (
                <SelectItem key={nivel} value={nivel}>
                  {NIVEL_LOG_ETIQUETAS[nivel]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="bitacora-fecha-desde" className="text-xs text-muted-foreground">
            Desde
          </Label>
          <Input
            id="bitacora-fecha-desde"
            type="date"
            value={filtros.fechaDesde}
            onChange={(event) =>
              setFiltros((actual) => ({ ...actual, fechaDesde: event.target.value }))
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="bitacora-fecha-hasta" className="text-xs text-muted-foreground">
            Hasta
          </Label>
          <Input
            id="bitacora-fecha-hasta"
            type="date"
            value={filtros.fechaHasta}
            onChange={(event) =>
              setFiltros((actual) => ({ ...actual, fechaHasta: event.target.value }))
            }
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingState rows={3} rowHeight="h-10" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="Sin entradas en la bitácora"
          description="No hay registros que coincidan con estos filtros."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Nivel</TableHead>
              <TableHead>Mensaje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{formatFecha(log.ocurridoEn)}</TableCell>
                <TableCell>
                  <NivelLogBadge nivel={log.nivel} />
                </TableCell>
                <TableCell>{log.mensaje}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
