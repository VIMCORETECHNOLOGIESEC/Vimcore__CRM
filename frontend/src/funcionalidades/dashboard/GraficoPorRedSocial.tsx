import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RED_SOCIAL_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { MetricasPorRedSocial } from "@/tipos/metricas";
import { getColorCategorico, ORDEN_REDES_SOCIALES } from "./paleta";

interface GraficoPorRedSocialProps {
  datos: MetricasPorRedSocial[];
}

interface Fila {
  etiqueta: string;
  total: number;
  tasaConversion: MetricasPorRedSocial["tasaConversion"];
  color: string;
}

/** 3.1 Leads por red social: barras verticales, conteo agrupado (docs/08 §3.1). Tasa de conversión de cada red en el tooltip. */
export function GraficoPorRedSocial({ datos }: GraficoPorRedSocialProps) {
  const porRedSocial = new Map(datos.map((d) => [d.redSocial, d]));
  const filas: Fila[] = ORDEN_REDES_SOCIALES.flatMap((redSocial, indice) => {
    const metrica = porRedSocial.get(redSocial);
    if (!metrica) return [];
    return [
      {
        etiqueta: RED_SOCIAL_ETIQUETAS[redSocial],
        total: metrica.total,
        tasaConversion: metrica.tasaConversion,
        color: getColorCategorico(indice),
      },
    ];
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={filas} barSize={36} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="etiqueta" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
        <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} content={<TooltipRedSocial />} />
        <Bar dataKey="total" radius={[4, 4, 0, 0]}>
          {filas.map((fila) => (
            <Cell key={fila.etiqueta} fill={fila.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TooltipRedSocial({ active, payload }: { active?: boolean; payload?: { payload: Fila }[] }) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{fila.etiqueta}</p>
      <p className="text-muted-foreground">{fila.total} leads</p>
      <p className="text-muted-foreground">
        Conversión: {fila.tasaConversion.porcentaje} % ({fila.tasaConversion.numerador} de{" "}
        {fila.tasaConversion.denominador})
      </p>
    </div>
  );
}
