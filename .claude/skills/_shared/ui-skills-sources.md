# UI Skills — provenance

Installed 2026-08-13 from the community registry at https://www.ui-skills.com/
(`skills/registry.json`, MIT-licensed sources on GitHub). Content is copied
verbatim from each author's `SKILL.md`; treat those files as the source of
truth, not this note.

| Skill | Author | Source |
| --- | --- | --- |
| `interface-design` | Dammyjay93 | https://github.com/Dammyjay93/interface-design |
| `better-layout` | jakubkrehel | https://github.com/jakubkrehel/skills |
| `baseline-ui` | ibelick | https://github.com/ibelick/ui-skills |

## Why these three

- `interface-design` — craft-first guidance for dashboards/admin panels/SaaS
  (this CRM's exact category). Directly informed the sidebar fix: "same
  background as canvas, not a different color... a subtle border is enough"
  instead of a solid black block.
- `better-layout` — grouping, alignment, and structure rules. Used to merge
  the leads-listing search bar and filter row into one coherent toolbar.
- `baseline-ui` — general opinionated baseline against AI-generated UI slop
  (one accent color per view, no gratuitous gradients, accessible primitives).

To refresh the project skill index after adding/removing a skill, run
`gentle-ai skill-registry refresh --force` (writes `.atl/skill-registry.md`).
