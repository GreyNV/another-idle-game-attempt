# Author UI (Desktop/PC Builder)

Lightweight React + Vite authoring tool for working with `GameDefinition` JSON via the engine's `AuthoringFacade` boundary.

## One-command local run

From this folder:

```bash
npm install && npm run dev
```

This starts:
- Vite UI on `http://localhost:5174`
- Local API server on `http://localhost:8787` (uses `AuthoringFacade.validate` and `AuthoringFacade.simulate`)

## Included minimum workflow

- Open/load `GameDefinition` JSON file into an editor buffer.
- Live validation through `AuthoringFacade.validate`.
- Issues list with `code`, `path`, and `message`.
- Save JSON from editor buffer back to a file.
- Deterministic simulation for `N` ticks through `AuthoringFacade.simulate`.
- Simulation report view and JSON export.

## Boundary rule

The UI stack only consumes `AuthoringFacade` via `engine/index.js`; it does not import `engine/systems/*`, `engine/core/*`, or `engine/ui/*`.
