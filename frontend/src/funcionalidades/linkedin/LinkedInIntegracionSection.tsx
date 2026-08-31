import { RefreshCw, Zap } from "lucide-react";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import type {
  EstadoLinkedInConexion,
  LinkedInConexion,
  LinkedInFuente,
  LinkedInFuenteTipoLead,
} from "@/tipos/linkedin";
import {
  useDescubrirFuentesLinkedIn,
  useIniciarOAuthLinkedIn,
  useLinkedInConexion,
  useLinkedInFuentes,
  useProbarConexionLinkedIn,
  useToggleFuenteLinkedIn,
} from "./useLinkedIn";

const ESTADO_CONEXION_CLASES: Record<EstadoLinkedInConexion, string> = {
  ACTIVA: "border-green-200 bg-green-50 text-green-800",
  TOKEN_EXPIRADO: "border-amber-200 bg-amber-50 text-amber-800",
  REVOCADA: "border-red-200 bg-red-50 text-red-800",
  ERROR: "border-red-200 bg-red-50 text-red-800",
};

const ESTADO_CONEXION_ETIQUETAS: Record<EstadoLinkedInConexion, string> = {
  ACTIVA: "Conectado",
  TOKEN_EXPIRADO: "Token expirado",
  REVOCADA: "Revocado",
  ERROR: "Error",
};

/** `TOKEN_EXPIRADO`/`REVOCADA`/`ERROR` todos requieren volver a pasar por el Paso 1 -- solo cambia la etiqueta del botón. */
const ESTADOS_QUE_REQUIEREN_RECONEXION: readonly EstadoLinkedInConexion[] = [
  "TOKEN_EXPIRADO",
  "REVOCADA",
  "ERROR",
];

const TIPO_LEAD_ETIQUETAS: Record<LinkedInFuenteTipoLead, string> = {
  SPONSORED: "Lead Gen Form patrocinado",
  EVENT: "Evento",
  COMPANY: "Página de empresa",
  ORGANIZATION_PRODUCT: "Producto de organización",
};

const ESTADO_SUSCRIPCION_CLASES: Record<LinkedInFuente["estadoSuscripcion"], string> = {
  PENDIENTE: "border-slate-200 bg-slate-50 text-slate-600",
  ACTIVA: "border-green-200 bg-green-50 text-green-800",
  ERROR: "border-red-200 bg-red-50 text-red-800",
  REVOCADA: "border-red-200 bg-red-50 text-red-800",
};

const ESTADO_SUSCRIPCION_ETIQUETAS: Record<LinkedInFuente["estadoSuscripcion"], string> = {
  PENDIENTE: "Pendiente",
  ACTIVA: "Activa",
  ERROR: "Error",
  REVOCADA: "Revocada",
};

interface LinkedInIntegracionSectionProps {
  bridgeId: string;
}

/**
 * Sección de LinkedIn Lead Sync dentro de `BridgeDetallePage` -- reemplaza
 * (para un bridge `redSocial: "LINKEDIN"`) a `CredencialBridgeForm`/
 * `CuentasPublicitariasList`, que son específicos del modelo de cuentas
 * publicitarias de Meta (Facebook/Instagram) y nunca aplicaron de verdad a
 * LinkedIn -- ver `bridges/catalogos.ts::REDES_CON_INTEGRACION_TOKEN_CONECTADA`
 * para el gap de contrato que esto cierra. LinkedIn Lead Sync tiene su
 * propio modelo (`LinkedInConexion`/`LinkedInFuente`, bridge-scoped, sin
 * cuenta publicitaria) -- ver `docs/contrato-frontend-linkedin-api_mat_05.md`.
 *
 * Dos bloques: estado de conexión (Pasos 1-4) y gestión de fuentes
 * (Pasos 5-7). Las fuentes solo se consultan si ya hay una conexión activa
 * (`enabled` implícito por el render condicional de abajo) -- sin conexión,
 * `GET /bridges/:id/linkedin/fuentes` no tiene nada útil que mostrar.
 */
export function LinkedInIntegracionSection({ bridgeId }: LinkedInIntegracionSectionProps) {
  const { data: conexion, isLoading, isError, error, refetch } = useLinkedInConexion(bridgeId);

  if (isLoading) {
    return <LoadingState rows={2} rowHeight="h-14" />;
  }

  if (isError) {
    return <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />;
  }

  // `data` de TanStack Query es `T | undefined` hasta que resuelve -- ya
  // descartado arriba (`isLoading`/`isError`), así que a esta altura solo
  // podría quedar `undefined` por una carrera de tipos que TS no reduce
  // automáticamente sin chequear `isSuccess`; `?? null` normaliza ese caso
  // imposible en runtime al mismo estado "sin conexión" que ya maneja
  // `ConexionLinkedIn`, nunca crashea.
  const conexionResuelta = conexion ?? null;

  return (
    <div className="flex flex-col gap-4">
      <ConexionLinkedIn bridgeId={bridgeId} conexion={conexionResuelta} />
      {conexionResuelta && conexionResuelta.estado === "ACTIVA" ? (
        <FuentesLinkedIn bridgeId={bridgeId} />
      ) : null}
    </div>
  );
}

interface ConexionLinkedInProps {
  bridgeId: string;
  conexion: LinkedInConexion | null;
}

function ConexionLinkedIn({ bridgeId, conexion }: ConexionLinkedInProps) {
  const iniciarOAuth = useIniciarOAuthLinkedIn(bridgeId);
  const probarConexion = useProbarConexionLinkedIn(bridgeId);

  const requiereReconexion = conexion !== null && ESTADOS_QUE_REQUIEREN_RECONEXION.includes(conexion.estado);
  const esErrorReconexion =
    iniciarOAuth.error instanceof ApiError &&
    (iniciarOAuth.error.code === "linkedin_token_expirado" ||
      iniciarOAuth.error.code === "linkedin_reconexion_requerida");

  return (
    <div className="flex flex-col gap-3">
      {conexion === null ? (
        <p className="text-sm text-muted-foreground">
          Este bridge todavía no tiene ninguna conexión de LinkedIn establecida.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${ESTADO_CONEXION_CLASES[conexion.estado]}`}
          >
            {ESTADO_CONEXION_ETIQUETAS[conexion.estado]}
          </span>
          {conexion.estado === "ACTIVA" ? (
            <span className="text-xs text-muted-foreground">
              Scopes: {conexion.scopes.join(", ")}
            </span>
          ) : null}
        </div>
      )}

      {iniciarOAuth.isError ? (
        <ErrorState
          message={
            esErrorReconexion
              ? "La conexión con LinkedIn venció y necesita reconectarse."
              : getErrorMessage(iniciarOAuth.error)
          }
          onRetry={() => iniciarOAuth.mutate()}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {conexion === null || requiereReconexion ? (
          <Button
            type="button"
            disabled={iniciarOAuth.isPending}
            onClick={() => iniciarOAuth.mutate()}
          >
            {iniciarOAuth.isPending
              ? "Conectando…"
              : conexion === null
                ? "Conectar LinkedIn"
                : "Reconectar LinkedIn"}
          </Button>
        ) : null}

        {conexion !== null && conexion.estado === "ACTIVA" ? (
          <Button
            type="button"
            variant="outline"
            disabled={probarConexion.isPending}
            onClick={() => probarConexion.mutate()}
          >
            <Zap className="size-4" aria-hidden="true" />
            {probarConexion.isPending ? "Probando conexión…" : "Probar conexión"}
          </Button>
        ) : null}

        {probarConexion.data ? (
          <span className={`text-sm ${probarConexion.data.conectado ? "text-green-700" : "text-destructive"}`}>
            {probarConexion.data.conectado
              ? "Conexión verificada correctamente"
              : "No se pudo verificar la conexión"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface FuentesLinkedInProps {
  bridgeId: string;
}

function FuentesLinkedIn({ bridgeId }: FuentesLinkedInProps) {
  const { data: fuentes, isLoading, isError, error, refetch } = useLinkedInFuentes(bridgeId);
  const descubrirFuentes = useDescubrirFuentesLinkedIn(bridgeId);

  return (
    <section aria-labelledby="linkedin-fuentes-title" className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="linkedin-fuentes-title" className="text-sm font-semibold text-foreground">
          Fuentes de leads
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={descubrirFuentes.isPending}
          onClick={() => descubrirFuentes.mutate()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {descubrirFuentes.isPending ? "Descubriendo…" : "Descubrir fuentes"}
        </Button>
      </div>

      {descubrirFuentes.isError ? (
        <ErrorState message={getErrorMessage(descubrirFuentes.error)} onRetry={() => descubrirFuentes.mutate()} />
      ) : null}

      {isLoading ? <LoadingState rows={2} rowHeight="h-14" /> : null}

      {isError ? <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} /> : null}

      {!isLoading && !isError && fuentes && fuentes.length === 0 ? (
        <EmptyState
          title="Sin fuentes descubiertas todavía"
          description="Usá «Descubrir fuentes» para traer las cuentas patrocinadas y organizaciones disponibles desde LinkedIn."
        />
      ) : null}

      {fuentes && fuentes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {fuentes.map((fuente) => (
            <FuenteLinkedInRow key={fuente.id} bridgeId={bridgeId} fuente={fuente} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface FuenteLinkedInRowProps {
  bridgeId: string;
  fuente: LinkedInFuente;
}

/**
 * Fila de una fuente. NO optimista (contrato, paso 7): mientras
 * `toggleFuente.isPending`, se muestra "Procesando…" sin cambiar
 * `fuente.activa`/`fuente.estadoSuscripcion` -- esos valores solo cambian
 * cuando la mutación resuelve con la respuesta real del servidor (ver
 * `useToggleFuenteLinkedIn`, que solo actualiza la caché en `onSuccess`).
 */
function FuenteLinkedInRow({ bridgeId, fuente }: FuenteLinkedInRowProps) {
  const toggleFuente = useToggleFuenteLinkedIn(bridgeId);

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {fuente.nombre ?? fuente.ownerUrn}
          </span>
          <span className="text-xs text-muted-foreground">{TIPO_LEAD_ETIQUETAS[fuente.tipoLead]}</span>
          <span
            className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${ESTADO_SUSCRIPCION_CLASES[fuente.estadoSuscripcion]}`}
          >
            {ESTADO_SUSCRIPCION_ETIQUETAS[fuente.estadoSuscripcion]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Texto deliberadamente distinto de `ESTADO_SUSCRIPCION_ETIQUETAS.ACTIVA`
              ("Activa" -- estado de suscripción confirmado por LinkedIn) para no
              mostrar dos badges con el mismo texto "Activa" con significados
              distintos (este es el toggle local `fuente.activa`, la intención,
              no necesariamente ya confirmada por el servidor). */}
          <span
            className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
              fuente.activa
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {fuente.activa ? "Habilitada" : "Deshabilitada"}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={toggleFuente.isPending}
            onClick={() => toggleFuente.mutate({ fuenteId: fuente.id, activa: !fuente.activa })}
          >
            {toggleFuente.isPending ? "Procesando…" : fuente.activa ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </div>
    </li>
  );
}
