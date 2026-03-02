# ADR 0004: Unlocks One-Way and Placeholders

## Context

Progression pacing depends on predictable unlock behavior. Re-locking unlocked nodes can create confusing UI oscillation and break progression assumptions.

## Decision

Use one-way unlock transitions:

- Unlock targets transition from locked to unlocked when conditions are met.
- Once unlocked, targets do not re-lock.
- UI composition includes placeholder representations for locked elements when configured to show them.
- Unlock evaluation occurs before render so placeholders/progress are current in the same tick.

## Consequences

- Player progression is stable and understandable.
- Designers can communicate upcoming content using placeholders without exposing active functionality.
- Any design needing reversible access must be modeled as availability/enablement state, not unlock state.

## How to test/extend

- Add tests verifying unlocked nodes remain unlocked when conditions later become false.
- Add tests for placeholder visibility and unlock-progress presentation in composed UI models.
- For new unlock operators/targets, maintain one-way transition semantics and keep progress computation pure.
