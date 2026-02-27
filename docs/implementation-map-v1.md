# Implementation Map v1

This document binds Section 12 deliverables from `engine_blueprint_v_1.md` to concrete module locations and public interfaces.

## 1) Core module map (non-optional)

- `engine/core`
  - Owns deterministic tick loop and lifecycle orchestration.
  - Enforces JSON-order layer processing invariant.
- `engine/systems`
  - Shared runtime services: `EventBus`, `StateStore`, `TimeSystem`, `SaveSystem`, `IntentRouter`, `UnlockEvaluator`, `ModifierResolver`.
- `engine/plugins`
  - `LayerRegistry` and layer plugin registration/bootstrap.
- `engine/ui`
  - `UIComposer` and UI tree shaping from unlocked node graph + view models.
- `engine/validation`
  - GameDefinition parsing, schema checks, reference checks, fail-fast startup errors.

---

## 2) Deliverable-to-module implementation binding (Section 12)

1. **Layer contract interface**
   - Module: `engine/core/contracts/BaseLayer.ts`
   - Used by: `engine/plugins/LayerRegistry.ts`, `engine/core/GameEngine.ts`

2. **EventBus (same-tick dispatch + subscriber snapshot)**
   - Module: `engine/systems/event-bus/EventBus.ts`
   - Contract: `engine/systems/event-bus/IEventBus.ts`

3. **StateStore (canonical vs derived policy)**
   - Module: `engine/systems/state-store/StateStore.ts`
   - Contract: `engine/systems/state-store/IStateStore.ts`

4. **LayerRegistry**
   - Module: `engine/plugins/LayerRegistry.ts`
   - Contract: `engine/plugins/ILayerRegistry.ts`

5. **GameDefinition parser + validator**
   - Modules:
     - `engine/validation/parser/parseGameDefinition.ts`
     - `engine/validation/schema/validateGameDefinitionSchema.ts`
     - `engine/validation/references/validateReferences.ts`

6. **Unlock evaluator + node reference scheme**
   - Modules:
     - `engine/systems/unlocks/UnlockEvaluator.ts`
     - `engine/systems/unlocks/nodeRef.ts`

7. **Engine tick loop (JSON array order)**
   - Module: `engine/core/GameEngine.ts`
   - Lifecycle helpers: `engine/core/lifecycle/*.ts`

8. **UIComposer MVP (only unlocked tabs/sections/elements)**
   - Module: `engine/ui/UIComposer.ts`
   - Types: `engine/ui/types.ts`

9. **Softcap utility**
   - Module: `engine/systems/modifiers/applySoftcap.ts`

10. **Layer reset pipeline**
   - Module: `engine/systems/reset/LayerResetService.ts`

11. **Intent router (reject locked target intents)**
   - Module: `engine/systems/intent/IntentRouter.ts`

12. **IdleLayer MVP (`progressLayer`)**
   - Plugin module: `engine/plugins/layers/progress/ProgressLayer.ts`
   - Registration module: `engine/plugins/layers/registerBuiltinLayers.ts`

---

## 3) Public interface signatures (v1 contracts)

```ts
// engine/core/contracts/BaseLayer.ts
export interface BaseLayer {
  readonly id: string;
  readonly type: string;

  init(context: LayerContext): void;
  update(dtMs: number): void;
  onEvent(event: EngineEvent): void;
  getViewModel(): LayerViewModel;
  destroy(): void;
}
```

```ts
// engine/systems/event-bus/IEventBus.ts
export interface EventBus {
  publish(event: EngineEvent): void; // enqueue-only during tick
  subscribe(
    eventType: string,
    handler: (event: EngineEvent) => void,
    scope?: string
  ): SubscriptionToken;
  unsubscribe(token: SubscriptionToken): void;
  dispatchQueued(): number; // FIFO, snapshot subscriber list per dispatch cycle
}
```

```ts
// engine/systems/state-store/IStateStore.ts
export interface StateStore {
  get<T = unknown>(path: string): T;
  set<T = unknown>(path: string, value: T): void;
  patch(path: string, partial: Record<string, unknown>): void;
  snapshot(): Readonly<Record<string, unknown>>;
}
```

```ts
// engine/systems/intent/IIntentRouter.ts
export interface IntentRouter {
  route(intent: EngineIntent): IntentResult;
  register(
    intentType: string,
    handler: (intent: EngineIntent) => IntentResult
  ): void;
}
```

```ts
// engine/systems/unlocks/IUnlockEvaluator.ts
export interface UnlockEvaluator {
  evaluateCondition(condition: UnlockCondition, state: StateStore): boolean;
  evaluateAll(definition: GameDefinition, state: StateStore): UnlockTransition[];
}
```

```ts
// engine/systems/modifiers/IModifierResolver.ts
export interface ModifierResolver {
  resolve(targetRef: NodeRef, key: string, baseValue: number): number;
  resolveSoftcapParam(
    targetRef: NodeRef,
    key: string,
    baseValue: number
  ): number;
}
```

---

## 4) Dependency direction rules

1. **Layers depend on interfaces only**
   - Layers import contracts (`EventBus`, `StateStore`, `ModifierResolver`, `UnlockEvaluator`) and never concrete system implementations.

2. **No direct layer-to-layer coupling**
   - A layer must not import another layer class or write into another layer namespace directly.
   - Cross-layer effects flow via events, targeted modifiers, and reset/unlock requests.

3. **UI is read-only with intents out**
   - `engine/ui` reads composed view models and unlocked-node projections only.
   - UI never calls `StateStore.set/patch` directly; all writes go through intents.

4. **No direct cross-layer state writes**
   - Allowed writes: layer writes under its own `state.layers[layerId]` namespace.
   - Engine/system-owned transitions (reset, unlock application) are centralized services.

5. **Validation is a startup gate**
   - `engine/validation` has no runtime mutation responsibilities.
   - Engine refuses to start on schema/reference errors.

---

## 5) Non-negotiable engine invariant: JSON-order processing

`engine/core/GameEngine` MUST process layer updates in the exact order of the `layers[]` array from the parsed GameDefinition.

- No sorting.
- No optional `order` override.
- No registration-time reordering.

This invariant is mandatory for deterministic behavior and simulation parity.

---

## 6) First integration slice (vertical path)

1. Parse JSON (`parseGameDefinition`) and validate schema + references.
2. Register built-in plugins and bind `progressLayer` in `LayerRegistry`.
3. Build runtime state, instantiate `ProgressLayer`, run exactly **1 tick**.
4. During tick: `ProgressLayer.update(dt)` publishes events; `EventBus.dispatchQueued()` flushes FIFO queue.
5. Run unlock evaluation transitions.
6. Compose and return unlocked UI tree via `UIComposer`.

Target acceptance check for this slice:

- input: minimal blueprint with one `progressLayer` and one always-unlocked element.
- output: after one tick, event queue dispatched, unlock map updated, and UI tree includes the unlocked element.
