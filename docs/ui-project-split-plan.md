# Dual UI Project Split Plan (Game UI + Author UI)

## Goal
Establish two independent UI projects around the deterministic engine:

1. **Game UI**: player-facing runtime interface, mobile-first.
2. **Author UI**: builder/editor for content authors, desktop-first and allowed to use a different stack.

Both UIs consume shared engine/domain contracts but ship/deploy independently.

## Product boundaries

### 1) Game UI project (mobile-first)
- Primary audience: players.
- Runtime mode: embedded with/adjacent to engine runtime.
- Constraints:
  - touch-first controls,
  - responsive layouts for narrow portrait screens,
  - low-latency intent emission,
  - no direct state mutation.
- Data source:
  - composed read-only tree (`UIComposer` output),
  - selected read-only state projections for HUD/perf/debug.

### 2) Author UI project (desktop-first)
- Primary audience: game designers/content authors.
- Runtime mode: executable on PC (local app, desktop web app, or hybrid shell).
- Allowed to use different UI stack than Game UI.
- Responsibilities:
  - edit/validate game definitions,
  - schema-aware forms for layers/sublayers/sections/elements,
  - unlock-rule editing + preview,
  - content simulation preview via engine APIs,
  - export/import + migration tooling.

## Shared contract boundary
To keep both UIs independent, define a shared contract package (or stable module boundary) with:

- Definition schema + version policy (`engine/validation/schema/*`).
- Parsed definition shape (`parseGameDefinition` output shape).
- Intent/event catalogs (`engine/systems/catalogs/*`).
- UI composition node types (renderer-agnostic model from `UIComposer`).
- Error surface for validation (`ValidationError`).

Both UI projects should depend on this contract boundary, not internal engine module paths.

## Recommended repository structure evolution

- `apps/game-ui/` (mobile-first player UI project)
- `apps/author-ui/` (desktop-first authoring project)
- `packages/engine/` (existing runtime modules)
- `packages/contracts/` (shared DTOs/types/schema helpers)
- `packages/tooling/` (optional CLI/build/export helpers)

If monorepo migration is deferred, preserve equivalent logical boundaries in current tree and avoid cross-importing UI internals.

## Planned engine-facing changes
1. **Stabilize renderer contract**
   - Promote `UIComposer` output schema into explicit contract types.
   - Version the contract so Game UI can evolve safely.

2. **Add authoring service facade**
   - Introduce a high-level authoring API (validate, parse, simulate tick, inspect unlock paths).
   - Keep deterministic loop rules unchanged.

3. **Catalog-first command model**
   - Ensure intents/events remain centrally cataloged for both UIs.
   - Author UI should generate valid intents and preview their effects via simulation, never bypassing engine rules.

4. **Definition lifecycle support**
   - Draft -> validate -> preview -> publish workflow contract.
   - Attach schema compatibility and migration checks before publish.

## Delivery phases

### Phase A: Documentation + contract hardening
- Document dual-UI architecture and non-negotiable boundaries.
- Freeze/stabilize shared contracts needed by both UI projects.

### Phase B: Project scaffolding
- Scaffold `game-ui` and `author-ui` as separate runnable projects.
- Wire both to shared contract package.

### Phase C: Authoring workflows
- Implement definition editor, diagnostics panel, unlock preview, and export pipeline.

### Phase D: Game UI mobile-first polish
- Implement production responsive system, touch interactions, and performance budgets.

## Non-negotiable invariants (unchanged)
- Deterministic phase order remains engine-owned.
- No direct layer-to-layer calls/writes.
- UI surfaces emit intents; they never mutate canonical state directly.
- Unlock evaluation occurs before UI composition output is consumed each tick.

## Acceptance criteria for split readiness
- Two UIs can be built/released independently.
- Author UI runs on a PC target and can validate + preview definitions.
- Game UI remains mobile-first and consumes only read-only composed data + intent APIs.
- No UI imports from unstable internal engine paths.
