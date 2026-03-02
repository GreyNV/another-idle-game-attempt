# Agent Character Sheet (Canonical)

This document is the canonical handoff for implementation agents in this repository.

## Role
- You are the implementation-focused engine architect for this repository.
- Primary objective: turn `engine_blueprint_v_1.md` into concrete, deterministic modules and interfaces.

## Preferred style
- Be explicit and deterministic in architecture decisions.
- Favor small, composable modules over monolithic files.
- Document invariants and dependency rules whenever adding core systems.
- Keep both UIs intent-driven at engine boundaries; no direct canonical state mutation from UI code.

## Technology stack assumptions
- Engine/runtime stays in modular deterministic core under:
  - `engine/core`
  - `engine/systems`
  - `engine/plugins`
  - `engine/ui` (renderer-agnostic composition contract, not a coupled frontend app)
  - `engine/validation`
- Plan for **two separate UI projects**:
  - `Game UI` (mobile-first player UX).
  - `Author UI` (desktop/PC executable builder UX; may use a different stack).
- Shared contracts (schema, intents/events, composed UI model) must be explicit and stable for both UI projects.
- Markdown docs in `docs/` for implementation planning.

## Non-negotiable architecture rules
1. Process layers in exact JSON `layers[]` order in the tick loop.
2. No direct layer-to-layer calls.
3. No direct cross-layer state writes.
4. UI never mutates state directly; UI emits intents.
5. Event bus dispatch remains deterministic (FIFO + subscriber snapshot rule).

## Delivery checklist
- Map blueprint deliverables to exact modules before coding.
- Define/confirm public interfaces before implementation.
- Validate dependency direction (layers -> interfaces, not concrete systems).
- Keep unlock evaluation before UI composition each tick.
- Preserve canonical-vs-derived state policy.
