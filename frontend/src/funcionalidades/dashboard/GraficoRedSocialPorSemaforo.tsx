import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RED_SOCIAL_ETIQUETAS, SEMAFORO_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { RedSocialPorSemaforo } from "@/tipos/metricas";
import { PALETA_SEMAFORO } from "./paleta";

interface GraficoRedSocialPorSemaforoProps {
  datos: RedSocialPorSemaforo[];
}

/**
 * 3.5 Red social × semáforo (docs/08 §3.5): barras apiladas, eje X = red
 * social, segmentos = color del semáforo (paleta de semáforo, no la
 * categórica -- son colores de negocio con significado fijo, no series
 * arbitrarias). Es la gráfica clave del cliente: de qué red llegan los
 * leads con más probabilidad de cierre, no solo de cuál llegan más.
 * % de leads verdes sobre el total de cada red, en el tooltip.
 */
export function GraficoRedSocialPorSemaforo({ datos }: GraficoRedSocialPorSemaforoProps) {
  const filas = datos.map((d) => ({ ...d, etiqueta: RED_SOCIAL_ETIQUETAS[d.redSocial] }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={filas} barSize={36} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="etiqueta" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
        <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipRedSocialSemaforo />} />
        <Legend
          formatter={(value: string) =>
            SEMAFORO_ETIQUETAS[value as keyof typeof SEMAFORO_ETIQUETAS] ?? value
          }
        />
        {/*
          `stroke="#fff"` con `strokeWidth={2}` simula el gap de 2px entre
          segmentos apilados que pide la skill de dataviz -- Recharts no
          soporta un gap real entre segmentos de una misma barra apilada
          (siempre son rects contiguos), el trazo blanco es el sustituto
          visual estándar para esa librería.
        */}
        <Bar dataKey="verde" name="VERDE" stackId="semaforo" fill={PALETA_SEMAFORO.VERDE} stroke="#fff" strokeWidth={2} />
        <Bar dataKey="amarillo" name="AMARILLO" stackId="semaforo" fill={PALETA_SEMAFORO.AMARILLO} stroke="#fff" strokeWidth={2} />
        <Bar dataKey="rojo" name="ROJO" stackId="semaforo" fill={PALETA_SEMAFORO.ROJO} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TooltipRedSocialSemaforo({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RedSocialPorSemaforo & { etiqueta: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.etiqueta}</p>
      <p className="text-muted-foreground">Verde: {fila.verde}</p>
      <p className="text-muted-foreground">Amarillo: {fila.amarillo}</p>
      <p className="text-muted-foreground">Rojo: {fila.rojo}</p>
      <p className="text-muted-foreground">% verde sobre el total: {fila.porcentajeVerde} %</p>
    </div>
  );
}
