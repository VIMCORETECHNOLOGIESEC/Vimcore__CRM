# Handoff — desarrollo backend (retomar en otro equipo)

> Este archivo existe porque la sesión de Claude Code que hizo M3 y arrancó M4
> se quedó sin cuota. Léelo completo antes de retomar. Está en español porque
> es una nota operativa de equipo, no un artefacto SDD formal.

## 1. Cómo retomar en otro equipo

```bash
git clone git@github.com:DinnZart/crm_comercial.git
cd crm_comercial
git checkout dev-back   # ya está en origin, contiene M1+M2+M3 completos y mergeados
```

**Importante — el worktree NO viaja con git.** En la máquina original todo el
trabajo de backend se hizo en un git worktree aislado
(`crm_comercial-worktrees/m3-dev-back`) para no pisar una sesión de frontend
concurrente que usaba el checkout principal en la rama `dev-front`. Si en el
equipo nuevo también vas a correr una sesión de frontend en paralelo, recreá
el mismo patrón:

```bash
git worktree add "<repo-parent>/crm_comercial-worktrees/dev-back" dev-back
cd "<repo-parent>/crm_comercial-worktrees/dev-back"
```

Si no hay sesión de frontend concurrente, podés trabajar directo sobre el
checkout principal en `dev-back`.

**El worktree no tiene `.env`** (no versionado). Pasá las variables inline en
cada comando `docker compose` (son valores de desarrollo, no secretos reales):

```bash
POSTGRES_USER=crm_dev POSTGRES_PASSWORD=crm_dev_pw POSTGRES_DB=crm_comercial_test \
DATABASE_URL="postgresql://crm_dev:crm_dev_pw@db:5432/crm_comercial_test" \
PORT=3000 NODE_ENV=test JWT_SECRET=dev-test-secret-not-for-prod-minimum-32-characters \
JWT_ACCESS_TTL_SECONDS=900 JWT_REFRESH_TTL_SECONDS=604800 SEED_PASSWORD=DevTestPassword123! \
docker compose up -d db
```

Después, todo comando de pnpm/prisma/test corre así (AGENTS.md §2.2 —
**nunca** pnpm/node directo en el host):

```bash
docker compose run --rm backend sh -c "<comando>"
```

## 2. Reglas de proyecto que hay que conocer antes de tocar código

Leé `AGENTS.md` completo en la raíz del repo antes de cualquier fase SDD — es
obligatorio y lo dice el propio documento. Puntos que causaron fricción real
en esta sesión y que ya están resueltos, no los reabras:

- **Idioma (§3.4, corregido durante M3)**: artefactos SDD (proposal/spec/
  design/tasks) en inglés. Comentarios de código, commits y UI en español.
  Identificadores: estructura en inglés + sustantivos de dominio en español
  cuando el término ya existe en `docs/` (ej. `TelefonoNormalizado`,
  `deduplicarLead`, `VENTANA_REINGRESO_DIAS`).
- **Hook `gga`** (`.git/hooks/pre-commit`, "Gentleman Guardian Angel"):
  revisa con IA cada commit que toque `.ts/.tsx/.js/.jsx` contra `AGENTS.md`.
  Si rechaza algo, es porque el código viola la letra del documento — se
  corrige el código o (si el documento está desactualizado respecto a la
  convención real, como pasó una vez con los identificadores) se corrige
  `AGENTS.md`, nunca se bypassea con `--no-verify`.
- **Ledger nativo de intentos**: cada `sdd-apply` de una PR debe hacer
  `gentle-ai sdd-attempt acquire ...` antes de empezar y
  `gentle-ai sdd-attempt settle ...` al terminar (ver ejemplos de comandos
  reales en el historial de esta sesión si hace falta el formato exacto).

## 3. Estado M1-M3 — completo, no tocar

M1 (base/infra) y M2 (auth/usuarios) completos desde antes de esta sesión.
M3 (Normalización y deduplicación) completo en esta sesión: 9 commits en
`dev-back` (`362dd3a` … `c53099e`), 94/94 tests, `sdd-verify` PASS,
`sdd-archive` cerrado. Ver Engram: `sdd/m3-normalizacion-deduplicacion/*`
(topic keys: explore, proposal, spec, design, tasks, apply-progress,
verify-report, archive-report).

## 4. Estado M4 (ingesta y bridges, parcial) — EN CURSO, esto es lo que falta

Alcance: endpoint genérico de ingesta + adaptador Google Forms. Meta/LinkedIn/X
quedan para un cambio SDD futuro (dependen de aprobaciones externas).

**Fases SDD completadas** (todo en Engram, nada en código todavía — M4 no
tiene ni un archivo ni una migración escrita aún):

| Fase | Estado | Topic key Engram |
|---|---|---|
| explore | ✅ hecho | `sdd/m4-ingesta-bridges-parcial/explore` |
| propose | ✅ hecho, con 5 decisiones del usuario ya confirmadas | `sdd/m4-ingesta-bridges-parcial/proposal` |
| spec | ✅ hecho | `sdd/m4-ingesta-bridges-parcial/spec` |
| design | ✅ hecho (llegó justo antes del corte de cuota) — verificó que `deduplicarLead` no acepta `tx` externo (D3 sigue válida) y que `LeadEntrante` satisface `DeduplicacionInput` sin adaptación. Convención confirmada: este backend no usa clases, todo son módulos de funciones (`bridge.repository.ts` exporta `findByClaveApiHash`, no `class BridgeRepository`). 15 archivos nuevos, 6 modificados. | `sdd/m4-ingesta-bridges-parcial/design` |
| tasks | ❌ no empezado — **siguiente paso inmediato al retomar** | — |
| apply | ❌ no empezado (0 líneas de código escritas) | — |
| verify / archive | ❌ no empezado | — |

### Resumen de las 10 decisiones de diseño ya cerradas en la propuesta (D1-D10)

Para no depender solo de Engram, el resumen completo:

1. **`leads_recibidos`**: tabla nueva no documentada en `docs/03-modelo-datos.md`
   (hallazgo real, hay que actualizar ese doc). Columnas: `id`, `bridge_id`,
   `id_externo_lead`, `lead_id` NULL, `estado` (`RECIBIDO`/`PROCESADO`/
   `FALLIDO`), `datos_incompletos` boolean, `payload` jsonb, `recibido_en`,
   `procesado_en` NULL. `UNIQUE(bridge_id, id_externo_lead)`.
2. **Upsert idempotente**: raw SQL `ON CONFLICT ... DO UPDATE ... RETURNING
   *, (xmax = 0)`, mismo patrón que `cliente.repository.ts` de M3 — NO
   `DO NOTHING` (falla bajo concurrencia, mismo motivo que M3 D3).
3. **Reprocesamiento** (confirmado por usuario: ventana automática de 5 min,
   no manual): `PROCESADO` → 200 sin reprocesar; `FALLIDO` → reprocesar;
   `RECIBIDO` con menos de `RECEPCION_OBSOLETA_MINUTOS = 5` → no reprocesar
   (puede estar en curso); `RECIBIDO` con más de 5 min → reprocesar. Es la
   lógica más nueva/riesgosa del cambio, requiere el mismo rigor que la
   ventana de 90 días de M3.
4. **Auth**: header `X-Bridge-Key`, hash-compare sha256hex contra columna
   nueva `bridges.clave_api_hash`, reusando el patrón de
   `refresh_tokens.hash`. Nunca reversible.
5. **AES-256-GCM diferido** (confirmado por usuario) al cambio de Meta/
   LinkedIn/X junto con `token_cifrado`, `token_expira_en`, `secreto_webhook`
   — este slice no tiene ningún token reversible que cifrar.
6. **Dato incompleto** (confirmado por usuario: solo en `leads_recibidos`, no
   en `leads`): marca `leads_recibidos.datos_incompletos = true` +
   `bridge_logs` ADVERTENCIA cuando `telefono` y `correo` llegan null. Nunca
   un 4xx — el lead se persiste igual.
7. **`bridges` solo esquema, sin CRUD**; `cuentas_publicitarias` diferida
   entera (no tiene consumidor real en este slice).
8. **Atribución de campaña** (confirmado por usuario: se guarda cruda, sin
   resolver): `idExternoCampania`/`nombreCampania`/`idExternoCuenta` quedan
   tal cual en `leads_recibidos.payload` (jsonb), backfilleable después. No
   se construyen `campanias`/`cuentas_publicitarias` en este slice.
9. **Procesamiento síncrono** (confirmado por usuario, desviación
   documentada de `docs/05-bridges.md` §2 que pide "responder 200 y
   encolar"): no hay infraestructura de cola en el proyecto todavía: auth →
   dedup → 200, todo en la misma request.
10. **Adaptador Google Forms**: módulo backend propio
    (`adapters/google-forms.adapter.ts`), no lógica en Apps Script. Los
    campos no completados mapean a `null`, nunca a un default.

**Hallazgos a reportar/documentar** (regla 1 de AGENTS.md — no se resuelven
en silencio): F1 `leads_recibidos` no documentada; F2 `bridges` no tiene
columna para clave de API hasheada; F3 el test obligatorio del checklist
("webhook con firma inválida se rechaza") está redactado en lenguaje HMAC de
Meta pero el mecanismo real de este slice es `X-Bridge-Key` — se restableció
como "`X-Bridge-Key` ausente/mal formada/no coincidente → 401 + `bridge_logs`
ERROR"; F4 "responder 200 y encolar" no tiene infraestructura ni ítem de
checklist, aceptado como desviación documentada (punto 9); F5 conflicto de
semántica de reintentos entre §2 y §8 de `docs/05-bridges.md`, resuelto a
favor de códigos de estado honestos.

**Pronóstico de entrega** (de la propuesta, a re-confirmar en `sdd-tasks`):
~1400-1600 líneas, 3 PRs apiladas desde el arranque (a diferencia de M3 donde
se descubrió a mitad de camino):
- PR1 (~450): migración + modelos/enums + `bridge.repository.ts` +
  `lib/clave-bridge.ts` + seed + tests unitarios de hashing.
- PR2 (~450): contrato `LeadEntrante` + schemas Zod + los 2 adaptadores +
  `lead-recibido.repository.ts` (raw SQL) + `bridge-log.repository.ts` +
  tests de mapeo/idempotencia.
- PR3 (~550): `ingesta.service.ts` + controller + ruta + los tests de
  integración obligatorios (auth, idempotencia, concurrencia, dato
  incompleto, estado del bridge).

## 5. Próximo paso inmediato al retomar

1. Design ya está hecho y persistido — correr `sdd-tasks` directo, leyendo
   spec (`sdd/m4-ingesta-bridges-parcial/spec`) y design
   (`sdd/m4-ingesta-bridges-parcial/design`). El design dejó 2 riesgos para
   que `sdd-tasks` los resuelva explícitamente, no en silencio:
   - El endpoint público escribe una fila en `bridge_logs` en cada intento
     no autenticado (antes de validar la clave) — superficie de crecimiento
     no acotado, sin job de retención en este slice. Decidir si PR1 necesita
     un cap/rate-limit o si se documenta como riesgo aceptado.
   - El archivo de diseño lista 21 entradas de archivos; PR3 (servicio +
     controller + ruta + 7 tests de integración) es la más propensa a superar
     el presupuesto de 400 líneas — puede necesitar dividirse en PR4, igual
     que pasó con PR2→PR3 en M3.
2. Preflight de sesión ya está decidido para este proyecto (no volver a
   preguntar salvo que el usuario quiera cambiarlo): modo automático,
   artefactos en Engram, `delivery_strategy: ask-on-risk`, presupuesto 800
   líneas por PR (con `size:exception` aceptable si la unidad atómica lo
   justifica, como pasó en la PR3 de M3).
3. Seguir el mismo patrón operativo que M3: worktree aislado, contenedor
   Docker para todo, `gentle-ai sdd-attempt acquire/settle` por cada PR,
   commits en español, sin push/PR automático — confirmar con el usuario
   antes de subir a remoto.

## 6. Después de M4 (parcial)

Orden sugerido por `docs/06-modulos-backend.md`: M5 (gestión de leads) → M6
(asignación/SLA) → M7 (citas) → M8 (notificaciones/SSE) → M9 (dashboard), con
el resto de M4 (Meta/LinkedIn/X) intercalado cuando lleguen las aprobaciones
externas.
