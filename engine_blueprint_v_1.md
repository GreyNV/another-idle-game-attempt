# Engine Blueprint v1 (patched → v1.1)

## 0. The North Star

**Engine goal:** Load a JSON “Game Definition”, instantiate a runtime world from it, and run a deterministic update loop where:

- **Logic is modular:** each mechanic lives in a Layer type (a plugin).
- **UI is generated:** tabs, sub-tabs, sections, elements are created from the same definition.
- **Layers do not couple:** coordination happens through PubSub events and shared state queries.
- **Simulation mode exists:** run the same game headless for balancing.

The engine is a host. The JSON is a blueprint. Layer types are plugins.

---

## 1. Runtime Object Model

### 1.1 Core Runtime Entities

**GameEngine**

- Owns the update loop (tick).
- Owns the registry of Layer types.
- Owns systems: EventBus, StateStore, TimeSystem, SaveSystem, UIComposer.
- Loads GameDefinition JSON and builds runtime.

**GameDefinition**

- Parsed version of JSON.
- Contains layers, layout, initial state, schemas, balancing constants.

**LayerInstance**

- Created from GameDefinition layer entry.
- Has id, type, config, state slice, UI tree slice.
- Implements the Layer contract (init, update, onEvent, getViewModel).

**UI Tree**

- A pure description of UI components.
- Produced by UIComposer from config plus layer view models.
- Renders without owning game logic.

---

## 2. The Layer Contract

This is the sacred interface. Every new mechanic plugs in here.

### 2.1 BaseLayer Responsibilities

Common behavior all layers inherit:

- **Lifecycle**

  - `init(context)`
  - `update(dt)`
  - `destroy()`

- **Events**

  - `onEvent(event)`
  - `publish(event)` helper
  - `subscribe(eventType, handler)` helper

- **State**

  - `getState() / setState(patch)` via StateStore
  - Namespaced under `state.layers[layerId]`

- **Modifiers**

  - `getEffectiveValue(key, base)` helper
  - Uses ModifierSystem resolution rules (global -> layer -> sublayer -> section -> element)

### 2.2 Specialized Layer Types

Layer types are registered plugins. The engine only cares that each layer implements the BaseLayer contract.

**Infrastructure-first v1 scope:** implement only one gameplay layer type for end-to-end testing:

- `ProgressLayer` (IdleLayer test)

**Planned meta layers (after infrastructure is stable):**

- `StatisticsLayer` (auditor, run vs overall)
- `AchievementsLayer` (milestones + cross-layer effects)

Other layer types (minigames, gacha, inventory, automation, logs, summaries, etc.) are intentionally deferred. As long as the engine can load, run, render, and persist one layer end-to-end, adding more types later is just additional plugins.

---

## 3. Engine Systems

Think of these as “standard organs” the engine provides so layers stay small and sane.

### 3.1 LayerRegistry (Plugin Loader)

- Maps `type` string -> class constructor
- Validates required capabilities (supportsUI, supportsSimulation, etc.)

**Rule:** Adding a new mechanic equals adding a new Layer class and registering it.

### 3.2 EventBus (PubSub)

- Central dispatcher
- Supports:
  - `publish(event)`
  - `subscribe(eventType, handler, scope?)`
  - `unsubscribe(token)`
- Optional: event history ring buffer for debugging and log UI

**Event shape (recommended):**

- `type`
- `ts` (engine time)
- `source` (layerId)
- `payload`
- `meta` (severity, tags)

**Rule:** No layer calls another layer directly.

#### 3.2.1 Event Timing Contract (Determinism Rule)

To prevent missed events, non-deterministic ordering, and re-entrancy bugs:

- **Publish is enqueue-only.** `publish()` adds the event to the tick queue.
- **Dispatch happens in a dedicated phase** (see Update Loop), in FIFO order.
- **Same-tick delivery:** events published during a tick are dispatched in that same tick (in the Event Dispatch Phase).
- **Subscriber snapshot rule:** the subscriber list for a dispatch cycle is snapshotted at the start of that dispatch cycle. Subscribing/unsubscribing during dispatch only affects future dispatch cycles.

This preserves responsiveness while keeping event delivery deterministic.

### 3.3 StateStore (Single source of truth)

- Holds full state tree
- Allows:
  - `get(path)`
  - `set(path, value)`
  - `patch(path, partialObject)`
- Emits `STATE_CHANGED` events optionally (careful: can create noisy feedback loops)

**Rule:** UI reads from state and view models. UI never mutates state directly. UI sends intents.

#### 3.3.1 Derived Values Policy (Avoid Future Pain)

- Persist **only canonical values** (resources owned, purchases, timers, flags).
- Do **not** persist derived values (e.g., “goldPerSecond”, “effectiveGain”).
- Derived values must be computed from canonical state + definition rules, and may be cached at runtime.

This prevents stale values, migration nightmares, and UI/simulation divergence.

### 3.4 TimeSystem

- Manages dt, tick rate, speed multipliers
- Supports offline progress (optional v2)
- Provides canonical engine time to make simulation deterministic

### 3.5 ModifierSystem

- Resolves effective multipliers and overrides
- Provides:
  - `resolve(targetRef, key)` -> final value
  - `stackingRules` (additive, multiplicative, max, min)
- Scope chain:
  - Global -> Layer -> Sublayer -> Section -> Element

**This is where games go to become gods or become bugs. Define it early.**

#### 3.5.1 Ownership Rule (Discoverable, Layer-Owned Definitions; Engine-Owned Resolution)

To keep content readable and to support Stats/UI breakdowns:

- **Definitions live in the Layer tree** (the JSON content model): modifiers and softcaps are defined at layer/sublayer/section/element scopes.
- **The Engine owns compilation + resolution + caching** of those definitions.

This preserves:

- A single discoverable source of truth for “what modifiers/softcaps exist” (Statistics UI can traverse definitions).
- A single fast deterministic implementation for “how the effective value is computed” (engine-side).

#### 3.5.2 Inheritance Rule (No Copy-Down)

Modifiers/softcap-parameter modifiers are **inherited by resolution**, not duplicated:

- When resolving a value for a node, the resolver considers ancestor scopes in order:
  - global → layer → sublayer → section → element
- The system must **not copy arrays downward** to avoid mutation confusion.

### 3.6 UIComposer

- Generates:
  - tabs (layers)
  - sub-tabs (sublayers)
  - sections
  - elements
- Uses:
  - GameDefinition layout rules
  - Layer view models

**Key output:** a pure UI description tree, easy to render.

### 3.7 SaveSystem

- Serialize state + version
- Migration support (when JSON schema changes)
- Snapshot for simulation runs

### 3.8 Validation System

- Validates JSON schema
- Validates references (modifier targets, event names)
- Fails fast at startup with human-readable errors

---

## 4. Update Loop Flow

The engine loop needs to be predictable and free of side effects that cause order bugs.

### 4.1 Tick Pipeline

1. **Input Phase**

   - UI sends “intents” to engine (not raw state patches)
   - Engine converts intent to events or state changes

2. **Time Phase**

   - Compute `dt` based on real time and time multiplier

3. **Layer Update Phase**

   - Update layers in deterministic order
   - **Determinism source:** layers are processed in the **exact sequence they appear in the JSON** (array order). No sorting, no `order` field.

   - Rationale: JSON order is explicit, stable, and avoids hidden reordering bugs.

4. **Event Dispatch Phase**

   - Dispatch events published during the tick
   - Dispatch in FIFO order
   - Optional safety: cap events per tick, log overflow

5. **Unlock Evaluation Phase**

   - Evaluate unlock conditions deterministically
   - Apply locked → unlocked transitions (v1: one-way)
   - Emit `UNLOCKED { targetRef, reason? }` events for transitions

6. **Render Phase**

   - Gather view models from layers
   - Compose UI tree
   - Render UI

### 4.2 Determinism Rules

- A layer update must not depend on UI state.
- Randomness must use a seeded RNG (especially for gacha) if you want reproducible simulations.
- Event dispatch order must be stable.

---

## 5. UI to Engine Interaction

### 5.1 Intent Model

UI emits high-level intents like:

- `START_JOB { jobId }`
- `STOP_JOB { jobId }`
- `PULL_GACHA { bannerId, count }`
- `ACTIVATE_MINIGAME { minigameId }`

The engine routes intents to:

- either the owning layer (by mapping intent type -> layer)
- or a generic command router

This avoids UI being tied to layer internals.

---

## 6. JSON Blueprint Structure

This is the “game can be swapped by switching JSON” promise. Keep it clean.

### 6.1 Top-Level

- `meta`: name, version, author, seed
- `layout`: main, sidebars, logging rules
- `systems`: tick rate, default stacking rules
- `layers`: the heart

### 6.2 Layer Definition

Each layer entry:

- `id`
- `type`
- `title`
- `sublayers`: tabs under the layer
- `ui`: sections and elements
- `rules`: formulas, unlocks, scaling constants
- `modifiers`: initial modifiers or unlockable ones
- `softcaps`: softcap definitions or parameter bases (scoped)
- `events`: optional allowed events list (for validation)
- `reset`: optional layer reset configuration

**Rule:** JSON describes content and parameters. Engine code contains behavior.

---

## 6.3 Unlocks and Visibility (Applies to All Nodes)

Visibility is controlled by a **locked/unlocked state** evaluated from conditions defined in JSON.

**Scope:** the same unlock concept applies to every node in the hierarchy:

- Layer
- Sublayer
- Section
- Element (e.g., a progress bar, button, resource display)

### 6.3.1 Core Concepts

- **Locked:** not visible (and usually not interactive).
- **Unlocked:** visible and eligible for interaction.
- **Condition:** a rule that evaluates against the StateStore (and optionally derived values) to decide whether a node becomes unlocked.

### 6.3.2 Engine Responsibilities

The engine must provide infrastructure to:

1. **Evaluate unlock conditions** deterministically.
2. **Filter UI generation** so only unlocked nodes render.
3. **Prevent invalid actions** (ignore or reject intents targeting locked nodes).
4. **Emit unlock events** when something transitions from locked → unlocked.

Recommended event:

- `UNLOCKED { targetRef, reason? }`

### 6.3.3 Unlock Evaluation Policy (v1)

For v1, keep it simple and predictable:

- Unlocks are evaluated **at the end of each tick** (after layer updates and event dispatch), before UI composition.
- A node can only move **locked → unlocked** in v1 (no re-locking). Re-locking can be a later feature.
- Nodes have stable references like:
  - `layer:idle`
  - `layer:idle/sublayer:routines`
  - `layer:idle/sublayer:routines/section:jobs`
  - `.../element:job_woodcutter`

### 6.3.4 Condition Format (v1 placeholder)

Exact condition syntax can evolve, but the engine needs an interface like:

- `evaluateCondition(condition, state) -> boolean`

Common early condition types:

- state value comparisons (>=, <=, ==)
- existence checks
- boolean flags

---

## 6.4 Cross-Layer Effects (Infrastructure Requirement)

Future layers must be able to affect previous or next layers without direct coupling.

**Rule:** cross-layer influence occurs via **events**, **modifiers**, and **reset triggers** that target a node reference.

Minimal infrastructure the engine must support:

- **Target references** that can point across layers, such as:

  - `layer:idle` (layer)
  - `layer:idle/.../element:job_woodcutter` (specific element)

- **Event routing**: any layer may publish events that other layers subscribe to.

- **Targeted modifiers**: modifiers may target nodes in other layers by reference.

- **Targeted reset triggers**: a layer may request a reset of another layer via an event/command, subject to validation.

Guard rail (v1): allow cross-layer effects only through these explicit mechanisms; no direct state writes across layer namespaces.

---

## 6.5 Statistics and Achievements Layers (Planned)

These two layers are “meta-systems”: they observe gameplay and then feed back into it.

### 6.5.1 StatisticsLayer

**Purpose:** act as an auditor that counts key events and records milestones.

It tracks:

- level-ups, completions, purchases
- resets executed (by layer, by reset id)
- modifiers applied / changed
- softcap hits (and how deep into softcap the player went)
- maxima like:
  - max progress bar level reached
  - max resource amount reached

**Dual time horizons:**

- **This run**: resets when the relevant layer reset executes
- **Overall**: persists across resets and is the canonical history

**Data sources:**

- The StatisticsLayer primarily subscribes to engine/layer events (the source of truth), such as:
  - `PROGRESS_COMPLETE`, `XP_GAINED`, `UNLOCKED`
  - `MODIFIER_APPLIED`, `SOFTCAP_APPLIED`
  - `LAYER_RESET_EXECUTED`

This is intentionally more reliable than trying to infer history from current state.

### 6.5.2 AchievementsLayer

**Purpose:** award milestones and apply effects to other layers.

- Achievements depend on **StatisticsLayer** to evaluate milestones accurately across resets.
- When an achievement is earned, it triggers one or more effects:
  - targeted modifiers (buffs, softcap threshold increases, power tweaks)
  - unlocks (reveal new nodes)
  - reset-related benefits (e.g., keep extra resources)

**Guard rail:** Achievements must affect other layers only via the same explicit mechanisms:

- publish events
- apply targeted modifiers
- request unlock transitions
- request layer resets (if allowed)

---

## 7. Test Layer: IdleLayer MVP (Only Layer in v1)

For v1 infrastructure testing, the single test layer is the **IdleLayer** (implemented as a `ProgressLayer` plugin type).

Purpose: prove the engine end-to-end:

- JSON → runtime instantiation
- state updates on ticks
- unlock evaluation for sublayers/sections/elements
- UI generation from unlocked nodes
- intent routing (start/stop/select)
- softcaps applied consistently
- layer reset pipeline (preview + execute)

### 7.1 IdleLayer MVP: Sublayer Types

Sublayers are categorized by **type**. The engine does not hardcode the gameplay; it provides the structure so the layer plugin can interpret sublayer definitions predictably.

- **sublayer**: idle progress bars (repeatable activities)
- **sublayer**: repeatable upgrades with scaling costs
- **sublayer**: one-time unlockable upgrades

### 7.2 Softcaps (Required v1 Infrastructure)

Softcaps reduce gains above a threshold in a smooth, predictable way.

**Principle:** a softcap is a **property of a specific value pipeline** (often a gain stream), and its parameters should be **modifiable** by upgrades/buyables.

So in v1 we treat softcaps as **targeted rules + resolvable parameters**, not as one fixed global clamp.

#### 7.2.1 Softcap as a Targeted Rule

Each softcap definition targets a specific key (a stat/gain pipeline), scoped to a node reference.

Example targets:

- `layer:idle` + key `gain.gold`
- `layer:idle/.../element:job_woodcutter` + key `gain.gold`

The engine provides a utility:

- `applySoftcap(value, softcapAt, mode, powerOrK)`

But the **parameters** (`softcapAt`, `mode`, `power`, `k`) are resolved through the same infrastructure used for other tunables.

#### 7.2.2 Softcap Parameters Must Be Modifiable

Upgrades/buyables should be able to:

- push the softcap threshold further (increase `softcapAt`)
- soften the softcap (increase `power` toward 1.0, or reduce `k`)

Infrastructure approach (v1-friendly):

- Softcap definitions provide **base** parameters.
- The ModifierSystem can apply targeted modifiers to these parameters via keys like:
  - `softcap.gain.gold.softcapAt`
  - `softcap.gain.gold.power`

That means a buyable can say: “increase the gold gain softcapAt by +50” or “increase power from 0.6 to 0.7”.

#### 7.2.3 Recommended v1 Softcap Modes

- **power softcap** (common in idle games):

  - if `value <= softcapAt`: return `value`
  - else: return `softcapAt * (value / softcapAt) ^ power` where `0 < power < 1`

- **linear-diminishing softcap** (simple to reason about):

  - if `value <= softcapAt`: return `value`
  - else: return `softcapAt + (value - softcapAt) / k` where `k > 1`

Softcaps should be applied at a documented point in the pipeline (example: after multipliers, before adding the gain to resources) and consistently across the engine.

### 7.3 Layer Resets (Required v1 Infrastructure)

Resets apply to **layers**. A reset can be triggered:

- by a user intent in the same layer, or
- by a later layer (once it exists) via events/commands.

The engine must provide a generic reset pipeline; the IdleLayer provides the specific reset config.

**Reset responsibilities (engine):**

1. **Preview** what will be reset (so UI can show consequences)
2. **Execute** reset as an atomic state transition
3. **Emit** reset events
4. **Honor** “keep” rules (what persists across reset)

Recommended events:

- `LAYER_RESET_REQUESTED { layerId }`
- `LAYER_RESET_EXECUTED { layerId, resetId }`

---

## 8. Base JSON Example (IdleLayer)

Below is a minimal example to prove the infrastructure. This is **not final schema**, but it is structured to exercise:

- layer + sublayers + sections + elements
- unlock conditions
- progress activities
- buyables (repeatable upgrades)
- upgrades (one-time)
- softcaps
- reset configuration

```json
{
  "meta": { "name": "Idle Test", "version": "0.1.0", "seed": 12345 },
  "systems": {
    "tickMs": 100
  },
  "state": {
    "resources": {
      "xp": 0,
      "gold": 0,
      "prestige": 0
    }
  },
  "layers": [
    {
      "id": "idle",
      "type": "progressLayer",
      "title": "Idle",
      "unlock": { "always": true },
      "reset": {
        "id": "idlePrestige",
        "title": "Prestige",
        "unlock": { "resourceGte": { "path": "resources.xp", "value": 1000 } },
        "resets": [
          "resources.xp",
          "resources.gold",
          "layers.idle"
        ],
        "keeps": [
          "resources.prestige",
          "layers.idle.upgrades"
        ],
        "rewards": {
          "prestige": { "type": "fromResource", "path": "resources.xp", "mode": "sqrt", "k": 0.1 }
        }
      },
      "sublayers": [
        {
          "id": "routines",
          "type": "progress",
          "title": "Routines",
          "unlock": { "always": true },
          "sections": [
            {
              "id": "jobs",
              "title": "Jobs",
              "unlock": { "always": true },
              "singleActive": true,
              "elements": [
                {
                  "id": "job_beggar",
                  "type": "progressBar",
                  "title": "Beg",
                  "unlock": { "always": true },
                  "durationMs": 3000,
                  "gains": {
                    "xp": 1,
                    "gold": 1
                  }
                },
                {
                  "id": "job_woodcutter",
                  "type": "progressBar",
                  "title": "Woodcut",
                  "unlock": { "resourceGte": { "path": "resources.xp", "value": 25 } },
                  "durationMs": 5000,
                  "gains": {
                    "xp": 3,
                    "gold": 4
                  }
                }
              ]
            }
          ]
        },
        {
          "id": "buyables",
          "type": "buyable",
          "title": "Buyables",
          "unlock": { "resourceGte": { "path": "resources.gold", "value": 10 } },
          "sections": [
            {
              "id": "tools",
              "title": "Tools",
              "elements": [
                {
                  "id": "buy_sharp_axe",
                  "type": "buyable",
                  "title": "Sharper Axe",
                  "unlock": { "always": true },
                  "max": null,
                  "cost": {
                    "resource": "gold",
                    "base": 10,
                    "scaling": { "mode": "exponential", "rate": 1.15 }
                  },
                  "effect": {
                    "target": "layer:idle/sublayer:routines/section:jobs/element:job_woodcutter",
                    "kind": "multiplier",
                    "key": "gain.gold",
                    "value": 1.05
                  }
                }
              ]
            }
          ]
        },
        {
          "id": "upgrades",
          "type": "upgrade",
          "title": "Upgrades",
          "unlock": { "resourceGte": { "path": "resources.xp", "value": 50 } },
          "sections": [
            {
              "id": "permanent",
              "title": "Permanent",
              "elements": [
                {
                  "id": "upg_passive_gold",
                  "type": "upgrade",
                  "title": "Passive Gold",
                  "unlock": { "always": true },
                  "cost": { "resource": "prestige", "amount": 1 },
                  "effect": {
                    "target": "layer:idle",
                    "kind": "passiveGeneration",
                    "resource": "gold",
                    "perSecond": 0.2
                  }
                },
                {
                  "id": "upg_raise_gold_softcap",
                  "type": "upgrade",
                  "title": "Deeper Pockets",
                  "unlock": { "always": true },
                  "cost": { "resource": "prestige", "amount": 2 },
                  "effect": {
                    "target": "layer:idle",
                    "kind": "modifier",
                    "key": "softcap.gain.gold.softcapAt",
                    "op": "add",
                    "value": 50
                  }
                }
              ]
            }
          ]
        }
      ],
      "softcaps": [
        {
          "id": "goldGainSoftcap",
          "scope": "layer:idle",
          "key": "gain.gold",
          "softcapAt": 100,
          "mode": "power",
          "power": 0.6
        }
      ]
    }
  ]
}
```

---

## 9. Simulation Mode

This is your balancing superpower.

### 9.1 Headless Engine

Same Engine, but:

- no UIComposer
- no renderer
- inputs are scripted agents
- outputs are metrics

### 9.2 Simulation Outputs

- progression curves (xp, currency, unlock rate)
- bottleneck detection
- runaway exponentials detection
- time-to-goal metrics

### 9.3 Script Agents

Agents can be:

- greedy optimizer
- random clicker
- goal-driven (unlock X asap)

These are just intent emitters.

#### 9.4 Simulation Time Policy (Fast-Forward Without Breaking Math)

Simulation must support reaching late game quickly without changing game semantics.

Recommended policy:

- **Fixed timestep simulation:** advance time by executing many ticks quickly (headless loop).
- Avoid single giant `dt` steps that skip discrete events (unlocks, purchases, RNG, thresholds).
- If a layer supports analytical fast-forward, it may implement a controlled `fastForward(dt)` that preserves event semantics.

---

## 10. Versioning and Growth Plan

### v1

- deterministic tick loop
- layers + registry
- event bus
- state store
- unlock + visibility evaluation for nodes (layer/sublayer/section/element)
- UIComposer MVP (renders only unlocked nodes)
- **ProgressLayer MVP as the only test layer**

### v1.1

- modifier system properly formalized
- simulation harness
- **StatisticsLayer (auditor) MVP**
  - subscribes to events
  - tracks this-run vs overall stats
  - unlock-driven tracker visibility
- **AchievementsLayer MVP**
  - reads stats
  - applies targeted effects via modifiers/unlocks

### v1.2

- save/load + migration

### v2

- offline progress
- analytics
- advanced automation
- content packs (multiple JSONs merged)

---

## 11. Guard Rails to Avoid Future Pain

- **No layer writes into another layer’s state.** Use events.
- **No UI triggers state patches directly.** Use intents.
- **Event types are documented and validated.**
- **Modifiers have explicit stacking rules.**
- **JSON stays content-first.** If JSON starts turning into a programming language, you are rebuilding Lua badly.

---

## 12. Deliverables for Implementation

To start coding cleanly, the first deliverables should be:

1. **Layer contract interface**
2. **EventBus** (with same-tick dispatch + subscriber snapshot rule)
3. **StateStore** (with canonical vs derived policy)
4. **LayerRegistry**
5. **GameDefinition parser + validator**
6. **Unlock evaluator + node reference scheme** (layer/sublayer/section/element)
7. **Engine tick loop** (process layers in JSON array order)
8. **UIComposer MVP** (tabs + sections + elements, renders only unlocked nodes)
9. **Softcap utility** (engine-level helper available to layers)
10. **Layer reset pipeline** (preview + execute + events + keep rules)
11. **Intent router** (reject/ignore intents targeting locked nodes)
12. **IdleLayer MVP** (single test layer: progress + buyables + upgrades + unlocks)

