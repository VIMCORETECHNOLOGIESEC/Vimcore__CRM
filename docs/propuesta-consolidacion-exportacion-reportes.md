# Propuesta: consolidación de "Exportar" (Dashboard) y "Reportes"

> **Estado: PROPUESTA para decisión del usuario.** Este documento no implica
> ningún cambio de código. Nada de lo descripto acá se construye hasta que el
> usuario apruebe explícitamente una dirección — ni siquiera parcialmente.

## 1. Contexto del pedido

El usuario mostró dos capturas de pantalla del mismo producto que parecen
resolver "lo mismo" (exportar datos) desde dos lugares distintos:

1. En el **Dashboard**, un botón "Exportar" con dropdown "Datos filtrados" →
   "Descargar Excel" / "Descargar PDF".
2. Una pantalla dedicada **"Reportes"** en el sidebar de cada empresa, con
   selector de formato (PDF/Excel), filtros (período, red social, campaña,
   responsable), botón "Generar reporte" y una sección "Estado del reporte".

La pregunta a responder: ¿tiene sentido mantener ambos mecanismos, o
conviene consolidar/rediseñar? Y en paralelo: ¿cómo se le da vista previa al
PDF antes de generarlo, y cómo se mejora el alcance del Excel actual?

## 2. Diagnóstico verificado del código

No son dos implementaciones equivalentes del mismo problema — son dos
niveles de calidad y arquitectura completamente distintos. Verificado
leyendo el código fuente, no solo la documentación:

### 2.1 "Exportar" del Dashboard (`frontend/src/funcionalidades/dashboard/`)

`DashboardExportar.tsx` renderiza el botón con dropdown ("Datos filtrados" →
Excel/PDF, líneas 84-95) y llama a las funciones de
`exportarDashboard.ts`, 100% client-side, sin backend, síncrono en el
sentido de que corre en la pestaña del navegador:

- **`descargarExcel()`** (líneas 228-270): arma un array de filas y las
  serializa a texto separado por comas con `\r\n`, antepone un BOM UTF-8
  (`﻿`), y descarga con `nombreArchivo("csv")` y MIME
  `text/csv;charset=utf-8` (línea 269). **Es un CSV, no un `.xlsx`.** Está
  etiquetado como "Excel" en la UI (dropdown, `DashboardExportar.tsx` línea
  ~95) pero el archivo que produce no tiene hojas, ni estilos, ni tipos de
  celda — solo texto plano que Excel abre por asociación de MIME/extensión.
- **`descargarPdf()`** (líneas 272-308): abre una ventana en blanco
  (`window.open`), escribe un documento HTML completo con CSS de impresión
  (`@page`, estilos `@media print`) y gráficos de barra dibujados a mano en
  SVG (`construirGraficos()`, líneas 184-214), y llama a `ventana.print()`
  (línea 307). Es literalmente el diálogo "Imprimir → Guardar como PDF" del
  navegador — no hay ninguna librería de generación de PDF real (ni
  `jspdf`, ni `pdf-lib`, ni nada del lado del servidor).
- Exporta **solo los datos ya cargados/filtrados en pantalla** en ese
  momento (`obtenerLeadsParaExportacion`, con paginación hasta traer todos
  los leads del filtro activo, líneas 47-70).
- Feedback de progreso: un toast circular (`DescargaToast`,
  `DashboardExportar.tsx` líneas 28-59) — da la sensación de "trabajo" pero
  en la práctica el cuello de botella real es la paginación de leads, no la
  generación del archivo en sí (esa es instantánea).

### 2.2 Pantalla "Reportes" (`frontend/src/funcionalidades/reportes/`)

Confirmado contra `ReportesPage.tsx`, `docs/blocks/e-dashboards.md`
(sección "Exportación PDF/XLSX", línea 179+) y
`docs/23-alcance-funcional-manual-tecnico.md` (ítem 15):

- **PDF real** vía Chromium headless (Puppeteer) del lado del servidor,
  con plantilla HTML/CSS propia: portada → resumen ejecutivo → embudo →
  rendimiento por canal (CPC/CPL/CAC) → rendimiento por asesor → desglose
  por empresa si es holding-wide.
- **XLSX real** vía `exceljs` (Node), una hoja por métrica — "sin gráficos
  nativos de Excel (decisión firme)", según el propio documento de diseño.
- **Job asíncrono** (`ReporteJob` en Prisma, estados
  `PENDIENTE`/`PROCESANDO`/`LISTO`/`ERROR`) con progreso por SSE
  (`reporte.iniciado`/`reporte.listo`/`reporte.error`), persistencia del
  job, endpoint de resincronización (`GET /reportes/jobs/activo` — así
  sobrevive a un refresh de página) y descarga autenticada
  (`GET /reportes/jobs/:id/descargar`).
- Diseñado explícitamente para volumen alto: "la generación es asincrónica
  desde el diseño (Puppeteer es lento para holdings de alto volumen), no un
  parche posterior" (`docs/blocks/e-dashboards.md`, línea 257).
- Gateado a roles `ADMINISTRADOR`/`SUPERVISOR` (Asesor no tiene acceso),
  con scope empresarial siempre derivado server-side de la membresía del
  usuario, nunca del payload del cliente.
- **Gap conocido, no es tu tarea resolverlo pero es relevante para la
  decisión de UX**: las 4 métricas nuevas de Bloque E (embudo de
  Oportunidad, por producto, cascada, ranking por empresa) **no están
  conectadas todavía** ni al Excel/PDF rápido del Dashboard ni al reporte
  formal del backend (`docs/23`, línea 273: "La exportación a PDF/XLSX de
  estas métricas no está conectada todavía (deliberado, fuera de este
  ítem)"). El desglose por empresa en reportes holding-wide
  (`pdf-reporte.ts`) también sigue como TODO explícito
  (`docs/blocks/e-dashboards.md`, línea 49).

### 2.3 Conclusión del diagnóstico

No hay duplicación funcional real. Hay **dos niveles de fidelidad
distintos** sirviendo necesidades distintas:

| | Dashboard "Exportar" | "Reportes" |
|---|---|---|
| Qué es | vista rápida de lo que tengo en pantalla ahora | reporte formal generado por el servidor |
| Latencia | instantáneo (~segundos, limitado por paginar leads) | asíncrono, puede tardar (holdings grandes) |
| Formato real | CSV etiquetado como Excel; PDF vía print-to-PDF del navegador | XLSX real (`exceljs`); PDF real (Puppeteer) |
| Alcance de datos | solo lo cargado/filtrado en esa sesión | según parámetros elegidos, con auditoría server-side |
| Acceso | cualquier usuario con acceso al Dashboard | solo Administrador/Supervisor |
| Persistencia | ninguna (se descarga y se pierde) | job persistido, redescargable, recuperable tras refresh |

El problema real no es "dos mecanismos", es que **el nombre y el ícono no
comunican la diferencia de calidad**: un botón "Descargar Excel" que en
realidad es CSV, al lado de una pantalla separada que genera un XLSX real,
confunde sobre cuál es "el de verdad".

## 3. Recomendación de UX: mantener dos niveles, pero renombrar y explicar

### 3.1 Evidencia de mercado

La distinción "exportación rápida desde lo que estoy viendo" vs. "reporte
formal generado por el sistema" es un patrón establecido en herramientas de
BI y analytics, no una rareza de este producto:

- Power BI distingue explícitamente entre **"Export Data"** (una foto
  puntual del visual actual) y **"Analyze in Excel"** o una **exportación
  programada** ("scheduled export") para entrega recurrente/formal —
  "Choose Export Data for a one-off visual snapshot [...] or a scheduled
  export when you need automated, recurring delivery" — [Power BI Excel
  Export: Quick Methods and Automation
  Guide](https://blog.christiansteven.com/blog/power-bi-excel-export).
- El mismo artículo señala que cuando se necesita **auditabilidad,
  contexto narrativo o documentación de cumplimiento**, el reporte formal
  es la opción apropiada — exactamente el rol que cumple "Reportes" acá
  (rol restringido, job persistido, trazabilidad).
- Domo (BI) formaliza la distinción a nivel de producto:
  "Dashboards provide real-time, visual snapshots [...] while reports
  deliver detailed, structured analysis for historical review and
  documentation. Choose dashboards when you need to act fast; choose
  reports when you need a formal record" — [Dashboard vs Report in BI: Key
  Differences & Use
  Cases](https://www.domo.com/learn/article/dashboard-vs-report-choosing-the-right-bi-tool-for-your-data-needs).
- Un patrón híbrido común citado en guías de UX de analytics SaaS: "send a
  scheduled KPI summary report that links out to a live dashboard for
  anyone who needs to investigate further" — reforzando que ambos niveles
  coexisten a propósito en productos maduros, no por deuda técnica — [SaaS
  Analytics Dashboard UX: Real Examples & Patterns
  (2026)](https://www.saasui.design/blog/saas-analytics-reporting-dashboard-ux-patterns).

**Conclusión de la evidencia**: mantener los dos niveles es un patrón
validado, siempre que la diferencia se comunique con claridad — que hoy no
sucede en este producto (ambos se llaman "Excel"/"PDF" sin distinción de
propósito).

### 3.2 Recomendación concreta de copy/UI

No fusionar los dos mecanismos. Sí resolver la confusión de nombres:

1. **Dashboard → renombrar "Exportar" a algo que comunique "vista rápida",
   no "documento formal"**. Sugerencias: "Exportar vista actual" o
   "Descarga rápida", con subtítulo/tooltip explícito: *"Descarga
   instantánea de lo que ves en pantalla ahora. Para un reporte formal con
   más alcance, usá Reportes."* — con link directo a `/reportes`.
2. **Dashboard → corregir el mal etiquetado "Excel"**: mientras siga siendo
   CSV, renombrar el ítem del dropdown a "Descargar CSV" (honesto) o
   resolver el mal etiquetado generando un `.xlsx` real (ver sección 5).
   Nunca dejar un archivo `.csv` bajo un botón que dice "Descargar Excel" —
   es el hallazgo más accionable de este diagnóstico.
3. **Reportes → dejar explícito qué lo diferencia**: agregar copy breve en
   la cabecera de la pantalla ("Reportes formales, con más alcance y
   trazabilidad que la exportación rápida del Dashboard") para que el
   usuario entienda por qué existen dos caminos y cuándo usar cada uno.
4. **Cerrar el gap de Bloque E antes o junto con este trabajo** (fuera de
   alcance de esta propuesta, pero conviene que quien decida lo tenga
   presente): hoy ninguno de los dos mecanismos exporta las 4 métricas
   nuevas del embudo de Oportunidad — eso es un problema de completitud de
   datos, no de UX, y no lo resuelve renombrar botones.

## 4. Vista previa de PDF antes de generar

### 4.1 El camino más barato: reusar la plantilla HTML real como preview

El backend ya resuelve HTML→PDF con Puppeteer navegando a una plantilla
HTML/CSS renderizada server-side. El patrón estándar en herramientas de
reporting HTML→PDF es exactamente exponer esa misma plantilla como un
endpoint HTML independiente (sin el paso de conversión a PDF) y mostrarlo
en un `<iframe>` del lado del cliente:

> "A controller endpoint can be created that returns the report [...] For
> applications that need to switch between multiple documents without a
> full page refresh, use an iframe combined with controller endpoints" —
> [How to Preview Document or File in a Browser for
> SaaS](https://dev.to/ardasgroup/how-to-preview-document-or-file-in-a-browser-for-saas-26m2)

Aplicado a este proyecto: agregar un endpoint tipo
`GET /reportes/preview?...parametros` que devuelva el **mismo HTML** que
hoy arma la plantilla que consume Puppeteer (sin invocar Chromium headless,
solo el render HTML), y mostrarlo en un `<iframe>` dentro de
`ReportesPage.tsx` antes de confirmar "Generar reporte". Esto:

- **No duplica la plantilla** — la restricción explícita del pedido. La
  fuente de verdad del HTML sigue siendo una sola función/archivo en el
  backend; Puppeteer y el iframe de preview consumen el mismo render.
- Es instantáneo (no pasa por Chromium), a diferencia del PDF final.
- Es el mismo patrón que usan herramientas de reporting HTML→PDF
  establecidas: jsreport, por ejemplo, ofrece explícitamente un
  visor/cliente de navegador para previsualizar el mismo template antes de
  exportarlo — [jsreport Browser
  client](https://jsreport.net/learn/browser-client).

Riesgo a marcar para quien decida: el HTML de preview y el PDF final pueden
divergir levemente si Chromium interpreta el CSS de impresión (`@page`,
saltos de página, `break-inside`) distinto a como lo renderiza el iframe
del navegador del usuario — es una limitación conocida del patrón, no un
defecto de la implementación. Mitigable mostrando el preview con un
disclaimer ("vista aproximada; el PDF final respeta saltos de página y
formato de impresión con más precisión").

### 4.2 Alternativas evaluadas y descartadas

- **Duplicar la plantilla en una librería client-side** (`react-pdf`,
  `@react-pdf/renderer`, `jsPDF` armando el layout desde cero en el
  navegador): descartado porque exige mantener dos plantillas en paralelo
  (una para Puppeteer, otra para el preview), violando directamente la
  restricción del pedido de no duplicar la plantilla HTML.
- **Gotenberg u otro conversor HTML→PDF alternativo**: resuelto que
  Puppeteer ya cubre esa función server-side; no hay necesidad de
  reemplazarlo, solo de exponer su plantilla también como HTML plano para
  preview — [Gotenberg](https://gotenberg.dev/) queda mencionado como
  alternativa de stack si en algún momento se quisiera migrar el motor de
  conversión, no como solución al problema de preview.

## 5. Ampliar el alcance del Excel del Dashboard con SheetJS

### 5.1 Confirmado: SheetJS ya está en el frontend, con excepción documentada

`frontend/package.json` tiene `"xlsx": "^0.18.5"` instalado. `AGENTS.md`
§2.1 documenta la excepción (2026-08-30): se agregó para parseo de Excel en
la carga masiva de leads, "sin script de post-instalación conocido,
aprobada por decisión explícita del usuario". Ya está en el bundle del
frontend — usarlo también para escribir (no solo leer) no agrega una
dependencia nueva.

### 5.2 Qué resuelve y qué no resuelve

SheetJS (community edition, la que ya está instalada) sí puede reemplazar
el CSV actual por un `.xlsx` real:

- Múltiples hojas (`XLSX.utils.book_append_sheet`) — una por sección, en
  vez de todo en una sola tabla de texto plano.
- Tipos de celda reales (números como números, no strings con comillas),
  formato de columnas, anchos de columna.
- Genera el archivo con `XLSX.write(wb, { bookType: "xlsx", type:
  "buffer" })` o `writeFileXLSX`, 100% client-side, sin tocar el backend —
  [Writing Files | SheetJS Community
  Edition](https://docs.sheetjs.com/docs/api/write-options/).

Lo que SheetJS community edition **no** resuelve: gráficos nativos de Excel
embebidos en el archivo. Esa capacidad es exclusiva de **SheetJS Pro**
(comercial) — "SheetJS Pro offers cell/text styling, conditional
formatting and additional styling options [...] make custom sheets with
images/graphs/PivotTables" — [SheetJS vs ExcelJS vs node-xlsx
2026](https://www.pkgpulse.com/guides/sheetjs-vs-exceljs-vs-node-xlsx-excel-files-node-2026).
No se recomienda evaluar la versión Pro para este alcance: el propio
backend ya tomó la "decisión firme" de no incluir gráficos nativos en el
XLSX formal (`docs/blocks/e-dashboards.md`, línea 191-192) — mantener la
misma decisión en el export rápido del Dashboard es coherente y evita abrir
una segunda discusión de licenciamiento por una funcionalidad que el propio
proyecto ya descartó para el camino formal.

### 5.3 Propuesta concreta

- Reemplazar el cuerpo de `descargarExcel()` en `exportarDashboard.ts`
  (líneas 228-270) para construir un `Workbook` de SheetJS con una hoja por
  sección (Resumen, Embudo, Por red social, Por asesor, Por campaña,
  Semáforo, Lista de leads) en vez de concatenar todo en un array de filas
  para CSV.
- Mantener `descargarPdf()` sin cambios — no hay señal de que el
  print-to-PDF del navegador sea insuficiente para el caso de uso "vista
  rápida"; es la sección 3 (renombrar/clarificar) la que resuelve la
  confusión ahí, no una librería nueva.
- Una vez hecho esto, el ítem del dropdown puede decir honestamente
  "Descargar Excel" sin quedar mal etiquetado.

Esto es una implementación acotada de bajo riesgo (sin dependencia nueva,
sin tocar backend) — pero **no se ejecuta como parte de esta tarea**: queda
documentada acá como una de las tres decisiones que el usuario debe aprobar
antes de que cualquier sesión la implemente.

## 6. Resumen de decisiones que el usuario debe tomar

1. ¿Mantener los dos niveles (Dashboard rápido + Reportes formal) con
   copy/nombres corregidos (sección 3), o prefiere otra dirección?
2. ¿Avanzar con un endpoint de preview HTML reutilizando la plantilla de
   Puppeteer en un iframe dentro de "Reportes" (sección 4)?
3. ¿Migrar `descargarExcel()` del Dashboard de CSV a `.xlsx` real vía
   SheetJS, ya instalado (sección 5)?

Ninguna de estas tres decisiones está implementada. Este documento es
insumo para que el usuario decida cuál(es) aprobar antes de que se abra
cualquier trabajo de implementación (directo, delegado, o SDD).
