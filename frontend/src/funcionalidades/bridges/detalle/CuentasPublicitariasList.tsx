import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import type { CuentaPublicitariaBridge, EstiloAutenticacionBridge } from "@/tipos/bridge";
import type { RedSocial } from "@/tipos/lead";
import {
  type EstadoTokenCuentaDisplay,
  evaluarEstadoTokenCuenta,
  formatFecha,
} from "../bridges.utils";
import { ESTILO_AUTENTICACION_POR_RED, REDES_CON_INTEGRACION_TOKEN_CONECTADA } from "../catalogos";
import { useToggleCuentaActiva } from "../useBridges";
import { PruebaConexionBoton } from "./PruebaConexionBoton";
import { TokenForm } from "./TokenForm";

/**
 * Color y etiqueta por estado de token de una cuenta puntual (F8, detalle
 * por cuenta -- ver `bridges.utils.ts::evaluarEstadoTokenCuenta` para la
 * lógica real). Componente de presentación puro, sin lógica -- no requiere
 * test unitario per AGENTS.md §5, mismo criterio que `EstadoBridgeBadge.tsx`.
 */
const ESTADO_TOKEN_CUENTA_CLASES: Record<EstadoTokenCuentaDisplay, string> = {
  TOKEN_EXPIRADO: "border-red-200 bg-red-50 text-red-800",
  ERROR_VERIFICACION: "border-red-200 bg-red-50 text-red-800",
  TOKEN_PROXIMO_A_VENCER: "border-amber-200 bg-amber-50 text-amber-800",
  TOKEN_VALIDO: "border-green-200 bg-green-50 text-green-800",
};

const ESTADO_TOKEN_CUENTA_ETIQUETAS: Record<EstadoTokenCuentaDisplay, string> = {
  TOKEN_EXPIRADO: "Token expirado",
  ERROR_VERIFICACION: "Error de verificación",
  TOKEN_PROXIMO_A_VENCER: "Token próximo a vencer",
  TOKEN_VALIDO: "Token vigente",
};

interface CuentasPublicitariasListProps {
  bridgeId: string;
  /** Decide qué controles de credencial se muestran por fila -- ver `CredencialesCuenta`. */
  redSocial: RedSocial;
  cuentas: CuentaPublicitariaBridge[];
}

/**
 * Cuentas publicitarias asociadas al bridge (F8, "Detalle con cuentas
 * publicitarias asociadas"). Activar/desactivar se agrega porque
 * `docs/05-bridges.md` §7 lo documenta explícitamente ("Alta y baja de
 * cuentas publicitarias") aunque el checklist de docs/07 solo pide
 * mostrarlas.
 *
 * GAP DE CONTRATO CONFIRMADO (integración bridges.api.ts, 2026-08-19): el
 * backend real administra el token y la prueba de conexión POR CUENTA
 * PUBLICITARIA (`POST /bridges/:id/cuentas/:cuentaId/token` y
 * `.../probar-conexion`), no por bridge -- por eso `TokenForm`/
 * `PruebaConexionBoton` se renderizan POR CADA FILA acá, en vez de una sola
 * vez en `BridgeDetallePage` (que solo tenía `bridgeId`). Un bridge sin
 * cuentas no puede mostrar ningún control de token porque no hay ninguna
 * fila donde renderizarlo -- el `EmptyState` de abajo ya cubre ese caso sin
 * necesidad de una rama adicional.
 *
 * No hay alta de cuentas nuevas: no está en ningún checklist de frontend y
 * requeriría decidir de dónde saldría el `idExterno` (¿un catálogo que trae
 * el backend desde la plataforma? ¿texto libre?) -- fuera de alcance de
 * este cambio, señalado para no inventarlo.
 */
export function CuentasPublicitariasList({ bridgeId, redSocial, cuentas }: CuentasPublicitariasListProps) {
  const estilo = ESTILO_AUTENTICACION_POR_RED[redSocial];

  if (cuentas.length === 0) {
    return (
      <EmptyState
        title="Sin cuentas publicitarias asociadas"
        description="Este bridge todavía no tiene ninguna cuenta vinculada."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {cuentas.map((cuenta) => (
        <CuentaPublicitariaRow
          key={cuenta.id}
          bridgeId={bridgeId}
          cuenta={cuenta}
          estilo={estilo}
          redSocial={redSocial}
        />
      ))}
    </ul>
  );
}

interface CuentaPublicitariaRowProps {
  bridgeId: string;
  cuenta: CuentaPublicitariaBridge;
  estilo: EstiloAutenticacionBridge;
  redSocial: RedSocial;
}

/**
 * Fila individual de una cuenta publicitaria. Instancia su propio
 * `useToggleCuentaActiva` (en vez de recibirlo izado desde
 * `CuentasPublicitariasList`) para que el `isPending` de activar/desactivar
 * sea independiente por fila -- una única mutación compartida por todas las
 * filas dejaba deshabilitados los botones de TODAS las cuentas del bridge
 * mientras cualquiera de ellas tenía una petición en curso, aunque cada
 * cuenta es independiente. `TokenForm`/`PruebaConexionBoton` ya reciben
 * `cuentaId` como parámetro de sus propios hooks y ya tenían este
 * aislamiento correctamente.
 */
function CuentaPublicitariaRow({ bridgeId, cuenta, estilo, redSocial }: CuentaPublicitariaRowProps) {
  const toggleActiva = useToggleCuentaActiva(bridgeId);
  const estadoToken = evaluarEstadoTokenCuenta(cuenta);

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">{cuenta.nombre}</span>
          <span className="text-xs text-muted-foreground">ID externo: {cuenta.idExterno}</span>
          {cuenta.instagramAccountId ? (
            <span className="text-xs text-muted-foreground">
              Instagram vinculado: {cuenta.instagramAccountId}
            </span>
          ) : null}
          <span
            className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${ESTADO_TOKEN_CUENTA_CLASES[estadoToken]}`}
          >
            {ESTADO_TOKEN_CUENTA_ETIQUETAS[estadoToken]}
            {cuenta.tokenExpiraEn ? ` · vence ${formatFecha(cuenta.tokenExpiraEn)}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
              cuenta.activa
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {cuenta.activa ? "Activa" : "Inactiva"}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={toggleActiva.isPending}
            onClick={() => toggleActiva.mutate({ cuentaId: cuenta.id, activa: !cuenta.activa })}
          >
            {cuenta.activa ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </div>

      {estilo === "TOKEN_PROVEEDOR" ? (
        <CredencialesCuenta bridgeId={bridgeId} cuentaId={cuenta.id} redSocial={redSocial} />
      ) : null}
    </li>
  );
}

interface CredencialesCuentaProps {
  bridgeId: string;
  cuentaId: string;
  redSocial: RedSocial;
}

/**
 * Controles de credencial de una cuenta publicitaria `TOKEN_PROVEEDOR`. Solo
 * Facebook/Instagram tienen un adaptador real conectado del lado del
 * servidor (`REDES_CON_INTEGRACION_TOKEN_CONECTADA`, ver `catalogos.ts`
 * para el gap de contrato completo) -- el resto (hoy solo LinkedIn) muestra
 * el aviso "Fase 2" sin ofrecer un formulario que llamaría por error a la
 * verificación de Meta.
 */
function CredencialesCuenta({ bridgeId, cuentaId, redSocial }: CredencialesCuentaProps) {
  const conectada = REDES_CON_INTEGRACION_TOKEN_CONECTADA.includes(redSocial);

  if (!conectada) {
    return (
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
          Fase 2 · Proveedor OAuth no conectado todavía
        </span>
        <p className="text-xs text-muted-foreground">
          Esta cuenta todavía no tiene un adaptador de token conectado del lado del servidor.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <TokenForm bridgeId={bridgeId} cuentaId={cuentaId} />
      <PruebaConexionBoton bridgeId={bridgeId} cuentaId={cuentaId} />
    </div>
  );
}
