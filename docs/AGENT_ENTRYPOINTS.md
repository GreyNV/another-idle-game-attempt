# Agent Entrypoints

This file is the fast-start map for implementation agents working on the deterministic engine.

## Character sheet reference
- Canonical role/style/stack/rules/checklist: `docs/agent-character-sheet.md`.
- Keep this file focused on entrypoints and module boundaries.

## Entrypoints by task

- **Stable external API surface:** `engine/index.js` (only this module is semver-stable for external callers/tests).
- **Internal implementation modules:** everything else under `engine/**` is non-stable unless re-exported by `engine/index.js`.

- **Tick-loop ordering/invariants:** `engine/core/GameEngine.js`
- **Runtime wiring/composition root:** `engine/systems/createRuntimeSystems.js`
- **Queueing/deterministic event semantics:** `engine/systems/event-bus/EventBus.js`
- **Canonical state mutation rules:** `engine/systems/state-store/StateStore.js`
- **Intent registration/routing boundary:** `engine/systems/intent/IntentRouter.js`
- **Unlock transition/progress evaluation:** `engine/systems/unlocks/UnlockEvaluator.js`
- **Read-only UI view models:** `engine/ui/UIComposer.js`
- **Layer plugin registration/instantiation:** `engine/plugins/LayerRegistry.js`
- **Layer reset keep-rules flow:** `engine/systems/reset/LayerResetService.js`

## Dual-UI architecture entrypoints
- Split plan and rollout phases: `docs/ui-project-split-plan.md`
- Player-facing composition contract: `engine/ui/UIComposer.js`
- Schema/definition gates for authoring workflows: `engine/validation/parser/parseGameDefinition.js`, `engine/validation/schema/validateGameDefinitionSchema.js`, `engine/validation/references/validateReferences.js`
- Intent/event catalogs shared by both UIs: `engine/systems/catalogs/intentCatalog.js`, `engine/systems/catalogs/eventCatalog.js`
- Rule reminder: Game UI is mobile-first; Author UI is desktop-first and may use a different frontend stack.
