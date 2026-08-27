# 20 — Graphify: grafo de contexto arquitectónico

> **Estado:** vigente.
>
> Guía operativa de instalación, extracción y actualización de Graphify en
> este repositorio. Complementa, no reemplaza, la política obligatoria de
> `.claude/CLAUDE.md` (sección `## Graphify`), que define cuándo usar
> Graphify frente a CodeGraph. Este documento cubre el **cómo**: instalar,
> generar el grafo por primera vez y mantenerlo actualizado.
>
> Graphify es una herramienta **local, por worktree, no versionada en git**
> (`graphify-out/` está en `.gitignore`). No hay watcher ni auto-sync: la
> actualización es manual y queda a criterio de quien la ejecuta — humano o
> agente IA. Este documento existe para que ese criterio sea explícito.

---

## 1. Qué es y quién lo consulta

[Graphify](https://github.com/Graphify-Labs/graphify) construye un grafo de
conocimiento (AST vía tree-sitter + clustering Leiden) que unifica código,
esquema SQL y documentación en una sola estructura consultable. Se diferencia
de CodeGraph (mandatorio globalmente, primer punto de parada para preguntas
de un símbolo puntual) en dos ejes que este proyecto sí usa:

- Unifica **código + migraciones Prisma/SQL + docs** en un solo grafo.
  CodeGraph no indexa `.sql`.
- Da un **explorador visual** (`graph.html`) pensado para humanos —
  CodeGraph es agent-query-only, sin visualización.

Regla de convivencia (ya fijada en `.claude/CLAUDE.md`): CodeGraph sigue
siendo la parada obligatoria para lookups de un símbolo, call paths o blast
radius. Graphify se usa para orientación arquitectónica ("qué módulos/
comunidades existen", "qué conecta con X entre servicios"), todo lo que
toque migraciones/esquema SQL, y exploración visual.

---

## 2. Prerrequisitos

| Requisito | Verificación |
|---|---|
| `uv` instalado (gestor de paquetes Python) | `uv --version` |
| Acceso a `pacman`/gestor del sistema si `uv` no está | Arch/CachyOS: `sudo pacman -Syu` (sync completo, nunca upgrade parcial) antes de `sudo pacman -S uv` |
| Repo en un worktree git real (no `/tmp`) | `git rev-parse --show-toplevel` |

No hace falta API key para uso local: `graphify-mcp` (transporte `stdio`,
el que usa un agente local) no requiere login. `--api-key` solo aplica si el
grafo se expone en modo `--transport http` para acceso de equipo — no es el
default y no está configurado en este proyecto.

---

## 3. Instalación (una sola vez por worktree)

```bash
# 1. Instalar el binario (entorno aislado, no toca el resto del sistema)
uv tool install graphifyy
# Instala graphifyy==0.9.50 + gramáticas tree-sitter.
# Binarios resultantes: `graphify`, `graphify-mcp`.

# 2. Confirmar la instalación
graphify --version
uv tool list | rg graphify
```

**Antes de extraer nada**, confirmar que `graphify-out/` está en
`.gitignore` (ya lo está en este repo, mismo grupo que `.codegraph/`). Si
estás creando un worktree nuevo del proyecto, replicá esa línea antes del
primer `extract` — el grafo es un índice derivado por worktree, nunca se
commitea ni se mergea entre ramas.

```bash
rg -n "graphify-out" .gitignore   # debe existir
```

⚠️ **Nunca ejecutar** `graphify install` ni `graphify claude install`. Esos
comandos escriben automáticamente en `CLAUDE.md` y registran un hook
`PreToolUse`, lo que choca con los bloques gestionados por gentle-ai que ya
existen en este archivo. La única integración autorizada es la sección
`## Graphify` manual de `.claude/CLAUDE.md`.

---

## 4. Generar el grafo por primera vez

```bash
# Extracción de código — 100% local, gratis (sin LLM), determinística
graphify extract . --code-only
```

Esto recorre el repo respetando `.gitignore` y produce `graphify-out/`
(`graph.json`, `cache/`). Para este proyecto (backend Express+Prisma +
frontend React+shadcn) el resultado esperado ronda ~430 archivos, ~2400
nodos, ~6000 edges, ~150 comunidades — si el número da muy por debajo,
revisar que no se esté corriendo desde un subdirectorio equivocado.

```bash
# Reporte + explorador visual (gratis — sin --no-label salta el naming LLM)
graphify cluster-only . --no-label
```

Genera `GRAPH_REPORT.md` y `graph.html`. Las comunidades quedan con nombre
placeholder ("Community N") hasta que se les ponga nombre explícitamente
(paso opcional, sección 6).

**Sanity check recomendado** después de cualquier extracción nueva o
reinstalación:

```bash
graphify god-nodes --top 8          # deben aparecer hubs reales del proyecto
graphify diagnose multigraph        # 0 dangling, 0 duplicates esperado
```

---

## 5. Actualización manual tras cambios (obligatorio, sin automatismo)

Graphify **no** tiene watcher ni auto-sync — a diferencia de CodeGraph, que
sincroniza solo. Quien implemente un cambio de código es responsable de
volver a extraer. Regla simple:

> **Toda vez que se implementen cambios reales de código (no solo
> exploración), correr la re-extracción antes de dar por cerrado el work
> unit.**

```bash
graphify extract . --code-only
```

- Es incremental y gratis: usa fingerprint por contenido, así que solo
  reprocesa los archivos que cambiaron, no el corpus completo.
- Si un run previo dejó archivos sin parsear (por ejemplo, tras agregar una
  gramática tree-sitter nueva), forzar con `--force`.
- No hace falta volver a correr `cluster-only` en cada cambio chico; el
  `graph.json` ya queda al día para consultas (`graphify query`,
  `graphify explain`, `codegraph`-style lookups). Regenerar
  `GRAPH_REPORT.md`/`graph.html` solo cuando alguien vaya a abrir el
  explorador visual.

Puntos de disparo concretos en el flujo de este repo:

| Momento | Acción |
|---|---|
| Al cerrar una tarea `apply` de SDD (`sdd-apply` terminó de escribir código) | `graphify extract . --code-only` |
| Al cerrar un bloque completo (`sdd-archive`) | `graphify extract . --code-only` + `graphify cluster-only . --no-label` (refrescar reporte/visual) |
| Al agregar/quitar archivos completos (nuevo módulo, borrado de legacy) | `graphify extract . --code-only --force` si algo quedó sin indexar |
| Antes de pedirle a un agente IA orientación arquitectónica sobre un módulo recién tocado | Verificar que el último `extract` sea posterior al último commit local relevante; si no, correrlo primero |

---

## 6. Nombrar comunidades (opcional, cuesta tokens — no automatizar)

`cluster-only` sin `--no-label` llama a un backend LLM para poner nombre
legible a cada comunidad Leiden. **Esto cuesta tokens reales** y no debe
correrse en cada draft. Reservarlo para checkpoints de archivo SDD (una vez
por bloque, cuando spec/design ya están cerrados):

```bash
graphify cluster-only . --backend claude-cli
```

`--backend claude-cli` reusa el binario `claude` local (sin API key
separada). Costo de referencia observado en este proyecto: ~150 comunidades
en 2 llamadas LLM (batch de 100), ~326K tokens de entrada / ~7K de salida.

No usar `graphify extract ./docs` (extracción semántica de documentación,
también LLM-costing) fuera de esos mismos checkpoints de archivo.

---

## 7. Consultar el grafo

```bash
# Orientación / hubs arquitectónicos
graphify god-nodes --top 10
graphify query "qué conecta con TenantContext entre servicios"
graphify explain "runAsBypassJob"

# Exploración visual (para humanos)
xdg-open graphify-out/graph.html
bat graphify-out/GRAPH_REPORT.md   # o el lector de markdown que prefieras
```

Para un agente IA en este mismo repo, `graphify-mcp` (stdio) queda
disponible como servidor MCP local sin configuración de credenciales
adicional — seguir el orden de la sección `## Graphify` de
`.claude/CLAUDE.md` para decidir si la pregunta la resuelve CodeGraph o
Graphify.

---

## 8. Reglas para un agente IA que opere sobre este repo

1. CodeGraph sigue siendo la parada obligatoria para símbolo puntual, call
   path o blast radius — no reemplazar ese orden por Graphify.
2. Usar Graphify para orientación de módulo nuevo, todo lo que toque
   `.sql`, y cuando el usuario pida explícitamente exploración visual.
3. Re-extraer (`graphify extract . --code-only`) después de escribir código
   real, no después de solo leer o explorar. Es gratis; no hay excusa para
   dejarlo desactualizado.
4. Nunca correr `cluster-only` sin `--no-label` ni `extract ./docs` sin que
   el usuario lo pida explícitamente o sea un checkpoint de archivo SDD —
   ambos cuestan tokens LLM reales.
5. Nunca correr `graphify install` / `graphify claude install` /
   `graphify uninit` — son comandos de ciclo de vida/instalación
   automática, no de consulta.
6. `graphify-out/` nunca se commitea ni se fuerza con `git add`; si aparece
   en `git status`, es una señal de que `.gitignore` se rompió, no de que
   haya que agregarlo.

---

## 9. Limitaciones conocidas (no resueltas, no ocultar)

- **Migraciones SQL**: los `.sql` de Prisma no se indexan por defecto —
  falta la dependencia opcional `tree_sitter_sql`. Si se necesitan nodos de
  esquema SQL en el grafo, instalar el extra correspondiente
  (`graphifyy[sql]`) antes de repetir el `extract`.
- **Escritura concurrente**: no hay documentado un mecanismo de lock nativo
  para `graph.json` bajo escritura simultánea de múltiples agentes. Mientras
  el grafo sea por worktree (un agente por worktree, que es el modelo actual
  del proyecto), el riesgo es bajo; si en el futuro se comparte un grafo
  entre agentes concurrentes en el mismo worktree, resolver el locking antes
  de habilitarlo, no asumirlo seguro.
- **Sin equivalente al watcher de CodeGraph**: toda actualización es manual
  por diseño de esta guía (sección 5) — no hay sincronización automática que
  cubra un `extract` salteado.

---

## 10. Referencias

- Política de uso (cuándo Graphify vs CodeGraph): `.claude/CLAUDE.md`,
  sección `## Graphify`.
- Repositorio upstream: [github.com/Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify).
- Salida generada: `graphify-out/` (gitignored, no es fuente de verdad
  versionada — es un índice derivado, regenerable en cualquier momento desde
  el código real).
