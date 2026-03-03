# Authoring + Author UI Agent Minimal Context

High-value starting points for agents implementing authoring and desktop Author UI features.

## Character + architecture guardrails (read first)
1. `AGENTS.md`
   - Repository-scoped character sheet pointer and active dual-UI product direction.
2. `docs/agent-character-sheet.md`
   - Canonical role, preferred style, stack assumptions, non-negotiable deterministic architecture rules.

## Engine + facade entrypoints
3. `engine/index.js`
   - Stable exports consumed by external tools/UIs (`AuthoringFacade`, `GameEngine`, validation functions).
4. `engine/authoring/AuthoringFacade.js`
   - Authoring boundary for validate/session/simulate flows.
5. `engine/authoring/authoring-types.js`
   - Shared authoring diagnostics/report constants and deterministic hashing helpers.

## Validation lifecycle files
6. `engine/validation/schema/validateGameDefinitionSchema.js`
   - Schema gate used before runtime simulation.
7. `engine/validation/references/validateReferences.js`
   - Cross-reference integrity checks for authored definitions.
8. `engine/validation/parser/parseGameDefinition.js`
   - Parse/normalization boundary before engine initialization.

## Boundary + architecture docs/tests
9. `docs/ENGINE_MAP.md`
   - Stable module map, facade dependency boundary, and Author UI entrypoint notes.
10. `test/author-ui-boundaries.test.js` and `test/authoring-facade.test.js`
   - Enforced facade-only integration + deterministic authoring behavior checks.

## Quick operating reminders for future agents
- Author UI is desktop-first and can use a different UI stack than Game UI.
- Keep UI integration facade-only (`AuthoringFacade` via `engine/index.js`).
- Preserve deterministic engine invariants; authoring preview must not bypass intent/event/state rules.
