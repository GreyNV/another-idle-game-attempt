# ENGINE_MAP

Stable implementation map for the deterministic runtime.

## Public API stability

- Stable public API imports for external callers and black-box tests are exported from `engine/index.js`.
- Current stable exports are: `GameEngine`, `LayerRegistry`, `parseGameDefinition`, `validateGameDefinitionSchema`, `validateReferences`, and `ValidationError`.
- All deeper imports (for example `engine/systems/*`, `engine/ui/*`, and non-index paths under `engine/core/*`, `engine/plugins/*`, and `engine/validation/*`) are internal implementation details and are **not** covered by API stability guarantees.

## Stable file pointers

| Area | File pointer | Responsibility | Stable entry symbols |
|---|---|---|---|
| Tick loop + phase order | `engine/core/GameEngine.js` | Initializes runtime, owns deterministic phase loop, wires intent/event/unlock/ui flow. | `ENGINE_PHASE_SEQUENCE`, `GameEngine.initialize()`, `GameEngine.tick()` |
| Runtime composition | `engine/systems/createRuntimeSystems.js` | Constructs and returns system instances with dependency injection boundaries. | `createRuntimeSystems(options)` |
| Event bus | `engine/systems/event-bus/EventBus.js` | FIFO event queue, subscriber snapshot dispatch, cycle limits. | `EventBus.publish()`, `EventBus.subscribe()`, `EventBus.dispatchQueued()` |
| State store | `engine/systems/state-store/StateStore.js` | Canonical state container with deterministic read/write patch/snapshot operations. | `StateStore.get()`, `StateStore.set()`, `StateStore.patch()`, `StateStore.snapshot()` |
| Intent routing | `engine/systems/intent/IntentRouter.js` | Registers intent handlers and routes UI/game intents to systems. | `IntentRouter.register()`, `IntentRouter.route()` |
| Unlock evaluation | `engine/systems/unlocks/UnlockEvaluator.js` | Evaluates unlock transitions and progress across all targets each tick. | `UnlockEvaluator.evaluateAll()`, `UnlockEvaluator.evaluateProgressAll()` |
| UI composition | `engine/ui/UIComposer.js` | Builds renderer-facing, read-only UI model from definition + state readers. | `UIComposer.compose()` |
| Layer plugin registry | `engine/plugins/LayerRegistry.js` | Registers layer factories by type and instantiates valid layer plugins. | `LayerRegistry.register()`, `LayerRegistry.createLayer()` |
| Layer reset service | `engine/systems/reset/LayerResetService.js` | Executes reset with keep rules and emits reset event. | `LayerResetService.preview()`, `LayerResetService.execute()` |
| Save pipeline | `engine/systems/save/SaveSystem.js` | Deterministic snapshot serialization/deserialization and schema-version migration gate. | `SaveSystem.serialize()`, `SaveSystem.deserialize()`, `SaveSystem.migrate()` |

## Dataflow summary

1. `GameEngine.initialize()` parses definition and composes runtime systems.
2. `GameEngine.tick()` runs deterministic phases in order: input → time → layer-update → event-dispatch → unlock-evaluation → render.
3. Intents pass through `IntentRouter`; state mutations occur via system handlers and `StateStore`.
4. Events are enqueued/published on `EventBus` and drained via deterministic dispatch cycles.
5. Unlocks are evaluated before `UIComposer.compose()` so rendered placeholders/progress reflect latest unlock state.

## Where to implement X

### New intent

- Register the intent type and handler in engine wiring (`GameEngine` runtime subscriptions / intent setup).
- Add or extend routing behavior in `engine/systems/intent/IntentRouter.js` when new validation/dispatch behavior is needed.
- Implement side effects in the owning domain system (e.g., reset, routine, upgrades), not in UI.

### New unlock operator

- Extend unlock condition parser/evaluator in unlock-condition utilities used by `UnlockEvaluator`.
- Keep `UnlockEvaluator` orchestration deterministic; operator semantics belong in parser/eval helpers.
- Add tests for transition and progress behavior for the operator.

### New softcap mode

- Add mode implementation in the relevant progression/math subsystem (softcap application logic).
- Ensure canonical inputs remain in state systems and derived outputs are computed, not persisted.
- Verify deterministic behavior at threshold boundaries.

### New layer type

- Add a layer plugin/factory and register it through built-in layer registration flow.
- Enforce base layer contract and no direct cross-layer writes.
- Use `LayerRegistry` as the only creation path.

### New UI element type

- Extend `engine/ui/UIComposer.js` element composition branch for the new type.
- Keep output read-only view-model data and emit intents for interactions.
- Never mutate `StateStore` from UI composition.


## Dual UI project direction

- The repository roadmap supports two independent UI projects:
  - Game UI: mobile-first player interface.
  - Author UI: desktop/PC executable builder interface (may use a different stack).
- `engine/ui/UIComposer.js` remains a renderer-agnostic composition layer, not a coupled app frontend.
- Shared contracts for both UIs should be stabilized before implementation scaling (see `docs/ui-project-split-plan.md`).
