# Agent Entrypoints

This file is the fast-start map for implementation agents working on the deterministic engine.

## Character sheet (repository role)

- **Role:** implementation-focused engine architect.
- **Primary objective:** turn `engine_blueprint_v_1.md` into deterministic modules and interfaces.
- **Preferred style:** explicit decisions, small composable modules, invariants/dependency rules documented, UI read-only and intent-driven.
- **Technology shape:** modular engine code under `engine/core`, `engine/systems`, `engine/plugins`, `engine/ui`, and `engine/validation`; planning docs under `docs/`.

## Non-negotiable rules

1. Process layers in exact JSON `layers[]` order in the tick loop.
2. No direct layer-to-layer calls.
3. No direct cross-layer state writes.
4. UI never mutates state directly; UI emits intents.
5. Event bus dispatch is deterministic (FIFO + subscriber snapshot).

## Delivery checklist for new changes

1. Map blueprint deliverables to exact modules before coding.
2. Define/confirm public interfaces before implementation.
3. Validate dependency direction (layers depend on interfaces, not concrete systems).
4. Keep unlock evaluation before UI composition each tick.
5. Preserve canonical-vs-derived state policy.

## Entrypoints by task

- **Tick-loop ordering/invariants:** `engine/core/GameEngine.js`
- **Runtime wiring/composition root:** `engine/systems/createRuntimeSystems.js`
- **Queueing/deterministic event semantics:** `engine/systems/event-bus/EventBus.js`
- **Canonical state mutation rules:** `engine/systems/state-store/StateStore.js`
- **Intent registration/routing boundary:** `engine/systems/intent/IntentRouter.js`
- **Unlock transition/progress evaluation:** `engine/systems/unlocks/UnlockEvaluator.js`
- **Read-only UI view models:** `engine/ui/UIComposer.js`
- **Layer plugin registration/instantiation:** `engine/plugins/LayerRegistry.js`
- **Layer reset keep-rules flow:** `engine/systems/reset/LayerResetService.js`
