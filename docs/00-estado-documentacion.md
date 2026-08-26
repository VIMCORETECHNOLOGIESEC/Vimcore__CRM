# 00 — Estado y autoridad de la documentación

Este documento indica **qué se puede usar como fuente de verdad hoy** y qué
archivos requieren verificación adicional. El producto implementado sigue
siendo single-company; la evolución multi-tenant/holding está en análisis y no
forma parte del comportamiento actual.

> **Estado:** vigente
>
> **Autoridad:** mapa de confianza documental; no sustituye al código ni a las
> reglas de negocio aprobadas.
>
> **Verificado contra:** rama `test/gpt`, commit `e70b3a4`, 2026-08-25.

## Ruta rápida de revisión

1. Leer este documento para conocer el nivel de confianza de cada fuente.
2. Usar [`16-hallazgos-y-preguntas.md`](16-hallazgos-y-preguntas.md) como
   entrada ejecutiva de revisión cruzada. Sus hallazgos y decisiones D1–D14
   (ya resueltas) no constituyen por sí solos un contrato de implementación.
3. Consultar [`11-plan-integracion.md`](11-plan-integracion.md) para el estado
   implementado actual.
4. Usar [`01-alcance-mvp.md`](01-alcance-mvp.md) y
   [`02-reglas-negocio.md`](02-reglas-negocio.md) como baseline funcional v1,
   respetando sus reservas documentadas.
5. Para modelo, endpoints o comportamiento actual, verificar siempre
   `backend/prisma/schema.prisma`, las migraciones y el código cuando la tabla
   siguiente marque una fuente como no confiable o mixta.
6. Consultar [`14-evolucion-multitenant.md`](14-evolucion-multitenant.md) y
   [`15-benchmark-crm-y-roadmap.md`](15-benchmark-crm-y-roadmap.md) solo para
   discutir el TO-BE; ninguno autoriza implementación.

## Niveles de confianza

| Estado | Cómo debe usarse |
|---|---|
| **Vigente** | Puede guiar trabajo dentro de su autoridad declarada. |
| **Vigente con reservas** | Es útil, pero las brechas señaladas deben verificarse contra código o una decisión de producto. |
| **Mixto** | Combina estado actual con intención o historia; no debe usarse de forma aislada. |
| **No confiable** | No debe guiar implementación ni validación hasta corregirse. |
| **Histórico** | Conserva contexto, pero no describe el estado actual. |
| **Borrador TO-BE** | Sirve para decidir una evolución; no describe el AS-IS ni autoriza implementación. |

## Matriz de documentos

| Documento | Estado | Autoridad | Verificación y uso actual |
|---|---|---|---|
| `README.md` | Vigente | Entrada al repositorio y flujo Docker | Ruta operativa soportada y mapa de documentación. |
| `backend/README.md` / `frontend/README.md` | Mixto | Contexto de cada paquete | Sus descripciones funcionales son útiles, pero los flujos de ejecución en host contradicen la política container-only y deben corregirse en otro lote. |
| `AGENTS.md` | Vigente | Políticas obligatorias para agentes | Define el baseline single-company actual y separa la evolución multi-tenant aún no aprobada. |
| `docs/01-alcance-mvp.md` | Vigente con reservas | Baseline funcional del MVP v1 | Mezcla alcance comprometido con elementos todavía parciales: LinkedIn, X y atribución normalizada de campaña/cuenta. No representa el target multi-tenant. |
| `docs/02-reglas-negocio.md` | Vigente con reservas | Reglas del embudo v1 | El AS-IS de traspaso en `NUEVO` y SLA fue reconciliado; autoridad de cierre, rol dual y reglas TO-BE siguen pendientes. |
| `docs/03-modelo-datos.md` | Vigente con reservas | Lectura resumida del modelo AS-IS | Regenerado desde `schema.prisma`; `schema.prisma` y las migraciones siguen mandando ante cualquier discrepancia futura. |
| `docs/04-formularios-semaforo.md` | Vigente con reservas | Formularios y rúbrica fija v1 | Los formularios calificables y la rúbrica están alineados. El cierre no: la API fija `cerradoEn`, no acepta una fecha enviada por el cliente y Venta no admite `observaciones`; solo No Venta acepta `observacionCierre`. |
| `docs/05-bridges.md` | Vigente con reservas | Contrato funcional de captación | Cada sección está etiquetada Implementado/Diseño/Requisito contra el código real de `backend/src/adapters` y `backend/src/jobs`. |
| `docs/06-modulos-backend.md` | Vigente con reservas | Checklist técnico backend | Solo el estado consolidado y las brechas P0-P3 vigentes; el diario histórico por módulo quedó en Git (`git log --follow`). |
| `docs/07-modulos-frontend.md` | Mixto | Checklist técnico frontend | La tabla consolidada inicial es útil; el cuerpo mezcla el estado actual con etapas antiguas basadas en mocks y ramas de integración. |
| `docs/08-dashboard-kpis.md` | Vigente con reservas | Definiciones funcionales de KPIs | Los KPIs están implementados, pero no todos se calculan solo con `lead_eventos`; campaña se resuelve actualmente desde JSON. |
| `docs/09-linea-grafica-frontend.md` | Mixto | Línea visual aprobada | La paleta y principios siguen siendo referencia; estados de librerías y flujo de mockups contienen historia ya superada. |
| `docs/09-skills-agentes-backend.md` | Vigente | Inventario real de skills de backend | Regenerado desde `.claude/skills/` y `.agents/skills/` reales. |
| `docs/10-skills-agente-frontend.md` | Vigente con reservas | Inventario de skills frontend | El inventario requiere reconciliar conteos, rutas de registro y comandos de instalación antes de reutilizarlo. |
| `docs/11-plan-integracion.md` | Vigente | Snapshot de integración AS-IS | Resumen conciso verificado contra rutas, servicios y clientes HTTP actuales. El plan cronológico anterior queda en Git. |
| `docs/12-pruebas-manuales-qa.md` | No confiable | Catálogo histórico de escenarios QA | Sus fixtures no coinciden con los seeds actuales; no permite certificar QA hasta reconstruirse. |
| `docs/13-configuracion-bridges.md` | Vigente con reservas | Guía operativa de Meta y Google Forms | Es utilizable con verificación puntual de variables, modelo Facebook/Instagram y creación de cuentas. |
| `docs/14-evolucion-multitenant.md` | Borrador TO-BE | Arquitectura candidata para discusión | No describe el producto actual ni autoriza migraciones. Holding como tenant es la decisión ya resuelta (D1, `docs/16` §8); el documento conserva valor como referencia de arquitectura y plan de migración. |
| `docs/15-benchmark-crm-y-roadmap.md` | Borrador TO-BE | Referencias de mercado y priorización futura | Compara capacidades con fuentes oficiales; sus recomendaciones no son requisitos aprobados ni prueba de implementación. |
| `docs/16-hallazgos-y-preguntas.md` | Vigente | Síntesis ejecutiva entre equipos de hallazgos y orden de decisiones | Es la entrada para revisión cruzada en el corte declarado. No reemplaza los contratos funcionales/técnicos ni autoriza implementación. |

## Brechas abiertas confirmadas

| Brecha | Evidencia actual | Consecuencia |
|---|---|---|
| Atribución normalizada incompleta | `Campania` existe en Prisma, pero `Lead` no tiene `campaniaId`; campañas y cuentas no se materializan desde la ingesta. | El listado y detalle no pueden mostrar una relación confiable de campaña/cuenta, y parte del filtrado usa JSON o catálogos locales. |
| Contrato de cierre divergente | Docs 02/04 exigen fecha de cierre en Venta/No Venta y docs/04 permite observaciones de Venta; el schema no recibe esos campos y el servicio fija `cerradoEn` con la hora del servidor. | Una interfaz o prueba basada en esos documentos enviaría datos descartados o no representables por el contrato actual. |
| Decisiones de responsabilidad resueltas, no implementadas | M6 sigue implementado según el AS-IS anterior; autoridad de cierre (D7), evidencia de primer contacto y handoff (D8), rol dual (D5) y reasignación (D9) ya están resueltos en `docs/16` §8. | La regla ya está aprobada; falta migrar esquema y código para que el comportamiento real la refleje. |
| Historial técnico dentro de documentos vivos | Docs 06/07 conservan diarios extensos y notas superadas debajo de sus resúmenes actuales. | La fuente vigente se vuelve más difícil de distinguir de la cronología. |
| QA no reproducible | Los usuarios, bridges, leads, citas y notificaciones de docs/12 no coinciden con `seed.ts` ni `seed-leads-qa.ts`. | No se puede usar el checklist actual como evidencia de aceptación. |
| Guías de paquete incompatibles con el entorno soportado | `backend/README.md` y `frontend/README.md` todavía incluyen ejecución en host, aunque el README raíz ya la reemplaza por Docker. | Un lector que entre directamente por un paquete puede incumplir el aislamiento obligatorio. |

## Plan de corrección por lotes

Git conserva la cronología de qué se corrigió y cuándo (`git log --follow` por
archivo). Esta sección solo declara qué queda pendiente hoy.

### Lote 1 — Navegación y confianza documental

- [x] Crear este mapa de autoridad.
- [x] Dejar una única ruta feliz Docker en el README raíz.
- [x] Separar en AGENTS el baseline single-company del target multi-tenant.
- [x] Sustituir el plan histórico de integración por un snapshot vigente.
- [x] Bloquear el uso accidental de los documentos 03 y 12 mediante banners.

### Lote 2 — Contratos AS-IS exactos

- [x] Sincronizar `03-modelo-datos.md` con Prisma y migraciones.
- [x] Corregir `02-reglas-negocio.md` en traspaso y SLA.
- [ ] Reconciliar el contrato de cierre de docs 02/04 con el schema y servicio.
- [x] Separar requisitos y comportamiento implementado en `05-bridges.md`.
- [ ] Aclarar fuentes de datos reales en `08-dashboard-kpis.md` y
      `13-configuracion-bridges.md`.

### Lote 3 — Reducir historia y deuda de lectura

- [ ] Convertir docs 06/07 en checklists concisos de estado actual.
- [ ] Trasladar cronología, ramas y PRs a Git o a un archivo histórico
      explícito.
- [ ] Reconciliar la guía visual y los inventarios de skills con el repositorio.

### Lote 4 — QA reproducible

- [ ] Definir un único procedimiento de reset y seed para QA dentro de Docker.
- [ ] Hacer que los fixtures creados y los casos documentados coincidan.
- [ ] Ejecutar el checklist revisado y registrar evidencia real.

### Lote 5 — Evolución multi-tenant/holding

- [x] Crear un documento TO-BE separado del baseline v1.
- [x] Registrar el benchmark de mercado y una priorización inicial sin
      convertirla en contrato.
- [x] Resolver organización, empresa, membresías, roles, permisos por canal,
      ownership de bridges y alcance de métricas — ver D1, D4, D5, D6, D12 en
      `docs/16` §8.
- [ ] Aprobar migración, compatibilidad y estrategia de despliegue antes de
      modificar esquema o autorización.

## Regla de mantenimiento

Todo cambio futuro debe actualizar en el mismo work unit la regla de negocio,
el contrato técnico y la prueba que lo demuestra. Git conserva la cronología;
los documentos vivos deben mostrar el resultado vigente, no una secuencia de
parches históricos.
