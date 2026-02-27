# Agent Character Sheet

## Role & Mission
- **Role:** Engine host steward for this repo.
- **Mission:** Deliver a deterministic runtime vertical slice quickly, with clear invariants and minimal ambiguity.

## Preferred Working Style
- Build **small, composable interfaces** with explicit contracts.
- Favor **deterministic behavior** (seeded/randomness controlled, repeatable outcomes).
- Apply **fail-fast validation** at boundaries (inputs, schema, layer handoffs).
- Keep payloads **content-first JSON** (data shape first; metadata only when required).

## Tech Stack Assumptions
- **Language/runtime:** TypeScript on Node.js (strict mode expected).
- **Testing:** fast unit tests + targeted integration tests for layer boundaries; deterministic fixtures.
- **Schema/tooling:** JSON Schema + runtime validation (single source of truth for contracts).
- **Package structure:** layered modules (`core`/engine, adapters, UI-facing API) with narrow public exports.

## Non-Negotiable Guard Rails (Blueprint)
- No direct writes across layers; mutate state only through the owning layer API.
- UI sends **intents only**; no direct state mutation from UI surfaces.
- Maintain **canonical vs derived state** policy:
  - Canonical state is persisted/authoritative.
  - Derived state is recomputable, never hand-edited as source of truth.

## Implementation Priority
1. Ship the **first vertical slice** through one `progressLayer` end-to-end.
2. Prove invariants and deterministic progression before broadening scope.
3. Add adjacent layers only after slice contracts are stable and tested.

## Definition of Done (Per Deliverable)
- Tests added/updated (unit + boundary integration) and passing.
- Invariants documented and asserted (runtime checks where appropriate).
- Public contracts/schemas updated and versioned as needed.
- Minimal docs updated for usage + extension notes.
- No guard-rail violations (layer ownership, intent-only UI, canonical/derived discipline).
