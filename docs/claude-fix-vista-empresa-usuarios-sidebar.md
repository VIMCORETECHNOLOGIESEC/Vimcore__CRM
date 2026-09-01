# Fix: se perdía la "vista de empresa" al entrar a Usuarios desde el sidebar (2026-09-01)

> **Para el equipo de front, en criollo:** este doc explica un bug real que
> reportó Mateo y cómo se arregló. No hace falta ser experto en el código
> para entenderlo — está pensado para eso.

## El bug, en una frase

Un usuario holding-wide (el que tiene `id_empresa = null`, ve todo el
holding) entraba a la "vista" de una empresa puntual (por ejemplo mirando
sus Leads), hacía clic en **Usuarios** en el sidebar, y al volver a Leads o
Bridges la vista de esa empresa ya no estaba — como si nunca hubiera
entrado.

## Por qué pasaba

Cuando un holding-wide "entra" a mirar una empresa puntual, esa elección
vive en la URL, como parámetro de query: `?empresaId=<id>`. No hay ningún
otro lugar donde se guarde — ni estado global, ni localStorage. Cada
pantalla (Leads, Bridges, Oportunidades, Conversaciones, Usuarios) lee ese
parámetro de SU PROPIA URL actual para saber "¿estoy mirando una empresa en
particular, o todo el holding?".

El sidebar arma cada link que ves (Leads, Usuarios, etc.) agregando
`?empresaId=<id>` automáticamente **si** la pantalla en la que estás parado
ahora mismo ya tiene ese parámetro. El problema: el ítem **Usuarios** del
sidebar nunca hacía eso — nunca copiaba el `?empresaId=` al link. Entonces:

1. Estás en `/leads?empresaId=X` (mirando los leads de la empresa X).
2. Hacés clic en "Usuarios" en el sidebar.
3. Aterrizás en `/usuarios` — **sin** `?empresaId=X`. Se perdió.
4. Ahora el sidebar, parado en `/usuarios` (que no tiene el parámetro), ya
   no sabe que estabas mirando la empresa X.
5. Si volvés a hacer clic en "Leads", el sidebar arma el link de nuevo
   desde cero — y como ya no sabe nada de la empresa X, te manda a
   `/leads` a secas (todo el holding), no a `/leads?empresaId=X`.

No era un error visible ni un mensaje de fallo — simplemente la vista se
"resetaba" en silencio.

## Por qué Usuarios era distinto de Leads/Bridges/Oportunidades/Conversaciones

Esas 4 pantallas tienen un flag interno (`requiereVistaEmpresaSiHolding`)
que hace DOS cosas a la vez:

- **(a)** Esconde el ítem del sidebar si el holding-wide todavía no entró a
  ninguna empresa (esas pantallas no tienen sentido "para todo el
  holding a la vez").
- **(b)** Copia el `?empresaId=` al link, si ya había uno.

Usuarios **no puede** tener (a): un admin de holding necesita poder
gestionar SU PROPIO staff (los administradores/supervisores del holding en
sí) en cualquier momento, sin depender de haber entrado a ninguna empresa.
Por eso, en una corrección anterior, alguien le sacó el flag entero —
arreglando (a), pero sin querer también le sacó (b), que sí hacía falta.

## El fix

Se separaron las dos responsabilidades en dos flags independientes:

- `requiereVistaEmpresaSiHolding` — sigue haciendo (a) y (b) juntas, para
  Leads/Bridges/Oportunidades/Conversaciones (sin cambios ahí).
- `preservaVistaEmpresaSiHolding` (nuevo) — hace SOLO (b): nunca esconde el
  ítem, pero si ya había una empresa elegida, la mantiene en el link.
  Usuarios ahora usa este flag nuevo.

Archivo tocado: `frontend/src/layouts/navigation.ts` (interfaz
`NavigationItem` + la función `resolveNavigationHref`, que es la que arma
los links del sidebar). 5 tests nuevos en
`frontend/tests/layouts/navigation.test.ts`.

## Qué deberían ver ahora

- Entrar a la vista de una empresa (por ejemplo desde "Empresas" → "Ver
  detalles"), después ir a Usuarios, después volver a Leads/Bridges/etc.
  por el sidebar → la empresa elegida se mantiene todo el tiempo.
- Un admin de holding que nunca entró a ninguna empresa sigue viendo
  "Usuarios" en el sidebar igual que antes (eso no cambió).
