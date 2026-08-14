# UI Skills — provenance

Installed 2026-08-13. 9 of the 10 skills below come from the community
registry at https://www.ui-skills.com/ (via its `npx ui-skills get <slug>`
CLI, MIT-licensed sources on GitHub); `accessibility` is the one exception —
fetched directly from its author's repo (`addyosmani/web-quality-skills`),
since it isn't in that registry. Content is copied verbatim from each
author's `SKILL.md`; treat those files as the source of truth, not this note.

| Skill | Author | Source |
| --- | --- | --- |
| `interface-design` | Dammyjay93 | https://github.com/Dammyjay93/interface-design |
| `better-layout` | jakubkrehel | https://github.com/jakubkrehel/skills |
| `baseline-ui` | ibelick | https://github.com/ibelick/ui-skills |
| `shadcn` | shadcn-ui | https://github.com/shadcn-ui/shadcn |
| `fixing-accessibility` | ibelick | https://github.com/ibelick/ui-skills |
| `better-accessibility` | jakubkrehel | https://github.com/jakubkrehel/skills |
| `react-router-framework-mode` | remix-run | https://github.com/remix-run |
| `harden` | pbakaus | https://github.com/pbakaus |
| `vercel-react-best-practices` (CLI slug: `react-best-practices`) | vercel-labs | https://github.com/vercel-labs/agent-skills |
| `accessibility` | web-quality-skills (Addy Osmani) | https://github.com/addyosmani/web-quality-skills |

## Why these three

- `interface-design` — craft-first guidance for dashboards/admin panels/SaaS
  (this CRM's exact category). Directly informed the sidebar fix: "same
  background as canvas, not a different color... a subtle border is enough"
  instead of a solid black block.
- `better-layout` — grouping, alignment, and structure rules. Used to merge
  the leads-listing search bar and filter row into one coherent toolbar.
- `baseline-ui` — general opinionated baseline against AI-generated UI slop
  (one accent color per view, no gratuitous gradients, accessible primitives).

## Why these five (added 2026-08-13)

- `shadcn` — project-aware shadcn/ui workflow (search/add/compose/fix
  components). Matches the component base decided in
  `docs/09-linea-grafica-frontend.md` §4 (shadcn/ui + Radix + Tailwind v3).
- `fixing-accessibility` — audits ARIA, focus, keyboard nav, color contrast,
  and form errors. Directly serves the non-negotiable rule that the semáforo
  is never color-only (§2 of docs/09) and the form-heavy screens (F4/F7/F8).
- `better-accessibility` — same author/track record as `better-layout`;
  focus states, keyboard support, ARIA, forms, screen readers. Complements
  `fixing-accessibility` with day-to-day component review guidance.
- `react-router-framework-mode` — loaders/actions/route patterns for React
  Router, still pending in F1 (enrutado + rutas protegidas por rol).
- `harden` — production-ready empty/error/edge-case states. Matches the
  "Criterios transversales de calidad" checklist item (estados de carga,
  vacío y error en cada vista; sin bloqueo de interfaz).

## Why these two more (added 2026-08-13, second pass)

- `vercel-react-best-practices` — Vercel Engineering's 70-rule React/Next.js
  performance guide. This repo is Vite, not Next.js, so the "server-*"
  category (Next.js SSR) doesn't apply — the rest (bundle, client data
  fetching, re-render, rendering, JS perf) does, and matches concrete needs:
  TanStack Query data fetching, the F3 leads table, and the live SLA counter
  that re-renders every second.
- `accessibility` — WCAG 2.2 audit skill (POUR framework, A/AA/AAA
  conformance, Lighthouse/axe-core testing protocol). Overlaps partially with
  `fixing-accessibility`/`better-accessibility` (already installed) but adds
  two things they don't: a formal "no color-only indicators" WCAG criterion
  (matches the semáforo rule exactly) and an audit/testing protocol, versus
  the other two which are component-level fix guidance.

To refresh the project skill index after adding/removing a skill, run
`gentle-ai skill-registry refresh --force` (writes `.atl/skill-registry.md`).
