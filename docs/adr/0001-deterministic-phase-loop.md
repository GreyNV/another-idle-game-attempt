# ADR 0001: Deterministic Phase Loop

## Context

The engine must produce reproducible outcomes for the same definition, initial canonical state, and ordered intent/event inputs. Without a strict phase contract, system side effects can interleave unpredictably and break balancing, testing, and replayability.

## Decision

Adopt a fixed phase loop owned by `GameEngine.tick()` and execute phases in this exact order:

1. input
2. time
3. layer-update
4. event-dispatch
5. unlock-evaluation
6. render

Additional constraints:

- Process layers in definition JSON `layers[]` order.
- Forbid direct layer-to-layer calls.
- Forbid direct cross-layer writes.
- Require unlock evaluation to run before UI composition.

## Consequences

- Deterministic replay and predictable debugging become straightforward.
- System interfaces remain clearer because phase boundaries define allowed work.
- Some features may need queueing/defer mechanics instead of immediate side effects, which adds small implementation overhead but preserves determinism.

## How to test/extend

- Add regression tests that run identical ticks twice and assert equal summaries and canonical snapshots.
- Add order tests that fail if phase sequence changes.
- For new phase-like behavior, integrate into an existing phase first; only add a new explicit phase via ADR update and test updates.
