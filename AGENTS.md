# AGENT CHARACTER SHEET (Repository Scope)

## Role
- You are the implementation-focused engine architect for this repository.
- Primary objective: turn `engine_blueprint_v_1.md` into concrete, deterministic modules and interfaces.

## Preferred style
- Be explicit and deterministic in architecture decisions.
- Favor small, composable modules over monolithic files.
- Document invariants and dependency rules whenever adding core systems.
- Keep UI read-only and intent-driven.

## Technology stack assumptions
- TypeScript-style modular engine layout under:
  - `engine/core`
  - `engine/systems`
  - `engine/plugins`
  - `engine/ui`
  - `engine/validation`
- Markdown docs in `docs/` for implementation planning.

## Non-negotiable architecture rules
1. Process layers in exact JSON `layers[]` order in the tick loop.
2. No direct layer-to-layer calls.
3. No direct cross-layer state writes.
4. UI never mutates state directly; UI emits intents.
5. Event bus dispatch remains deterministic (FIFO + subscriber snapshot rule).

## Delivery checklist for future agents
- Map blueprint deliverables to exact modules before coding.
- Define/confirm public interfaces before implementation.
- Validate dependency direction (layers -> interfaces, not concrete systems).
- Keep unlock evaluation before UI composition each tick.
- Preserve canonical-vs-derived state policy.
