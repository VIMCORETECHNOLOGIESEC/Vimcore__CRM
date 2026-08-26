# Bloque A — Endurecimiento single-company

> **Estado:** ✅ CERRADO — 2026-08-26
> **Commits:** e08867d, 5cf78e8, 2eed0cb, 07b1d40, fd85e5e, b55708d, cb45de9, dffca94
> **Criterios de salida:** Todos cumplidos — atribución, autoridad de cierre/traspaso, alertas preventivas, rango de fechas y whitelist de límite implementados y verificados con 717/717 tests.

> Fase 2 de `docs/16-hallazgos-y-preguntas.md` §7. Sin decisión D directa: este
> bloque corrige defectos deterministas del AS-IS actual, previo a tocar
> esquema multi-tenant. Fase 0 de `docs/14-evolucion-multitenant.md` §13
> (contrato y reconciliación documental) es su criterio de entrada.

## Alcance

Cerrar las brechas P0-P1 verificadas de M4/M5/M6 sobre el esquema
single-company actual (`backend/prisma/schema.prisma`), sin introducir
`Empresa`, `Membresia` ni ningún concepto de tenant. Este bloque no depende
de ninguna decisión D1-D14 — corrige comportamiento ya comprometido hoy.

## Lectura requerida antes de empezar

- `docs/06-modulos-backend.md` — tabla de brechas P0-P3 verificadas (fuente
  primaria de este bloque).
- `docs/16-hallazgos-y-preguntas.md` §4.3 (M4 — ingesta y atribución) y §4.4
  (M5/M6 — gestión, asignación y handoff).
- `docs/02-reglas-negocio.md` para las reglas de negocio vigentes que estas
  correcciones no deben romper.

## Brechas a resolver (de `docs/06`, sin duplicar la tabla — ver ahí el detalle)

| Prioridad | Módulo | Brecha |
|---|---|---|
| P0 | M5/M6 | `canEdit` permite cerrar desde etapas no terminales; `canTransfer` no impide un segundo traspaso del asesor original |
| P1 | M4 | Endpoint genérico fija `GOOGLE_FORMS` sin importar la red autenticada |
| P1 | M4/M5 | Falta atribución singular/canónica de fuente, cuenta y campaña en `Lead` |
| P1 | M4/M8 | Falta productor de `TOKEN_POR_EXPIRAR` |
| P1 | M5 | Rango `hasta` termina a medianoche; no valida `desde <= hasta` |
| P2 | M4/M8 | Advertencia de dato incompleto no genera notificación a supervisores |
| P2 | M5 | Falta `vista=activos|cerrados` |
| P3 | M5 | `limite` no aplica whitelist 10/25/50/100 |

## Por qué antes del tenant

`docs/16` §7 ordena este bloque antes de "Fundación tenant aditiva" (Bloque
B) porque migrar atribución y autorización sobre una base que ya tiene bugs
deterministas duplica el trabajo: cada corrección tendría que rehacerse
scopeada por empresa. Corregirlas primero, sobre el esquema actual, es más
barato.

## Criterios de salida

- Atribución de origen (`red_social`) siempre refleja el bridge autenticado,
  nunca un valor fijo del adaptador genérico.
- Autoridad de cierre y traspaso respetan la separación asesor→vendedor ya
  descrita en `docs/16` §4.4 (sin adelantar D5/D7/D8, que son decisiones del
  TO-BE multiempresa — este bloque corrige el contrato AS-IS, no lo
  reemplaza).
- `TOKEN_POR_EXPIRAR` tiene productor idempotente y notifica preventivamente.
- Rango de fechas, vistas y whitelist de `limite` de M5 corregidos con test
  de regresión.

## Siguiente bloque

Bloque B (`docs/blocks/b-tenant-prisma-foundation.md`) — requiere este bloque
cerrado para no migrar sobre atribución todavía rota.
