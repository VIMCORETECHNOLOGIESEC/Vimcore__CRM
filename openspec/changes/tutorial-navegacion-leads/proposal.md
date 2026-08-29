# Lead navigation tutorial

## Intent

Guide authenticated users through the existing Leads workflow, from filtering
and opening a lead to using the operational workspace behind the WhatsApp
action button.

## Scope

- Add `react-joyride` to the frontend workspace.
- Provide a restartable, per-user persisted tour from `/leads`.
- Navigate from the list to an available lead detail during the tour.
- Explain the lead summary, WhatsApp workspace, progress form, appointment,
  and closing tabs.

## Constraints

- The tour must use real, accessible element anchors and Spanish copy.
- It must not invent lead history or bypass authorization.
- It must preserve the approved neutral UI system, using the existing IDEC
  accent only for tour emphasis.

## Dependency

`react-joyride` is added solely to render the guided, keyboard-accessible
product tour. It supports React 19 and does not replace the existing shadcn or
Radix primitives.
