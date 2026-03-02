# ADR 0003: Canonical vs Derived State

## Context

Mixing canonical game state with derived/computed values causes drift, stale caches, and hidden coupling between systems.

## Decision

Adopt a strict state policy:

- `StateStore` holds canonical mutable state only.
- Derived values (unlock progress, multipliers, characteristic rollups, UI view models) are computed from canonical state during tick phases.
- UI reads derived/canonical outputs but never writes state directly.
- Systems write canonical state through explicit interfaces, not through ad-hoc shared objects.

## Consequences

- Save/load and reset semantics remain reliable because persisted data is canonical.
- Derived pipelines remain recomputable and easier to validate.
- Some repeated computations may increase per-tick work; optimize with deterministic memoization only when needed.

## How to test/extend

- Add tests that snapshot canonical state before/after render to ensure render-only paths do not mutate state.
- Add tests confirming derived outputs recompute correctly from same canonical snapshot.
- When introducing new computed metrics, place them in evaluator/composer systems rather than persisted state fields.
