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

## Agent character sheet summary (from `AGENTS.md`)

- **Role:** implementation-focused engine architect turning the blueprint into deterministic modules and interfaces.
- **Style:** explicit, deterministic decisions; composable modules; document invariants/dependency rules; UI remains read-only and intent-driven.
- **Stack layout:** `engine/core`, `engine/systems`, `engine/plugins`, `engine/ui`, `engine/validation`; planning docs in `docs/`.
- **Architecture invariants:** process `layers[]` order, no direct layer-to-layer calls/writes, deterministic FIFO event bus dispatch with subscriber snapshot, unlock evaluation before UI composition, canonical-vs-derived state discipline.
