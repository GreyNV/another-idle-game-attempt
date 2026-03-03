# Author UI Architecture (Desktop-First)

## Purpose
Define the architecture for the desktop-first Author UI so it can evolve independently from the mobile-first Game UI while still using deterministic engine contracts.

## Desktop-first UI structure

Author UI is optimized for keyboard/mouse workflows, dense information layouts, and side-by-side editing + diagnostics + simulation.

### Recommended surface areas
- **Definition editor pane**
  - Structured and raw JSON editing for game definitions.
- **Diagnostics pane**
  - Schema/reference validation issues with stable codes and JSON pointer paths.
- **Simulation controls pane**
  - Tick count, deterministic seed, dt, intent timeline controls.
- **Simulation output pane**
  - Snapshot timeline, event counts/tail, unlock states, and KPI summaries.
- **File operations bar**
  - Open, save, export, and migration/status actions.

### Current implementation entrypoints
- App bootstrap: `apps/author-ui/src/main.jsx`
- App shell + UX orchestration: `apps/author-ui/src/App.jsx`
- Local API adapter to engine facade: `apps/author-ui/server/index.cjs`

## Facade-only integration rule

Author UI must integrate through `AuthoringFacade` from `engine/index.js`.

### Required boundary
- Allowed engine touchpoint for Author UI:
  - `AuthoringFacade.validate(definition)`
  - `AuthoringFacade.createSession(definition, options)`
  - `AuthoringFacade.simulate(definition, scenario)`
  - session helpers (`stepSession`, `disposeSession`) as needed.

### Disallowed boundary
- No direct Author UI imports from:
  - `engine/core/*`
  - `engine/systems/*`
  - `engine/plugins/*`
  - `engine/ui/*`
  - `engine/validation/*`
- No direct canonical state mutation from Author UI code.

### Enforcement
- `test/author-ui-boundaries.test.js` verifies no forbidden internal imports and no direct state mutation patterns in Author UI sources.

## Deterministic simulation preview flow

1. **Edit draft definition** in the Author UI.
2. **Validate** via `AuthoringFacade.validate`.
3. If valid, run **simulate** via `AuthoringFacade.simulate` with explicit scenario inputs:
   - `ticks`
   - `seed`
   - `dt`
   - optional `intentsByTick`
4. Facade initializes deterministic runtime and produces:
   - timeline snapshots,
   - event summaries,
   - unlock/progression indicators,
   - deterministic payload hashes for repeatability checks.
5. UI renders results as read-only preview artifacts; edits only affect the next validation/simulation request.

## File I/O and validation lifecycle

Author UI file lifecycle should be explicit and repeatable:

1. **Load**
   - Read JSON definition from disk.
   - Parse into editor model and mark as dirty/clean baseline.
2. **Pre-validate**
   - Fast JSON parse checks before remote/server calls.
3. **Engine validation gate**
   - Run `AuthoringFacade.validate`.
   - Display diagnostics by code/path/message/hint.
4. **Preview**
   - Run deterministic simulation only when validation succeeds.
5. **Save draft**
   - Persist source JSON with metadata (optional local-only fields).
6. **Export/publish candidate**
   - Re-run validation + simulation smoke checks.
   - Fail closed if diagnostics are non-empty.

## Relationship to dual-UI direction

- Game UI and Author UI remain separate projects.
- Shared contracts (schema, intents/events, composed models, validation errors) are stable cross-project boundaries.
- Author UI remains desktop-first and tooling-oriented; Game UI remains player runtime and mobile-first.
