# Unlock + Node Reference Mini-Spec (v1)

## 1) Node references

### Canonical format
A node reference identifies a node in the hierarchy by scope segments in strict order:

`layer:<layerId>[/sublayer:<sublayerId>[/section:<sectionId>[/element:<elementId>]]]`

Examples:
- `layer:idle`
- `layer:idle/sublayer:routines`
- `layer:idle/sublayer:routines/section:jobs`
- `layer:idle/sublayer:routines/section:jobs/element:job_woodcutter`

### Parsing and normalization rules
1. Input must be a non-empty string.
2. Segments are `/`-separated and each segment must be `scope:id`.
3. Supported scopes: `layer`, `sublayer`, `section`, `element`.
4. Scopes must appear in strict hierarchy order with no gaps.
   - Invalid: `layer:x/section:y`
5. Scopes may appear at most once.
   - Invalid: `layer:x/layer:y`
6. IDs must be non-empty after trimming.
7. Normalization trims segment whitespace and emits canonical ordering text with no extra spaces.

### Invalid-reference behavior
- **Invalid format/scope/order/duplicates => hard error** during definition validation.
- **Well-formed but unresolved target** (missing layer/sublayer/section/element) => hard error during definition validation.

## 2) Unlock condition AST (v1)

Unlock conditions are parsed into a single-root AST expression.

### Leaf operators
- `always: boolean`
- `resourceGte: { path: string, value: number }`
- `compare: { path: string, op: 'gt'|'gte'|'lt'|'lte'|'eq'|'neq', value: number }`
- `flag: { path: string }` (true iff the path exists and value is `true`)

### Logical operators
- `all: Condition[]` (AND, non-empty)
- `any: Condition[]` (OR, non-empty)
- `not: Condition` (NOT)

### AST shape rule
- Each condition object has exactly one operator key.

## 3) Evaluation semantics (v1)

1. Unlock transitions are evaluated **end-of-tick only**.
2. End-of-tick unlock pass happens before UI composition.
3. v1 transitions are **one-way**:
   - `locked -> unlocked` allowed
   - `unlocked -> locked` not allowed in v1
4. If a node is already unlocked, evaluator keeps it unlocked regardless of current expression result.

## 4) Missing-path behavior

Different failure classes are intentionally split:

- **Invalid references** (node refs and malformed condition syntax): **hard errors** at parse/validation time.
- **Missing runtime state paths** during condition evaluation: **condition evaluates to false** (not an exception).

This keeps startup deterministic while allowing runtime state evolution without evaluator crashes.


## 5) Placeholder rendering contract (v1)

Placeholder behavior is owned by the unlock system + UI composer, not by custom layer logic.

1. Every node (`layer`, `sublayer`, `section`, `element`) receives canonical unlock status from `UnlockEvaluator.statusByRef`:
   - `unlocked: boolean`
   - `progress: number` in `[0, 1]`
   - `showPlaceholder: boolean`
2. Placeholder visibility rule is deterministic and uniform across hierarchy levels:
   - Include node in UI when `unlocked === true` **or** `showPlaceholder === true`.
   - `showPlaceholder` is true only when node is still locked with partial progress (`progress > 0`).
   - Locked nodes with zero progress are omitted from UI.
3. Placeholder metadata contract in composed UI nodes:
   - `placeholder: !unlocked`
   - `unlockProgress: progress`
4. Child rendering contract:
   - If a node is rendered as placeholder (`placeholder: true`), children are not composed yet.
   - When unlock reaches threshold (`progress === 1` and transition occurs), node flips to `placeholder: false` and children are composed on that tick.
5. One-way unlock persistence still applies:
   - After unlock transition, later state drops below threshold do not relock the node.

Layer authors must rely on this contract instead of adding custom placeholder/visibility logic in layer modules.

## Agent character sheet summary (from `AGENTS.md`)

- **Role:** implementation-focused engine architect turning the blueprint into deterministic modules and interfaces.
- **Style:** explicit, deterministic decisions; composable modules; document invariants/dependency rules; UI remains read-only and intent-driven.
- **Stack layout:** `engine/core`, `engine/systems`, `engine/plugins`, `engine/ui`, `engine/validation`; planning docs in `docs/`.
- **Architecture invariants:** process `layers[]` order, no direct layer-to-layer calls/writes, deterministic FIFO event bus dispatch with subscriber snapshot, unlock evaluation before UI composition, canonical-vs-derived state discipline.
