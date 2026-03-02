# Implementation Map v1

This document binds Section 12 deliverables from `engine_blueprint_v_1.md` to the current JavaScript modules and exported symbols.

## 1) Core module map (non-optional)

- `engine/core`
  - Deterministic tick loop and lifecycle orchestration.
  - Enforces authored `layers[]` order during updates.
- `engine/systems`
  - Shared runtime services: `EventBus`, `StateStore`, `TimeSystem`, `SaveSystem`, `IntentRouter`, `UnlockEvaluator`, `ModifierResolver`.
- `engine/plugins`
  - `LayerRegistry` and layer plugin registration/bootstrap.
- `engine/ui`
  - `UIComposer` renderer-agnostic, read-only UI tree composition contract for external UI clients.
- `engine/validation`
  - Parser + schema/reference validation gates.

---

## 2) Deliverable-to-module implementation binding (Section 12)

1. **Layer contract interface**
   - Module: `engine/core/contracts/BaseLayer.js`
   - Exported symbols: `BASE_LAYER_CONTRACT`, `REQUIRED_LAYER_METHODS`, `assertValidBaseLayerInstance`

2. **EventBus (same-tick dispatch + subscriber snapshot)**
   - Module: `engine/systems/event-bus/EventBus.js`
   - Exported symbol: `EventBus`

3. **StateStore (canonical vs derived policy)**
   - Module: `engine/systems/state-store/StateStore.js`
   - Exported symbol: `StateStore`

4. **LayerRegistry**
   - Module: `engine/plugins/LayerRegistry.js`
   - Exported symbol: `LayerRegistry`

5. **GameDefinition parser + validator**
   - Modules:
     - `engine/validation/parser/parseGameDefinition.js` → `parseGameDefinition`
     - `engine/validation/schema/validateGameDefinitionSchema.js` → `validateGameDefinitionSchema`
     - `engine/validation/references/validateReferences.js` → `validateReferences`

6. **Unlock evaluator + node reference scheme**
   - Modules:
     - `engine/systems/unlocks/UnlockEvaluator.js` → `UnlockEvaluator`
     - `engine/systems/unlocks/nodeRef.js` → `buildNodeRef`, `buildLayerRef`, `buildSublayerRef`, `buildSectionRef`, `parseNodeRef`

7. **Engine tick loop (JSON array order)**
   - Module: `engine/core/GameEngine.js`
   - Exported symbols: `GameEngine`, `ENGINE_PHASES`, `ENGINE_PHASE_SEQUENCE`

8. **UIComposer MVP (only unlocked tabs/sections/elements)**
   - Module: `engine/ui/UIComposer.js`
   - Exported symbol: `UIComposer`

9. **Softcap utility**
   - Module: `engine/systems/modifiers/applySoftcap.js`
   - Exported symbols: `applySoftcap`, `SUPPORTED_SOFTCAP_MODES`

10. **Layer reset pipeline**
   - Module: `engine/systems/reset/LayerResetService.js`
   - Exported symbol: `LayerResetService`

11. **Intent router (reject locked target intents)**
   - Module: `engine/systems/intent/IntentRouter.js`
   - Exported symbol: `IntentRouter`

12. **IdleLayer MVP (`progressLayer`)**
   - Plugin module: `engine/plugins/layers/progress/ProgressLayer.js` → `ProgressLayer`
   - Registration module: `engine/plugins/layers/registerBuiltinLayers.js` → `registerBuiltinLayers`

13. **Save pipeline + schema migration gate (baseline)**
   - Module: `engine/systems/save/SaveSystem.js`
   - Exported symbol: `SaveSystem`
   - Runtime composition: `engine/systems/createRuntimeSystems.js` → `createRuntimeSystems` returns `saveSystem`


14. **Runtime service contracts (JSDoc typedef surfaces)**
   - Modules:
     - `engine/core/contracts/EventBusContract.js` → `EVENT_BUS_CONTRACT`, `EventBusContract` typedef
     - `engine/core/contracts/StateStoreContract.js` → `STATE_STORE_CONTRACT`, `StateStoreContract` typedef
     - `engine/core/contracts/IntentRouterContract.js` → `INTENT_ROUTER_CONTRACT`, `IntentRouterContract` typedef
     - `engine/core/contracts/UnlockEvaluatorContract.js` → `UNLOCK_EVALUATOR_CONTRACT`, `UnlockEvaluatorContract` typedef
     - `engine/core/contracts/ModifierResolverContract.js` → `MODIFIER_RESOLVER_CONTRACT`, `ModifierResolverContract` typedef

---

## 3) Runtime construction and dependency rules

- `engine/systems/createRuntimeSystems.js`
  - Sources save schema version from `definition.meta.schemaVersion`.
  - Constructs `SaveSystem` with `{ schemaVersion, compatibilityPolicy: options.schemaVersionPolicy }`.
- `engine/core/GameEngine.js`
  - Attaches `systems.saveSystem` to `this.saveSystem` during `initialize()`.
  - Exposes `saveSystem` through phase context for deterministic callers.

Dependency direction constraints remain unchanged:

1. Layers depend on contracts/contexts, not concrete sibling layers.
2. No direct layer-to-layer imports or direct cross-layer writes.
3. UI is read-only and emits intents.
4. Validation is startup-only and fail-fast.
5. Unlock evaluation runs before render/UI composition each tick.

---

## 4) Non-negotiable invariant: authored JSON-order processing

`engine/core/GameEngine.js` processes layer updates in exact parsed `layers[]` order.

- No sorting.
- No optional order override.
- No registration-time reordering.

Routine traversal follows authored order in `sublayers[].sections[].elements[]` within `RoutineSystem`.

---

## 5) Dual UI project plan alignment

- Architecture now plans for two separate frontends:
  - **Game UI** (mobile-first player runtime UX).
  - **Author UI** (desktop/PC executable builder UX, different stack allowed).
- Engine modules remain UI-framework-agnostic and expose stable contracts consumed by both UIs.
- Primary planning doc: `docs/ui-project-split-plan.md`.
- Shared boundary candidates to stabilize next:
  - validation schema/version policy,
  - intent/event catalogs,
  - composed UI node model from `UIComposer`,
  - validation error surfaces.
