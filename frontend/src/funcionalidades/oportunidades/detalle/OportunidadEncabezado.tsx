import { Badge } from "@/components/ui/badge";
import type { Oportunidad } from "@/tipos/oportunidad";
import { ETAPA_OPORTUNIDAD_ETIQUETAS } from "../catalogos";

const FORMATO_MONTO = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

/** `DD/MM/AAAA HH:mm` en horario local del navegador (docs/07, criterios transversales). */
function formatFecha(iso: string): string {
  const fecha = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(fecha.getDate())}/${p(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

interface OportunidadEncabezadoProps {
  oportunidad: Oportunidad;
}

/**
 * Tarjeta de encabezado del detalle de una oportunidad (Bloque D). Solo
 * lectura -- muestra el estado actual (cliente, etapa, producto, responsable,
 * monto y fechas), sin controles. El responsable operativo vigente es el
 * `vendedor` si existe, si no el `asesor` (mismo criterio que
 * `OportunidadesTable`).
 */
export function OportunidadEncabezado({ oportunidad }: OportunidadEncabezadoProps) {
  const nombreCliente = oportunidad.lead.cliente.nombre || "Sin nombre";
  const responsable =
    oportunidad.vendedor?.nombre ?? oportunidad.asesor?.nombre ?? "Sin asignar";
  const producto = oportunidad.producto?.nombre ?? "Sin producto";
  const monto =
    oportunidad.montoVenta == null ? "—" : FORMATO_MONTO.format(oportunidad.montoVenta);

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4 md:p-5"
      aria-labelledby="oportunidad-encabezado-titulo"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Oportunidad
          </p>
          <h2
            id="oportunidad-encabezado-titulo"
            className="truncate text-lg font-semibold text-foreground"
          >
            {nombreCliente}
          </h2>
          <p className="text-sm text-muted-foreground">
            {oportunidad.lead.cliente.telefonoOriginal || "Sin teléfono"}
          </p>
        </div>
        <Badge variant="secondary" className="w-fit shrink-0">
          {ETAPA_OPORTUNIDAD_ETIQUETAS[oportunidad.etapa]}
        </Badge>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Producto
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{producto}</dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Responsable
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{responsable}</dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Monto
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">{monto}</dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Creada
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {formatFecha(oportunidad.creadaEn)}
          </dd>
        </div>
        {oportunidad.cerradaEn ? (
          <div className="rounded-lg border border-border p-3">
            <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Cerrada
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {formatFecha(oportunidad.cerradaEn)}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
