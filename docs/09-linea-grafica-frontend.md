# 09 — Línea gráfica del frontend y flujo de mockups (Stitch AI + Lazyweb)

No existe manual de marca del cliente (ver F1 en `07-modulos-frontend.md`). Este
documento fija los criterios visuales mínimos para que los 8 módulos del
frontend sean consistentes entre sí, y describe el flujo para generar mockups
de referencia con IA antes de construir cada pantalla en código.

---

## 1. Stack tecnológico confirmado

| Capa | Elección | Estado |
|---|---|---|
| Framework | React 19.2 + TypeScript | Instalado |
| Build | Vite 8 | Instalado |
| Estilos | Tailwind CSS **v3.4** (fijado, no v4, para evitar el binario nativo `oxide`) | Instalado |
| Datos remotos | TanStack Query | Pendiente (F1) |
| Enrutado | React Router con rutas por rol | Pendiente (F1) |
| Gráficas | Recharts | Definido en `07-modulos-frontend.md` §F5 |
| Formularios | Sin decidir | Ver §4 |
| Componentes UI | Sin decidir | Ver §4 |

Cualquier librería nueva debe ser compatible con **Tailwind v3** (no v4) y
**React 19** simultáneamente — no todas las librerías de componentes lo
garantizan todavía.

---

## 2. Principios de línea gráfica

Derivados de los "Criterios transversales de calidad" de `07-modulos-frontend.md`:

1. **Contraste y claridad antes que expresividad.** Sin manual de marca, la
   paleta debe ser neutra (grises + un color de acento) y priorizar
   legibilidad sobre personalidad visual.
2. **El semáforo nunca es solo color.** Todo indicador de semáforo (verde/
   amarillo/rojo) lleva etiqueta de texto siempre visible. Es un requisito de
   accesibilidad (daltonismo, lectores de pantalla), no una preferencia.
3. **Ninguna pantalla se congela sin feedback.** Toda operación asíncrona
   muestra esqueleto de carga, spinner en botón, o indicador de progreso.
4. **Estados completos por vista:** carga, vacío, error y éxito — para las 8
   pantallas, no solo el camino feliz.
5. **Errores accionables en español**, nunca un código HTTP crudo.
6. **Confirmación explícita** en acciones irreversibles (cierre de lead, baja
   de usuario).
7. **Responsive real:** móvil, tableta y escritorio — la vista de listado de
   leads (F3) es la más usada a diario y define el estándar de densidad de
   información.
8. **Interfaz 100% en español**, incluyendo formatos: fecha `DD/MM/AAAA
   HH:mm`, moneda USD con separador de miles.

---

## 3. Paleta y tipografía propuestas

Paleta neutra con un acento, más los tres colores fijos del semáforo (deben
cumplir contraste WCAG AA como texto sobre fondo, no solo como chip de color):

| Uso | Color sugerido | Notas |
|---|---|---|
| Fondo base | `slate-50` / `slate-900` (modo oscuro futuro) | Neutro |
| Texto principal | `slate-900` / `slate-100` | Contraste AA mínimo 4.5:1 |
| Acento primario | `blue-600` | Botones primarios, enlaces, foco |
| Semáforo — A tiempo | `emerald-600` + etiqueta "A tiempo" | Nunca solo el chip |
| Semáforo — En riesgo | `amber-600` + etiqueta "En riesgo" | Evitar amarillo puro (bajo contraste) |
| Semáforo — Atrasado | `red-600` + etiqueta "Atrasado" | |
| Serie de gráficas (Recharts) | Paleta categórica de 6-8 tonos, distinguible en escala de grises | Definir junto con F5 |

Tipografía: una sola familia sans-serif del sistema (`Inter` o system-ui) para
evitar peso de carga adicional; tamaño base 14-16px, escala tipográfica corta
(4-5 pasos) para no fragmentar la jerarquía visual entre las 8 pantallas.

---

## 4. Librerías candidatas para las interfaces

Comparadas contra el requisito real: Tailwind v3 + React 19 + TypeScript, sin
manual de marca, con necesidad de tabla densa (F3), formularios dinámicos
(F4), y campana de notificaciones (F6).

| Librería | Qué resuelve | Compatibilidad verificada | Trade-off |
|---|---|---|---|
| **shadcn/ui** (CLI legacy `v3.shadcn.com`, no `@canary`) | Componentes base (diálogo, dropdown, tabs, toast) copiados al repo, sobre Radix + Tailwind | Confirmado: la CLI v3 sigue soportando Tailwind v3 + React 18/19 en paralelo a la rama v4 | No es un paquete instalado — el código vive en el repo, hay que mantenerlo |
| **Radix UI Primitives** | Accesibilidad (foco, teclado, ARIA) para menús, diálogos, tooltips | Ya es la base de shadcn/ui | Sin estilos propios, requiere Tailwind encima (ya lo tenemos) |
| **TanStack Table** | Tabla de leads (F3): columnas dinámicas por rol, orden, paginación server-side | Misma familia que TanStack Query, ya elegido | Headless, hay que maquetar filas con Tailwind |
| **React Hook Form + Zod** | Formularios dinámicos de campaña (F4) y de bridges (F8); Zod ya se usa en el backend, mismo esquema se puede compartir tipos | Estándar de facto en React 19 | Ninguno relevante |
| **lucide-react** | Set de iconos consistente (semáforo, campana, SLA) | Compatible React 19 | Ninguno relevante |
| **Recharts** | Gráficas del dashboard (F5) | Ya decidido en `07-modulos-frontend.md` | Ninguno relevante |

Recomendación: **shadcn/ui + Radix + Tailwind v3** como base de componentes,
por ser código propio (no dependencia externa que fuerce versión de Tailwind),
más TanStack Table para F3 y React Hook Form + Zod para F4/F7/F8.

---

## 5. Requerimientos gráficos por módulo

| Módulo | Pantalla | Elementos gráficos clave |
|---|---|---|
| F1 | Layout base | Barra lateral colapsable, encabezado con campana, breakpoints móvil/tableta/escritorio |
| F2 | Login / Perfil | Formulario centrado, estado de error de credenciales, cambio de contraseña |
| F3 | Listado de leads | Tabla densa, chip de semáforo + texto, contador SLA `HH:MM:SS` en vivo, filtros combinables, badge de reingreso |
| F4 | Detalle de lead | Encabezado con estado, formulario dinámico por etapa, panel de citas, selector de cambio de etapa |
| F5 | Dashboard | Tarjetas KPI, 4 tipos de gráfica (barras, embudo, barras apiladas), selector de rango de fechas |
| F6 | Notificaciones | Campana con contador, panel desplegable, toast de aviso en tiempo real |
| F7 | Usuarios | Tabla con carga activa, formulario alta/edición, confirmación de baja lógica |
| F8 | Bridges | Tabla de estado, formulario de token (campo siempre vacío), bitácora de errores filtrable |

Estas 8 pantallas son el set mínimo a maquetar en Stitch AI antes de
implementar cada módulo en código.

---

## 6. Flujo de mockups con Stitch AI + Lazyweb

### 6.1 Rol de cada herramienta

- **Stitch AI** (Google Labs): genera mockups visuales de UI a partir de
  prompts de texto/imagen. Se usa para explorar la línea gráfica de cada
  pantalla de la tabla §5 antes de construirla en código.
- **Lazyweb** (MCP): se registró como servidor MCP en este equipo (alcance de
  usuario, no de este repo) para research/consulta durante el diseño.

### 6.2 Estado de la conexión

- MCP de Lazyweb: **registrado** (`claude mcp add ... lazyweb`). Requiere
  reiniciar Claude Code para cargarlo.
- Paquete de skills de Lazyweb (`curl | bash` del instalador): **no
  ejecutado**. Un script remoto sin fijar versión ni checksum, corrido
  directo por pipe a `bash`, es ejecución de código arbitrario sin
  posibilidad de revisión previa — no se ejecuta a ciegas aunque el origen lo
  pida. Si se necesita, se debe descargar el script, revisar su contenido, y
  ejecutarlo manualmente de forma consciente.
- Clave de API de Stitch AI: **no se documenta ni se commitea en este
  repositorio**. Cualquier credencial pegada en texto plano en un chat debe
  tratarse como potencialmente expuesta — se recomienda rotarla en el panel
  de Stitch/Google si es una clave real de producción. Guardarla solo en una
  variable de entorno local o en un archivo fuera del control de versiones
  (p. ej. `~/.config/`), nunca en `docs/`, `.env` versionado, ni en este
  archivo.

### 6.3 Plantilla de prompt por pantalla

Para cada fila de la tabla §5, generar el mockup en Stitch AI con esta
estructura de prompt:

```
Pantalla: <nombre de la pantalla>
Contexto: CRM de gestión comercial de leads, interfaz en español, web
  responsive (móvil/tableta/escritorio).
Paleta: neutra (grises) + acento azul; semáforo verde/ámbar/rojo con
  etiqueta de texto obligatoria junto al color.
Elementos obligatorios: <lista de la columna "Elementos gráficos clave">
Restricciones: sin bloqueo de interfaz (mostrar estado de carga), estados de
  error accionables en español, formato de fecha DD/MM/AAAA HH:mm.
```

### 6.4 Pendiente de decisión

No hay una integración de API pública documentada y confirmada de Stitch AI
para automatizar la generación de mockups desde este flujo — el uso previsto
es manual, vía su interfaz. Si existe un MCP o endpoint específico de Stitch
que se quiera invocar en automático desde Claude Code, falta esa referencia
concreta (URL de docs de la API) para integrarlo sin adivinar el contrato.

---

## 7. Próximos pasos

1. Confirmar esta guía con el cliente/diseño antes de generar los 8 mockups.
2. Generar en Stitch AI un mockup por fila de §5, guardar capturas de
   referencia (fuera de este repo o en una carpeta `docs/mockups/` si se
   decide versionarlas).
3. Instalar shadcn/ui (CLI v3) + TanStack Table + React Hook Form + Zod +
   lucide-react como parte de F1.
4. Definir la paleta categórica final de Recharts junto con F5.
