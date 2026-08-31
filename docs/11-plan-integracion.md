# 11 — Estado actual de integración front-back

> **Estado:** snapshot vigente del AS-IS single-company.
>
> **Autoridad:** rutas, servicios y repositorios del backend; clientes
> `*.api.ts`, hooks y pantallas del frontend.
>
> **Verificación:** revisión estática de la rama `test/gpt`, commit `e70b3a4`,
> 2026-08-25. No sustituye una ejecución de QA.

## Conclusión rápida

Las funcionalidades F2–F8 tienen integraciones reales y sus consultas o
mutaciones centrales llegan al backend. Eso no significa que todos sus controles
estén conectados: en F3 el selector de campaña usa un catálogo sintético local y
su valor no se envía a `GET /leads`. **Integrado no significa funcionalmente
cerrado:** M4–M6 y F3–F4 conservan brechas de autorización, atribución de origen,
datos de contacto y actualización en tiempo real.

La cronología anterior de fases, ramas y PRs no se mantiene en este documento.
Git conserva ese historial:

```bash
git log --follow -- docs/11-plan-integracion.md
```

## Matriz vigente

| Funcionalidad | Backend | Integración actual | Brecha que impide declararla cerrada |
|---|---|---|---|
| F2 — Autenticación | M2 | Login, refresh, logout y perfil usan API real. | No existe cambio de contraseña autoservicio para roles no administradores. |
| F3 — Listado de leads | M4–M6 | Consulta, búsqueda, filtros de etapa/semáforo/red/responsable/fecha/SLA y asignación masiva usan API real. El filtro de campaña no está integrado. | La UI muestra campañas sintéticas y no envía `campaniaId`; campaña/cuenta tampoco tienen relación canónica. Faltan vistas activos/cerrados y evento `lead.nuevo`. |
| F4 — Detalle de lead | M5–M7 | Detalle, etapas, traspaso, reasignación, formularios y citas usan API real. | Correo principal, campaña y cuenta se pierden en el DTO; la UI expone acciones sin capacidad y no resuelve bien un 403. |
| F5 — Dashboard | M9 | Todos los KPIs consultan endpoints reales y se invalidan mediante SSE. | La métrica por campaña todavía depende del nombre guardado en JSON, no de una atribución normalizada. |
| F6 — Notificaciones | M8 | Listado, lectura individual/masiva y canal SSE usan backend real. | Falta el productor preventivo `TOKEN_POR_EXPIRAR`; no todo evento de negocio tiene el alcance de entrega requerido. |
| F7 — Usuarios | M2/M6 | CRUD, baja/reactivación y reasignación de cartera usan API real. | Sin gap de integración principal; sus permisos siguen siendo globales al despliegue single-company. |
| F8 — Bridges | M4 | CRUD de bridges/cuentas, rotación de clave, prueba de conexión, logs y catálogos usan API real. | El endpoint genérico atribuye como Google Forms; LinkedIn/X siguen pendientes y la ingesta no materializa cuenta/campaña en el lead. |

## Brechas compartidas, por orden de decisión

1. **P0 — Autoridad comercial.** Aprobar quién puede cerrar, qué acredita el
   primer contacto y quién puede cambiar un vendedor. El comportamiento actual
   no garantiza la separación asesor→vendedor planteada para la evolución.
2. **P1 — Origen canónico del lead.** Definir y persistir bridge, cuenta,
   campaña y futura empresa/sitio sin depender de `payload_original`.
3. **P1 — Fuente del endpoint genérico.** Evitar que un bridge autenticado de
   otra red quede registrado como Google Forms antes de sumar canales.
4. **P1 — Contratos F3/F4.** Exponer correo y atribución reales, y entregar
   capacidades de edición coherentes con la autorización del backend.
5. **P1 — Operación preventiva.** Producir de forma idempotente la alerta de
   token próximo a expirar.
6. **P2 — Flujo y tiempo real.** Completar vistas activos/cerrados, evento de
   lead nuevo, manejo de 403 y alcance correcto de eventos SSE.
7. **P2 — Cobertura de canales.** Implementar LinkedIn/X solo después de cerrar
   el contrato de origen y atribución.

El detalle técnico y la evidencia de cada brecha viven en
[`06-modulos-backend.md`](06-modulos-backend.md) y
[`07-modulos-frontend.md`](07-modulos-frontend.md).

## Qué significa “integración real” aquí

Una funcionalidad se marca integrada cuando su pantalla usa `httpClient` o el
cliente SSE contra una ruta autenticada del backend y conserva el contrato de
respuesta esperado para su flujo central. Un control aislado puede seguir sin
integración, como el filtro visual de campaña de F3. Esa marca **no demuestra**
por sí sola:

- aceptación de la regla de negocio;
- aislamiento multi-tenant;
- cobertura de todos los canales;
- calidad de datos histórica;
- pruebas manuales reproducibles.

Para saber qué fuente puede guiar una corrección, empezar por
[`00-estado-documentacion.md`](00-estado-documentacion.md). La evolución hacia
holdings/múltiples empresas debe documentarse aparte como TO-BE y no altera este
snapshot hasta que exista una decisión aprobada e implementación verificada.
