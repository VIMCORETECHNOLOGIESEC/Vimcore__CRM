import { Link } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { ETAPA_OPORTUNIDAD_ETIQUETAS } from "@/funcionalidades/oportunidades/catalogos";
import { NuevaOportunidadButton } from "@/funcionalidades/oportunidades/NuevaOportunidadButton";
import { useOportunidades } from "@/funcionalidades/oportunidades/useOportunidades";
import type { Oportunidad } from "@/tipos/oportunidad";

const FORMATO_MONTO = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

function nombreResponsable(oportunidad: Oportunidad): string {
  return oportunidad.vendedor?.nombre ?? oportunidad.asesor?.nombre ?? "Sin asignar";
}

function OportunidadCard({ oportunidad }: { oportunidad: Oportunidad }) {
  return (
    <Link
      to={`/oportunidades/${oportunidad.id}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {oportunidad.producto?.nombre ?? "Sin producto"}
        </span>
        <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {ETAPA_OPORTUNIDAD_ETIQUETAS[oportunidad.etapa]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          Responsable: <span className="text-foreground">{nombreResponsable(oportunidad)}</span>
        </span>
        {oportunidad.montoVenta != null ? (
          <span className="tabular-nums">
            Monto: <span className="text-foreground">{FORMATO_MONTO.format(oportunidad.montoVenta)}</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}

interface OportunidadesLeadTabProps {
  leadId: string;
}

/**
 * Tab "Oportunidad" del workspace de detalle del lead (F4). Muestra las
 * oportunidades ya existentes del lead (`GET /oportunidades?leadId=`) y
 * expone el alta (`NuevaOportunidadButton`) también acá, porque con el chat
 * de WhatsApp abierto el botón externo de `LeadDetallePage.tsx` queda tapado
 * por el overlay de pantalla completa -- este tab es el acceso alternativo,
 * no un reemplazo.
 *
 * No reusa `OportunidadesTable.tsx` (pensada para listados paginados
 * completos con columnas fijas): acá el volumen esperado es 0-1
 * oportunidades por lead, así que unas tarjetas simples alcanzan.
 */
export function OportunidadesLeadTab({ leadId }: OportunidadesLeadTabProps) {
  const { esVistaSoloLectura } = useVistaEmpresa();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useOportunidades({ leadId, pagina: 1, limite: 25 });

  return (
    <div className="flex flex-col gap-4">
      {esVistaSoloLectura ? null : <NuevaOportunidadButton leadId={leadId} />}

      {isLoading ? <LoadingState rows={2} rowHeight="h-20" /> : null}

      {!isLoading && isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : null}

      {!isLoading && !isError && data && data.oportunidades.length === 0 ? (
        <EmptyState
          title="Sin oportunidades"
          description="Este lead todavía no tiene oportunidades registradas."
        />
      ) : null}

      {!isLoading && !isError && data && data.oportunidades.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.oportunidades.map((oportunidad) => (
            <li key={oportunidad.id}>
              <OportunidadCard oportunidad={oportunidad} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
