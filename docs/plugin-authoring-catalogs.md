# Plugin Author Guide: Event + Intent Catalogs

This engine now keeps two source-of-truth registries for runtime messaging. Plugin code must align with these catalogs before wiring new behavior.

## Deterministic messaging invariants

- Event publish-time validation can run in strict mode (`devModeStrict`) and must pass before events enter the FIFO queue.
- Intent payloads are validated before routing.
- Intents with `reject-if-target-locked` policy are rejected before handler execution when their `targetRef` is locked.
- UI remains intent-only; plugins should never rely on direct UI-to-state writes.

## Event catalog (`engine/systems/catalogs/eventCatalog.js`)

Each event type declares:

- `payloadSchema` (human-readable schema shape)
- `validatePayload(payload)` deterministic validator
- `producers`
- `consumers`
- `phaseConstraints`

### Seeded events

1. `UNLOCKED`
   - Produced by `UnlockEvaluator`
   - First consumer: `progressLayer`
   - Phase: `unlock-evaluation`
2. `LAYER_RESET_REQUESTED`
   - Produced by `IntentRouter`, `progressLayer`
   - Consumed by `LayerResetService`
   - Phases: `input`, `event-dispatch`
3. `LAYER_RESET_EXECUTED`
   - Produced by `LayerResetService`
   - First consumer: `progressLayer`
   - Phase: `event-dispatch`

## Intent catalog (`engine/systems/catalogs/intentCatalog.js`)

Each intent type declares:

- `payloadSchema`
- `validatePayload(payload)`
- `routingTarget`
- `lockCheckPolicy`

### Early gameplay intents

- `START_JOB` → `progressLayer`
- `STOP_JOB` → `progressLayer`
- `REQUEST_LAYER_RESET` → `LayerResetService`
- `PULL_GACHA` → `gachaLayer`
- `ACTIVATE_MINIGAME` → `minigameLayer`

All seeded gameplay intents currently use `reject-if-target-locked`.

## How plugin authors should extend catalogs

1. Add a catalog entry first (event or intent).
2. Keep validators deterministic and side-effect free.
3. Specify real producers/consumers (or routing target) explicitly.
4. Add/adjust phase constraints for events.
5. Register runtime handlers only after catalog entry exists.

## Event dispatch semantics for plugin authors

`EventBus` behavior is intentionally explicit and deterministic:

- **Queue-only publish:** `eventBus.publish(event)` only appends to the queue. No handler runs synchronously inside `publish`.
- **FIFO dispatch:** `dispatchQueued()` drains events in the order they were published within each cycle.
- **Subscriber snapshot semantics:** each dispatch cycle snapshots subscribers per event type; subscribe/unsubscribe changes made while handling events are applied on the **next** cycle.
- **Events emitted during dispatch:** if a handler publishes a new event, that event is queued for the next dispatch cycle in the same tick.
- **Guardrails:**
  - `maxEventsPerTick` throws when a tick processes too many events (recursive publish loop protection).
  - `maxDispatchCyclesPerTick` limits same-tick dispatch cycles; any remaining queued events are deferred to the next tick.

Plugin recommendation: avoid unbounded re-publish loops and design handlers to converge in a bounded number of cycles.
