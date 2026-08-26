# Línea gráfica ARCANO CRM — análisis y propuesta

Instancia de cliente: **ARCANO Holding**. Este documento registra el análisis
del logo fuente, la paleta extraída y verificada por contraste WCAG, y la
propuesta de tokens para reemplazar la paleta neutra actual (`docs/09-linea-
grafica-frontend.md`) sin tocar estructura ni funcionalidad del front.

Assets originales en este mismo directorio:
- `arcano-holding-logo-original.png` — logo compuesto completo, copia archivada.
- `arcano-isotipo-shield.png` / `-transparente.png` — isotipo (escudo + flecha) extraído, fondo blanco/transparente.
- `arcano-wordmark.png` — "ARCANO HOLDING" en texto, extraído aparte.

---

## 1. Análisis del logo fuente

Logo compuesto de 2 elementos: **isotipo** (escudo con flecha diagonal
ascendente) + **wordmark** ("ARCANO" serif metálico + "HOLDING" en versalitas
espaciadas). Render 3D metálico, gradiente de dos metales:

- **Grafito/peltre** (lado izquierdo del escudo): gris cálido oscuro, no un
  gris neutro puro.
- **Oro/bronce** (lado derecho del escudo + flecha + wordmark completo): del
  bronce profundo al oro claro brillante.

**Lectura simbólica** (para justificar qué se conserva): escudo = protección/
solidez, flecha diagonal ascendente = crecimiento — vocabulario visual típico
de una marca de holding/inversión. El CRM adopta el **isotipo completo**
(escudo+flecha, es una sola figura, no separable) como ícono de marca; el
wordmark "ARCANO HOLDING" no se usa tal cual (es del holding, no del
producto) — se propone texto propio "ARCANO CRM" en la tipografía del propio
producto (Inter), no el render 3D metálico del logo fuente.

---

## 2. Paleta extraída (muestreo real, no estimado)

Método: cuantización median-cut (Pillow) sobre los píxeles no-blancos del
isotipo recortado — 16 colores dominantes, no aproximación visual. Los tokens
propuestos abajo son valores planos derivados de esas muestras (ver detalle
de muestras en el historial de esta sesión), no los píxeles crudos del
render metálico, que no funcionan como color plano de UI.

| Token propuesto | Hex | Origen | Uso previsto |
|---|---|---|---|
| `--arcano-graphite-900` | `#241F1B` | lado grafito del escudo, oscurecido para servir de `--primary` | Reemplaza `--primary` (#111113 actual) — botones, texto, foco |
| `--arcano-graphite-700` | `#4D4B46` | muestra directa (grafito medio) | Texto secundario sobre fondo claro |
| `--arcano-gold` | `#B98A4E` | entre `#BD8A53`/`#A08463` muestreados | Acento: bordes, íconos, isotipo, glow |
| `--arcano-gold-deep` | `#6B4A25` | oscurecido desde `#79634A`/`#644C33` muestreados | Texto/label sobre fondo claro cuando se necesita contraste AA de texto |
| `--arcano-gold-tint` | `#F3E4C9` | aclarado desde `#EDC38B`/`#FCECCE` muestreados | Fondo sutil de tarjetas/badges con texto oscuro encima |

**Sin cambios** (fuera de alcance, business-critical): `--semaforo-frio/
tibio/caliente` (verde/ámbar/rojo), `--success`, `--warning`, `--destructive`.
El semáforo es lógica de negocio con significado fijo — no es un color
decorativo de marca.

---

## 3. Verificación de contraste (WCAG 2.1, fórmula de luminancia relativa)

| Par | Ratio | AA texto (4.5:1) | AA UI/texto grande (3:1) |
|---|---|---|---|
| `graphite-900` sobre blanco | 16.32:1 | ✅ | ✅ |
| `graphite-700` sobre blanco | 8.71:1 | ✅ | ✅ |
| `gold-deep` sobre blanco | 7.98:1 | ✅ | ✅ |
| `gold` (#B98A4E) sobre blanco | 3.08:1 | ❌ | ✅ |
| blanco sobre `graphite-900` | 16.32:1 | ✅ | ✅ |
| blanco sobre `gold-deep` | 7.98:1 | ✅ | ✅ |
| blanco sobre `gold` | 3.08:1 | ❌ | ✅ (solo componentes/texto grande) |
| `graphite-900` sobre `gold` | 5.29:1 | ✅ | ✅ |
| `graphite-900` sobre `gold-tint` | 10.30:1 | ✅ | ✅ |

**Regla de uso derivada de esta tabla** (obligatoria, no opcional): `--arcano-
gold` nunca lleva texto blanco encima en tamaño de párrafo ni se usa como
color de texto sobre blanco — falla AA texto. Sirve para bordes, íconos,
fondos de chip/badge con texto oscuro encima, y glows — exactamente los usos
que ya tiene hoy `--warning`/`--success` en este proyecto (íconos y acentos,
nunca superficies grandes de texto). Donde se necesite texto o botón con
buen contraste en tono dorado, usar `--arcano-gold-deep`, no `--arcano-gold`.

`--arcano-graphite-900` reemplaza a `--primary` sin ninguna pérdida de
contraste (16.32:1 vs 18.86:1 del negro actual — ambos exceden AAA de sobra).

---

## 4. Alcance de esta propuesta

- **Se mantiene intacta**: toda la estructura de componentes, rutas,
  lógica de negocio, semáforo, y el resto de `docs/09-linea-grafica-
  frontend.md` (radios, tipografía Inter, densidad).
- **Cambia**: los tokens de color de marca (`--primary` y el nuevo par
  `--arcano-gold*`), y se agrega el isotipo como ícono de marca en
  `LoginPage.tsx` (hoy sin logo, solo texto "CRM Embudo de Leads") y
  `Sidebar.tsx` (ídem).
- **Estado**: propuesta visual (ver mockup de pantallas reales adjunto),
  pendiente de aprobación antes de tocar `frontend/src/index.css` o
  cualquier componente en vivo.
- **Respaldo**: `frontend-plantilla/` (raíz del repo, sin commitear todavía)
  es una copia congelada del front neutro actual, previa a cualquier cambio
  de marca — punto de rollback si se necesita volver a la línea gráfica
  genérica para otro cliente.
