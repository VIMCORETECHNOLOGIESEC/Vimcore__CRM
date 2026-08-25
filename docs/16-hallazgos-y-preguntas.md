# 16 — Hallazgos y decisiones para revisión cruzada

> **Estado:** artefacto autónomo de revisión estática; no es contrato funcional ni autoriza implementación.
>
> **Rama / upstream:** `test/gpt` / `origin/test/gpt`
>
> **Commit base:** `e70b3a45402d8f258016a218ca87825ffd78af7f`
> (`e70b3a4`) · **Corte:** 2026-08-25
>
> **Base probatoria:** archivos de `origin/test/gpt` en el commit indicado y fuentes oficiales directas de la sección 6.
>
> **Evidencia:** sin cambios de código ni pruebas runtime; no acredita tests, build ni QA.

Este documento concentra los hallazgos para corregir el MVP o diseñar la evolución
multiempresa. No depende de otros borradores y puede publicarse como único artefacto.

## 1. Fuentes locales de evidencia

| Fuente presente en `origin/test/gpt` | Uso en esta revisión |
|---|---|
| [`AGENTS.md`](../AGENTS.md) y [`01-alcance-mvp.md`](01-alcance-mvp.md) | Baseline single-company, alcance y exclusiones |
| [`02-reglas-negocio.md`](02-reglas-negocio.md) a [`05-bridges.md`](05-bridges.md) | Reglas, datos, cierre, semáforo e ingesta documentados |
| [`06-modulos-backend.md`](06-modulos-backend.md) a [`08-dashboard-kpis.md`](08-dashboard-kpis.md) | Checklists técnicos y definición de métricas |
| [`11-plan-integracion.md`](11-plan-integracion.md) a [`13-configuracion-bridges.md`](13-configuracion-bridges.md) | Integración histórica, QA y operación de bridges |
| [`schema.prisma`](../backend/prisma/schema.prisma) y [`migrations/`](../backend/prisma/migrations/) | Autoridad del esquema AS-IS |
| `backend/src/**` y `frontend/src/**` | Autoridad del comportamiento implementado |

## 2. Resumen ejecutivo

- El producto implementado es un CRM **single-company**, desplegado con una base
  aislada por empresa. No modela tenant, holding ni scope empresarial.
- El MVP ya cubre captación, deduplicación, asignación, embudo, SLA, citas,
  notificaciones y métricas, pero M4–M6 conservan brechas de atribución,
  autorización y exactitud de datos.
- La separación asesor→vendedor no está garantizada por el backend: el asesor
  puede cerrar mientras sea responsable y el traspaso no exige evidencia
  explícita de primer contacto.
- La evolución hacia holdings requiere decidir primero la frontera tenant. Sin
  esa decisión no existe una clave de aislamiento ni una migración segura.
- La prioridad no es replicar HubSpot: primero se estabilizan embudo, ownership,
  atribución y aislamiento; marketing, servicio, revenue e IA pueden diferirse.

## 3. Alcance y método

La revisión fue estática. Ante una contradicción prevalecen Prisma, migraciones y
código. No se instalaron dependencias ni se ejecutaron contenedores, tests o QA.

## 4. Hallazgos verificados

### 4.1 Documentación y confianza

| Hallazgo | Estado verificado | Tratamiento |
|---|---|---|
| `docs/03` describe relaciones y columnas inexistentes | No confiable; Prisma y migraciones prevalecen | Corregir antes de diseñar esquema |
| `docs/04` diverge del contrato real de cierre | La API fija `cerradoEn`; Venta no acepta observación | Reconciliar documentación y contrato aprobado |
| `docs/05` mezcla requisito, diseño e implementación | No permite inferir por sí solo el estado de M4 | Separar AS-IS de intención |
| `docs/06` y `docs/07` conservan diarios históricos | Sus resúmenes iniciales son útiles, el cuerpo exige contexto | Reducir y mover cronología a Git |
| `docs/08` atribuye métricas principalmente a eventos | Campaña se consulta desde JSON y monto desde columnas | Documentar la fuente real de cada KPI |
| `docs/12` no coincide con los seeds actuales | No permite aprobar QA reproducible | Reconstruir fixtures y resultados esperados |
| README de backend y frontend proponen ejecución en host | Contradicen la política container-only | Alinear con la ruta Docker del README raíz |
| `AGENTS.md` y `docs/01` llaman preparado al sitio web | `RedSocial` no incluye `SITIO_WEB`; el genérico fija Google Forms | Tratarlo como expansión, no como capacidad lista |

Hay correcciones propuestas en el worktree, pero **no forman parte de este commit
aislado**. Las divergencias siguen abiertas hasta publicarse por separado.

### 4.2 Roles y autorización actual

| Área | AS-IS verificado | Brecha |
|---|---|---|
| Roles | `ADMINISTRADOR`, `SUPERVISOR`, `ASESOR` y `VENDEDOR`; un rol global por usuario | No representa membresías ni roles distintos por empresa |
| Visibilidad | Admin y supervisor ven todo; asesor y vendedor ven su cartera | El acceso total no tiene scope empresarial |
| Edición | Admin, supervisor o responsable operativo actual | El asesor puede ejecutar cierres mientras siga siendo responsable |
| Traspaso | Bloqueado en `NUEVO`; permitido desde etapas posteriores | La etapa no prueba primer contacto |
| Divergencia | `docs/02` habilita intervención administrativa en cualquier momento | `canTransfer` bloquea `NUEVO` para todos los roles |
| Excepciones | Admin y supervisor pueden traspasar sin asesor previo | El vendedor puede recibir trabajo sin intervención verificable del asesor |
| Segundo traspaso | El asesor original puede volver a cambiar al vendedor | Ownership, auditoría y SLA pueden quedar ambiguos |
| Elegibilidad | No existe permiso dinámico por Fuente | El pool global no limita redes, páginas, sitios o formularios |

El TO-BE candidato combina capacidad, membresía, scope, propiedad, elegibilidad
y flujo. No está aprobado ni equivale a reemplazar el enum de roles.

### 4.3 M4 — Ingesta, bridges y atribución

| Prioridad | Hallazgo verificado | Consecuencia |
|---|---|---|
| P1 | El endpoint genérico usa el adaptador de Google Forms y fija `GOOGLE_FORMS` | X o sitio web quedarían registrados con un canal incorrecto |
| P1 | `LeadRecibido.bridgeId -> leadId` conserva linaje histórico indirecto | No existe atribución singular y canónica de Fuente, cuenta o campaña en `Lead` |
| P1 | `Campania` existe, pero la ingesta no la materializa ni la enlaza al lead | Filtros y métricas dependen de JSON o catálogos sintéticos |
| P1 | `tokenExpiraEn` existe, pero `TOKEN_POR_EXPIRAR` no tiene productor idempotente | Falta la alerta preventiva prometida |
| P2 | Un ingreso sin teléfono ni correo genera advertencia, no notificación | El supervisor no recibe el workflow operacional esperado |
| P2 | LinkedIn y X siguen pendientes | Ampliarlos ahora repetiría el defecto de atribución |

SITIO_WEB es una expansión futura. Antes de sumar canales se debe estabilizar
Fuente, Bridge, cuenta, campaña y procedencia de cada captación.

### 4.4 M5/M6 — Gestión, asignación y handoff

| Prioridad | Hallazgo verificado | Consecuencia |
|---|---|---|
| P0 | El responsable operativo puede cerrar desde etapas no terminales | Un asesor puede registrar `VENTA` o `NO_VENTA` |
| P0 | El traspaso no consulta un evento o dato explícito de primer contacto | Cambiar de etapa no acredita gestión previa |
| P0 | Admin y supervisor pueden entregar a vendedor un lead sin asesor | Se omite la intervención inicial solicitada |
| P0 | El asesor original puede ejecutar un segundo traspaso | El contrato de ownership no es estable |
| P1 | `hasta=YYYY-MM-DD` termina a medianoche y no valida el orden del rango | Se excluye casi todo el último día y se aceptan rangos invertidos |
| P2 | Falta `vista=activos|cerrados` | El listado no soporta esas vistas en servidor |
| P3 | `limite` no aplica la whitelist 10/25/50/100 | Frontend y backend aceptan contratos distintos |

La asignación vigente usa pool global por rol, menor carga y desempate FIFO. La
elegibilidad por Fuente es una propuesta, no el algoritmo actual.

### 4.5 Evolución tenant y holding

- La frontera puede ser **Holding como tenant** con empresas internas, o
  **Empresa como tenant** con coordinación federada del holding.
- Empresa debe ser el scope funcional inequívoco del lead, pero la clave física
  depende de la frontera elegida.
- Fuente es la unidad candidata de routing; Bridge es la conexión configurada y
  Activo de captación es solo el concepto paraguas.
- Membresías, capacidades, deduplicación, secretos, SSE, jobs, logs, caché y
  métricas deben respetar la misma frontera.
- La separación Lead→Oportunidad es la dirección semántica candidata. Su
  representación física sigue pendiente y no justifica imitar otro CRM.
- El reporting consolidado requiere distinguir empresa, Fuente, asesor y
  vendedor sin borrar la contribución previa al handoff.

## 5. Clasificación de acciones

### Corregir ahora

1. Reconciliar `docs/03`, `docs/04`, `docs/05`, `docs/08` y `docs/12` con las
   fuentes técnicas o marcarlas sin ambigüedad hasta su reescritura.
2. Reducir la cronología de `docs/06` y `docs/07` y alinear los README de paquete
   con el entorno Docker obligatorio.
3. Corregir el rango de fechas, las vistas y la whitelist de paginación de M5.
4. Corregir el origen genérico y completar las alertas M4/M8 ya comprometidas.
5. Retirar el filtro sintético de campaña o presentarlo como no disponible hasta
   contar con atribución real.

### Decidir antes de implementar

1. Frontera tenant, topología física y alcance del administrador del holding.
2. Identidad, deduplicación y reingreso entre empresas.
3. Membresías, roles múltiples, scope de supervisión y excepciones auditadas.
4. Competencia sobre Venta y No Venta, primer contacto y modalidad del handoff.
5. Fuente efectiva de routing, herencia de permisos y bridges compartidos.
6. Significado de rendimiento de canal y representación Lead→Oportunidad.

### Diferir

1. LinkedIn y X dentro del backlog MVP hasta estabilizar el contrato de origen.
2. Sitio web como expansión TO-BE no aprobada, posterior al contrato de Fuente.
3. Pipelines, formularios y scoring totalmente configurables.
4. Marketing email, publicación social, CMS, Service Desk y Customer Success.
5. Productos, cotizaciones, pagos, suscripciones y marketplace público.
6. IA predictiva y aplicación móvil nativa sin evidencia operativa suficiente.

## 6. Referencias oficiales para el contraste CRM

Estas fuentes sustentan patrones de mercado, no requisitos del producto:
- [HubSpot — Understand objects](https://knowledge.hubspot.com/records/understand-objects): distingue Contact, Company, Lead y Deal sobre una plataforma común.
- [HubSpot — Assign and rotate record owners](https://knowledge.hubspot.com/workflows/assign-and-rotate-record-owners-using-workflows): documenta ownership y distribución mediante workflows.
- [HubSpot — Connect additional brand domains](https://knowledge.hubspot.com/domains-and-urls/connect-additional-brand-domains): muestra Brands como agrupación de activos dentro de una cuenta, no como prueba de aislamiento tenant.

Consultadas el 2026-08-25: orientan separación semántica, no copia de objetos.

## 7. Plan por fases

| Fase | Resultado esperado | Puerta de salida |
|---|---|---|
| 0 — Autoridad documental | AS-IS verificable y QA reproducible | Fuentes mixtas corregidas o claramente bloqueadas |
| 1 — Contrato de producto | Decisiones comerciales y D1 registradas | Matriz de capacidades, scope y handoff aprobada |
| 2 — Endurecimiento single-company | Defectos deterministas de M4/M5 corregidos | Atribución de origen y rangos confiables |
| 3 — Fundación tenant aditiva | Empresas, membresías y ownership nullable | Backfill y rollback demostrables |
| 4 — Aislamiento efectivo | Scoping en consultas, jobs, SSE, logs y secretos | Pruebas adversariales entre empresas y tenants |
| 5 — Routing y handoff | Fuente, elegibilidad, primer contacto y pools separados | Vendedor solo recibe trabajo habilitado |
| 6 — Reporting jerárquico | Consolidado de holding y drill-down autorizado | KPIs separados por empresa, asesor y vendedor |
| 7 — Retiro legacy | Restricciones obligatorias y compatibilidad retirada | Migración, backup y recuperación verificados |

Todo cambio funcional o de esquema mantiene, cuando aplique, código, migración,
documentación y pruebas en el mismo work unit. El orden no autoriza trabajo.

## 8. Decisiones en orden

### D1 — Frontera tenant

> **¿El holding será el tenant principal con varias empresas internas, o cada
> empresa será un tenant independiente coordinado mediante federación?**

D1 bloquea el esquema definitivo, la clave de aislamiento, la administración y
la estrategia de migración.

| Orden | Tema declarativo pendiente | Resultado requerido |
|---|---|---|
| D2 | Frontera de identidad y deduplicación | Scope de contacto, lead abierto y reingreso |
| D3 | Cardinalidad de routing por sitio | Asesor fijo, pool o regla con fallback |
| D4 | Granularidad de elegibilidad | Fuente efectiva y herencia desde niveles superiores |
| D5 | Roles múltiples | Combinación por empresa y política de auto-traspaso |
| D6 | Scope de supervisión | Empresa, conjunto de empresas o equipo |
| D7 | Competencia sobre `NO_VENTA` | Autoridad antes y después del handoff |
| D8 | Modalidad del handoff | Asignación inmediata, aceptación o devolución |
| D9 | Política de excepciones | Overrides permitidos, motivo y auditoría |
| D10 | Rendimiento de canal | Métricas CRM o métricas publicitarias importadas |
| D11 | Topología física | Base por tenant, esquema compartido o control plane |
| D12 | Integraciones compartidas | Grants y ownership de credenciales entre empresas |
| D13 | Límite Lead→Oportunidad | Representación física del límite semántico |

Ningún tema D1–D13 queda aprobado por aparecer en esta cola. Cada resultado debe
registrarse explícitamente antes de cambiar esquema, autorización o contratos.

## 9. Criterio de entrega a otro equipo

- El equipo receptor distingue hechos AS-IS de propuestas TO-BE.
- D1 tiene una respuesta explícita antes de diseñar aislamiento.
- Los temas D2–D13 se resuelven en orden y se registran de forma explícita.
- Toda afirmación técnica se contrasta con código y migraciones.
- Los tests runtime futuros se ejecutan únicamente en el entorno Docker aprobado.
- Este documento se actualiza si cambia el código base o se aprueba una decisión.
Esta revisión añadió documentación únicamente. No modificó código, esquema,
dependencias, configuración de runtime ni datos, y no ejecutó tests runtime.
