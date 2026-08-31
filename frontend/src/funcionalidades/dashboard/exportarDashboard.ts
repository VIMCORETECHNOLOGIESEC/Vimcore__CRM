import type {
  MetricasEmbudo,
  MetricasPorAsesor,
  MetricasPorCampania,
  MetricasPorRedSocial,
  RedSocialPorSemaforo,
  ResumenMetricas,
} from "@/tipos/metricas";
import type { Lead } from "@/tipos/lead";
import { fetchLeadsApi, type LeadsQueryParams } from "@/funcionalidades/leads/leads.api";
import { ETAPA_ETIQUETAS, RED_SOCIAL_ETIQUETAS } from "@/funcionalidades/leads/catalogos";
import type { MetricasFiltros } from "@/tipos/metricas";

export interface DashboardExportData {
  resumen?: ResumenMetricas;
  porRedSocial?: MetricasPorRedSocial[];
  porAsesor?: MetricasPorAsesor[];
  porCampania?: MetricasPorCampania[];
  embudo?: MetricasEmbudo;
  redSocialPorSemaforo?: RedSocialPorSemaforo[];
  leads?: Lead[];
}

export interface DashboardExportContext {
  rango: string;
  filtros: string[];
  empresa: { nombre: string; usuario: string; correo: string };
}

export async function obtenerLeadsParaExportacion(
  filtros: MetricasFiltros,
  rango: { desde: string; hasta: string } | undefined,
  onProgress?: (progreso: number) => void,
): Promise<Lead[]> {
  const params: Omit<LeadsQueryParams, "pagina" | "porPagina"> = {
    redSocial: filtros.redSocial,
    campania: filtros.campania,
    responsableId: filtros.responsableId,
    fechaDesde: rango?.desde,
    fechaHasta: rango?.hasta,
  };
  const leads: Lead[] = [];
  let pagina = 1;
  let total = 0;
  do {
    const respuesta = await fetchLeadsApi({ ...params, pagina, porPagina: 100 });
    leads.push(...respuesta.datos);
    total = respuesta.total;
    pagina += 1;
    onProgress?.(Math.min(70, Math.round((leads.length / Math.max(total, 1)) * 70)));
  } while (leads.length < total);
  return leads;
}

function escapeHtml(valor: unknown): string {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function descargarArchivo(contenido: BlobPart, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  window.setTimeout(() => {
    enlace.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function tablaHtml(titulo: string, encabezados: string[], filas: unknown[][]): string {
  if (filas.length === 0) return "";
  return `
    <section>
      <h2>${escapeHtml(titulo)}</h2>
      <table>
        <thead><tr>${encabezados.map((encabezado) => `<th scope="col">${escapeHtml(encabezado)}</th>`).join("")}</tr></thead>
        <tbody>${filas
          .map((fila) => `<tr>${fila.map((celda, indice) => `<${indice === 0 ? "th scope=\"row\"" : "td"}>${escapeHtml(celda)}</${indice === 0 ? "th" : "td"}>`).join("")}</tr>`)
          .join("")}</tbody>
      </table>
    </section>`;
}

function encabezadoReporte(contexto: DashboardExportContext): string {
  const fecha = new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  return `<header class="report-header">
    <p class="report-kicker">${escapeHtml(contexto.empresa.nombre)}</p>
    <h1>Panel ejecutivo</h1>
    <p class="report-meta"><strong>Elaborado por:</strong> ${escapeHtml(contexto.empresa.usuario)} · ${escapeHtml(contexto.empresa.correo)}</p>
    <p class="report-meta"><strong>Período:</strong> ${escapeHtml(contexto.rango)}</p>
    <p class="report-meta"><strong>Filtros:</strong> ${escapeHtml(contexto.filtros.join(" · "))}</p>
    <p class="report-meta"><strong>Generado:</strong> ${escapeHtml(fecha)}</p>
  </header>`;
}

function construirTablas(data: DashboardExportData): string {
  const tablas = [
    data.resumen
      ? tablaHtml("Resumen ejecutivo", ["Indicador", "Valor"], [
          ["Leads ingresados", data.resumen.totalIngresados.actual],
          ["Leads en gestión", data.resumen.enGestion.actual],
          ["Leads cerrados", data.resumen.cerrados.total.actual],
          ["Ventas", data.resumen.cerrados.venta.actual],
          ["No venta", data.resumen.cerrados.noVenta.actual],
          ["Conversión", `${data.resumen.tasaConversion.actual.porcentaje ?? "Sin dato"}%`],
          ["Cumplimiento SLA", `${data.resumen.cumplimientoSla.porcentaje ?? "Sin dato"}%`],
        ])
      : "",
    data.embudo
      ? tablaHtml("Embudo por etapa", ["Etapa", "Total", "Caída"], [
          ...data.embudo.pasos.map((paso) => [paso.etapa, paso.total, paso.caidaPct === null ? "-" : `${paso.caidaPct}%`]),
          ["No venta", data.embudo.noVenta, "-"],
        ])
      : "",
    tablaHtml(
      "Leads por red social",
      ["Red social", "Total", "Ventas", "No ventas", "Conversión"],
      (data.porRedSocial ?? []).map((item) => [item.redSocial, item.total, item.ventas, item.noVentas, item.tasaConversionPct === null ? "-" : `${item.tasaConversionPct}%`]),
    ),
    tablaHtml(
      "Leads por asesor",
      ["Responsable", "Total", "Ventas", "No ventas", "Conversión", "SLA"],
      (data.porAsesor ?? []).map((item) => [item.nombre, item.total, item.ventas, item.noVentas, item.tasaConversionPct === null ? "-" : `${item.tasaConversionPct}%`, item.cumplimientoSlaPct === null ? "-" : `${item.cumplimientoSlaPct}%`]),
    ),
    tablaHtml(
      "Leads por campaña",
      ["Campaña", "Red social", "Total"],
      (data.porCampania ?? []).map((item) => [item.nombreCampania, item.redSocial ?? "Sin red", item.total]),
    ),
    tablaHtml(
      "Red social por semáforo",
      ["Red social", "Total", "Rojo", "Amarillo", "Verde", "Sin calificar"],
      (data.redSocialPorSemaforo ?? []).map((item) => [item.redSocial, item.total, item.rojo, item.amarillo, item.verde, item.sinCalificar]),
    ),
    tablaHtml(
      "Lista de leads",
      ["Cliente", "Teléfono", "Etapa", "Red social", "Responsable", "Ingreso"],
      (data.leads ?? []).map((lead) => [
        lead.cliente.nombre,
        lead.cliente.telefonoOriginal,
        ETAPA_ETIQUETAS[lead.etapa],
        RED_SOCIAL_ETIQUETAS[lead.redSocial],
        lead.vendedor?.nombre ?? lead.asesor?.nombre ?? "Sin asignar",
        new Intl.DateTimeFormat("es-EC").format(new Date(lead.ingresadoEn)),
      ]),
    ),
  ];
  return tablas.join("");
}

function construirInformacionEmpresa(contexto: DashboardExportContext): string {
  return tablaHtml("Información de la empresa", ["Campo", "Detalle"], [
    ["Empresa", contexto.empresa.nombre],
    ["Responsable del informe", contexto.empresa.usuario],
    ["Correo", contexto.empresa.correo || "No disponible"],
  ]);
}

function construirGraficos(data: DashboardExportData): string {
  const grupos = [
    {
      titulo: "Leads por red social",
      items: (data.porRedSocial ?? []).map((item) => ({ etiqueta: RED_SOCIAL_ETIQUETAS[item.redSocial], valor: item.total })),
    },
    {
      titulo: "Leads por etapa",
      items: data.embudo ? [...data.embudo.pasos.map((paso) => ({ etiqueta: ETAPA_ETIQUETAS[paso.etapa], valor: paso.total })), { etiqueta: "No venta", valor: data.embudo.noVenta }] : [],
    },
  ];
  return `<div class="charts">${grupos
    .map(({ titulo, items }, indice) => {
      const maximo = Math.max(...items.map((item) => item.valor), 1);
      const alto = Math.max(170, items.length * 34 + 58);
      return `<figure class="chart">
        <figcaption><span class="figure-label">Figura ${indice + 1}</span><span class="figure-title">${escapeHtml(titulo)}</span></figcaption>
        <svg class="bar-chart" viewBox="0 0 540 ${alto}" role="img" aria-label="${escapeHtml(titulo)}">
          ${items
            .map((item, itemIndex) => {
              const y = itemIndex * 34 + 28;
              const ancho = Math.max(0, Math.round((item.valor / maximo) * 330));
              return `<text x="0" y="${y + 12}">${escapeHtml(item.etiqueta)}</text><rect x="170" y="${y}" width="330" height="18" fill="#e5e7eb"/><rect x="170" y="${y}" width="${ancho}" height="18" fill="#1f4e79"/><text x="510" y="${y + 13}" text-anchor="end">${item.valor}</text>`;
            })
            .join("")}
        </svg>
        <p class="figure-note">Nota. Total de leads registrados para el período y filtros seleccionados.</p>
      </figure>`;
    })
    .join("")}</div>`;
}

function conclusion(data: DashboardExportData): string {
  const resumen = data.resumen;
  if (!resumen) return "No hay datos suficientes para emitir una conclusión.";
  const conversion = resumen.tasaConversion.actual.porcentaje;
  const sla = resumen.cumplimientoSla.porcentaje;
  return `Durante el período analizado ingresaron ${resumen.totalIngresados.actual} leads y se registraron ${resumen.cerrados.venta.actual} ventas. La tasa de conversión fue ${conversion === null ? "no disponible" : `${conversion}%`} y el cumplimiento del SLA fue ${sla === null ? "no disponible" : `${sla}%`}. Estos resultados deben interpretarse junto con los filtros y el detalle de leads incluidos en este informe.`;
}

function nombreArchivo(extension: string): string {
  return `panel-ejecutivo-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export function descargarExcel(data: DashboardExportData, contexto: DashboardExportContext) {
  const filas: unknown[][] = [
    ["Panel ejecutivo"],
    ["Empresa", contexto.empresa.nombre],
    ["Responsable del informe", contexto.empresa.usuario],
    ["Correo", contexto.empresa.correo || "No disponible"],
    ["Período", contexto.rango],
    ["Filtros", contexto.filtros.join(" | ")],
    [],
    ["Resumen ejecutivo", "Valor"],
    ...(data.resumen
      ? [
          ["Leads ingresados", data.resumen.totalIngresados.actual],
          ["Leads en gestión", data.resumen.enGestion.actual],
          ["Leads cerrados", data.resumen.cerrados.total.actual],
          ["Ventas", data.resumen.cerrados.venta.actual],
          ["No venta", data.resumen.cerrados.noVenta.actual],
          ["Conversión", `${data.resumen.tasaConversion.actual.porcentaje ?? "Sin dato"}%`],
          ["Cumplimiento SLA", `${data.resumen.cumplimientoSla.porcentaje ?? "Sin dato"}%`],
        ]
      : [["Sin datos", ""]]),
    [],
    ["Leads por red social", "Total", "Ventas", "No ventas", "Conversión"],
    ...(data.porRedSocial ?? []).map((item) => [item.redSocial, item.total, item.ventas, item.noVentas, item.tasaConversionPct === null ? "-" : `${item.tasaConversionPct}%`]),
    [],
    ["Leads por asesor", "Total", "Ventas", "No ventas", "Conversión", "SLA"],
    ...(data.porAsesor ?? []).map((item) => [item.nombre, item.total, item.ventas, item.noVentas, item.tasaConversionPct === null ? "-" : `${item.tasaConversionPct}%`, item.cumplimientoSlaPct === null ? "-" : `${item.cumplimientoSlaPct}%`]),
    [],
    ["Leads por campaña", "Red social", "Total"],
    ...(data.porCampania ?? []).map((item) => [item.nombreCampania, item.redSocial ?? "Sin red", item.total]),
    [],
    ["Red social por semáforo", "Total", "Rojo", "Amarillo", "Verde", "Sin calificar"],
    ...(data.redSocialPorSemaforo ?? []).map((item) => [item.redSocial, item.total, item.rojo, item.amarillo, item.verde, item.sinCalificar]),
    [],
    ["Lista de leads"],
    ["Cliente", "Teléfono", "Etapa", "Red social", "Responsable", "Ingreso"],
    ...(data.leads ?? []).map((lead) => [lead.cliente.nombre, lead.cliente.telefonoOriginal, ETAPA_ETIQUETAS[lead.etapa], RED_SOCIAL_ETIQUETAS[lead.redSocial], lead.vendedor?.nombre ?? lead.asesor?.nombre ?? "Sin asignar", new Intl.DateTimeFormat("es-EC").format(new Date(lead.ingresadoEn))]),
    [],
    ["Conclusión", conclusion(data)],
  ];
  const contenido = filas.map((fila) => fila.map((celda) => `"${String(celda ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  descargarArchivo(`\ufeff${contenido}`, nombreArchivo("csv"), "text/csv;charset=utf-8");
}

export function descargarPdf(data: DashboardExportData, contexto: DashboardExportContext, ventanaAbierta?: Window | null) {
  const ventana = ventanaAbierta ?? window.open("", "_blank");
  if (!ventana) return;
  ventana.opener = null;

  ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Panel ejecutivo</title><style>
    @page { size: A4; margin: 25.4mm; }
    body { color: #18181b; font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 2; }
    body { counter-reset: page; }
    .title-page { align-items: center; display: flex; flex-direction: column; height: 220mm; justify-content: center; page-break-after: always; text-align: center; }
    .title-page h1 { font-size: 12pt; font-weight: 700; line-height: 2; margin: 0 0 24px; }
    .title-page p { margin: 0; }
    .report-header { margin-bottom: 26px; }
    .report-kicker { color: #52525b; font-size: 10pt; letter-spacing: .08em; line-height: 1.5; text-transform: uppercase; }
    h1 { font-size: 16pt; line-height: 2; margin: 0 0 8px; }
    h2 { font-size: 12pt; line-height: 2; margin: 22px 0 3px; }
    .report-meta { color: #52525b; line-height: 1.5; margin: 2px 0; }
    table { width: 100%; border: 1px solid #64748b; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #94a3b8; padding: 5px 8px; text-align: left; vertical-align: top; line-height: 1.5; }
    thead th { background: #e2e8f0; border: 1px solid #334155; font-weight: 700; }
    tbody th { background: #f8fafc; font-weight: 400; }
    section { break-inside: avoid; }
    .report-note { color: #52525b; font-size: 10pt; font-style: italic; line-height: 1.5; }
    .chart { break-inside: avoid; margin: 10px 0 18px; }
    .chart figcaption { margin-bottom: 6px; }
    .figure-label, .figure-title { display: block; }
    .figure-label { font-weight: 700; }
    .figure-title { font-style: italic; }
    .bar-chart { display: block; font-family: "Times New Roman", Times, serif; font-size: 11pt; max-width: 100%; }
    .figure-note { font-size: 10pt; font-style: italic; line-height: 1.5; margin: 4px 0 0; }
    @media print { footer { position: fixed; bottom: -12mm; right: 0; font-size: 10pt; } }
  </style></head><body><section class="title-page"><h1>Panel ejecutivo: informe de gestión comercial</h1><p>${escapeHtml(contexto.empresa.nombre)}</p><p>${escapeHtml(contexto.empresa.usuario)}</p><p>${escapeHtml(contexto.rango)}</p></section>${encabezadoReporte(contexto)}${construirInformacionEmpresa(contexto)}<h2>Gráficos</h2>${construirGraficos(data)}${construirTablas(data)}<h2>Conclusión</h2><p>${escapeHtml(conclusion(data))}</p><p class="report-note">Nota. Los datos corresponden a los filtros seleccionados al momento de la descarga.</p><footer>Panel ejecutivo</footer></body></html>`);
  ventana.document.close();
  ventana.addEventListener("afterprint", () => ventana.close(), { once: true });
  ventana.focus();
  ventana.print();
}
