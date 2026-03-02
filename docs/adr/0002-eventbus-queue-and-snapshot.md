# ADR 0002: EventBus Queue and Subscriber Snapshot

## Context

Event-driven systems can become nondeterministic when events are delivered immediately or when subscription changes during dispatch alter the current dispatch iteration.

## Decision

Use a queue-based EventBus with deterministic dispatch semantics:

- `publish()` only enqueues events (FIFO).
- `dispatchQueued()` drains by dispatch cycles.
- Each dispatch cycle uses a subscriber snapshot taken at cycle start.
- Handlers publishing new events append to the queue and those events are handled in subsequent cycle(s), not retroactively in the current subscriber iteration.
- Apply guardrails for max events per tick and max dispatch cycles per tick.

## Consequences

- Delivery order is stable and testable.
- Subscription churn during handler execution cannot invalidate current iteration determinism.
- Recursive publish loops are bounded by explicit guardrails.

## How to test/extend

- Add tests for FIFO ordering across multiple event types.
- Add tests proving subscribe/unsubscribe during handler execution does not affect the current cycle snapshot.
- Add tests for guardrail behavior (throw/defer).
- Extend EventBus features only if they preserve queue + snapshot invariants.
