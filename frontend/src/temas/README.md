# `temas/` — variantes de línea gráfica

Carpeta padre para las distintas variantes de tema con las que este CRM se
piensa distribuir según el cliente que lo despliega. El modelo de despliegue
sigue siendo instancia única por empresa (AGENTS.md §1 -- NO es multi-tenant
en runtime): lo que varía por cliente es qué **tema visual** se compila en
esa instancia, no el modelo de datos ni el aislamiento.

## Qué es una "variante de tema"

Una variante es una dirección visual completa y autocontenida: paleta de
color, tipografía, tratamiento de sombras/bordes y cualquier componente cuyos
estilos estén atados a esa identidad y no tengan sentido fuera de ella. Vive
en su propia subcarpeta hermana bajo `temas/`, por ejemplo
`temas/variante-empresarial/`.

Convención por variante:

- Los tokens de color/tipografía de la variante se scopean bajo una clase
  contenedora (ej. `.tema-empresarial`) en un `.css` propio de esa carpeta,
  **nunca** se escriben en `src/index.css` ni en `tailwind.config.js` --
  esos archivos son la línea gráfica base compartida (docs/09), no el lugar
  para experimentar con una dirección todavía no adoptada.
- Un componente reutilizable por cualquier variante futura (botón, tabs,
  select, card genérica, etc.) vive en `src/components/ui/` como cualquier
  otra primitiva shadcn -- no se duplica dentro de la carpeta del tema.
- Un componente cuyos estilos están atados a la identidad de una variante
  puntual (ej. el sello/credencial cuadrada de la Propuesta B) vive dentro de
  la carpeta de esa variante, no en `components/ui/`.
- El nombre de la carpeta + el comentario de cabecera de su página principal
  alcanzan para documentar qué variante es -- no hace falta un `README.md`
  por variante, solo este archivo a nivel de `temas/`.

## Cómo se usa hoy

Cada variante expone una página de referencia (styleguide) montada en una
ruta fuera de `layouts/navigation.ts` (no debe aparecer en el sidebar de
producción) -- ver `frontend/src/router.tsx`, rutas bajo `/temas/*`. Sirve
para validar que la dirección visual es realizable con el stack real del
proyecto (React + Tailwind + shadcn/Radix) antes de decidir si se adopta como
línea gráfica base.

Fuente de verdad de las direcciones visuales en exploración:
`.interface-design/system.md`.
