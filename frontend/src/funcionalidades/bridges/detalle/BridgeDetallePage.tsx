import { useParams } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { AvisoBridge } from "../AvisoBridge";
import { evaluarAvisoBridge, formatFecha } from "../bridges.utils";
import { RED_SOCIAL_ETIQUETAS } from "../catalogos";
import { EstadoBridgeBadge } from "../EstadoBridgeBadge";
import { useBridgeDetalle } from "../useBridges";
import { BitacoraErrores } from "./BitacoraErrores";
import { CredencialBridgeForm } from "./CredencialBridgeForm";
import { CuentasPublicitariasList } from "./CuentasPublicitariasList";
import { PruebaConexionBoton } from "./PruebaConexionBoton";

/**
 * Detalle de un bridge (F8, docs/07 -- solo administrador, ruta protegida en
 * `router.tsx`). Mock en memoria -- ver `bridges.api.ts`.
 */
export function BridgeDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { data: bridge, isLoading, isError, error, refetch } = useBridgeDetalle(id ?? "");

  usePageHeader(
    bridge ? { title: bridge.nombre, backTo: { label: "Bridges", href: "/bridges" } } : null,
  );

  if (!id) {
    return <ErrorState message="Falta el identificador del bridge en la URL." />;
  }

  if (isLoading) {
    return <LoadingState rows={5} rowHeight="h-16" />;
  }

  if (isError || !bridge) {
    return (
      <ErrorState
        message={error ? getErrorMessage(error) : "No se encontró el bridge solicitado."}
        onRetry={() => void refetch()}
      />
    );
  }

  const aviso = evaluarAvisoBridge(bridge);

  return (
    <div className="flex flex-col gap-4">
      <AvisoBridge nombre={bridge.nombre} aviso={aviso} />

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{RED_SOCIAL_ETIQUETAS[bridge.redSocial]}</span>
          <EstadoBridgeBadge estado={bridge.estado} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Último lead recibido</dt>
          <dd className="text-foreground">
            {bridge.ultimoLeadEn ? formatFecha(bridge.ultimoLeadEn) : "Nunca"}
          </dd>

          <dt className="text-muted-foreground">Expiración de token</dt>
          <dd className="text-foreground">
            {bridge.tokenExpiraEn ? formatFecha(bridge.tokenExpiraEn) : "No expira"}
          </dd>
        </dl>

        <PruebaConexionBoton bridgeId={bridge.id} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Credenciales</h2>
        <CredencialBridgeForm bridge={bridge} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Cuentas publicitarias asociadas</h2>
        <CuentasPublicitariasList bridgeId={bridge.id} cuentas={bridge.cuentasPublicitarias} />
      </section>

      <BitacoraErrores bridgeId={bridge.id} />
    </div>
  );
}
