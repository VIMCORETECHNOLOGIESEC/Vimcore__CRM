import { useParams } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { AvisoBridge } from "../AvisoBridge";
import { evaluarAvisoBridge, formatFecha, proximaExpiracionTokenBridge } from "../bridges.utils";
import { RED_SOCIAL_ETIQUETAS } from "../catalogos";
import { EstadoBridgeBadge } from "../EstadoBridgeBadge";
import { useBridgeDetalle } from "../useBridges";
import { BitacoraErrores } from "./BitacoraErrores";
import { CredencialBridgeForm } from "./CredencialBridgeForm";
import { CuentasPublicitariasList } from "./CuentasPublicitariasList";

/**
 * Detalle de un bridge (F8, docs/07 -- solo administrador, ruta protegida en
 * `router.tsx`). Backend real -- ver `bridges.api.ts`.
 *
 * La prueba de conexión ya no se muestra acá a nivel de bridge: el backend
 * real la resuelve POR CUENTA PUBLICITARIA
 * (`POST /bridges/:id/cuentas/:cuentaId/probar-conexion`), así que vive
 * ahora por cada fila de `CuentasPublicitariasList` -- ver el gap de
 * contrato documentado en `bridges.api.ts`.
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
  const proximaExpiracion = proximaExpiracionTokenBridge(bridge);

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

          {/* No lee `bridge.tokenExpiraEn` (constante muerta a nivel bridge, ver `tipos/bridge.ts`) --
              la fecha real vive por cuenta publicitaria, ver el detalle exacto en cada fila más abajo. */}
          <dt className="text-muted-foreground">Expiración de token más próxima</dt>
          <dd className="text-foreground">
            {proximaExpiracion ? formatFecha(proximaExpiracion) : "No expira"}
          </dd>
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Credenciales</h2>
        <CredencialBridgeForm bridge={bridge} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Cuentas publicitarias asociadas</h2>
        <CuentasPublicitariasList
          bridgeId={bridge.id}
          redSocial={bridge.redSocial}
          cuentas={bridge.cuentasPublicitarias}
        />
      </section>

      <BitacoraErrores bridgeId={bridge.id} />
    </div>
  );
}
