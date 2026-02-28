# First Layer Authoring Template (Schema v1)

Use this as a **copy/paste starter** for new content packs.
It is intentionally compact and aligned to the current fail-fast validator pipeline in:
- `engine/validation/parser/parseGameDefinition.js`
- `engine/validation/schema/validateGameDefinitionSchema.js`
- `engine/validation/references/validateReferences.js`

---

## 1) Required top-level fields

All definitions must provide: `meta`, `systems`, `state`, `layers`.

```json
{
  "meta": {
    "schemaVersion": "1.0.0",
    "gameId": "my-idle-game"
  },
  "systems": {
    "tickMs": 100
  },
  "state": {
    "resources": {
      "points": 0,
      "gold": 0
    },
    "flags": {
      "firstResetDone": false
    }
  },
  "layers": []
}
```

Validator notes:
- `systems` **must be an object** (array form is rejected in schema v1).
- `layers` **must be an array**.
- IDs are validated as non-empty + unique among siblings.

---

## 2) Minimal `progressLayer` scaffold

```json
{
  "id": "core",
  "type": "progressLayer",
  "unlock": { "always": true },
  "sublayers": [
    {
      "id": "main",
      "type": "progress",
      "unlock": { "always": true },
      "sections": [
        {
          "id": "primary",
          "unlock": { "always": true },
          "elements": [
            {
              "id": "points_bar",
              "type": "progressBar",
              "unlock": { "always": true }
            },
            {
              "id": "buy_gold",
              "type": "buyable",
              "unlock": {
                "resourceGte": { "path": "resources.points", "value": 10 }
              },
              "effect": {
                "targetRef": "layer:core/sublayer:main/section:primary/element:points_bar"
              }
            }
          ]
        }
      ]
    }
  ],
  "reset": {
    "keep": []
  },
  "softcaps": []
}
```

Type enums currently accepted by schema:
- layer `type`: `progressLayer`
- sublayer `type`: `progress`, `buyable`, `upgrade`
- element `type`: `progressBar`, `buyable`, `upgrade`

---

## 3) Unlock condition examples (supported operators only)

Each unlock object must contain **exactly one operator key**.

```json
{ "always": true }
```

```json
{ "resourceGte": { "path": "resources.points", "value": 25 } }
```

```json
{ "compare": { "path": "resources.gold", "op": "gte", "value": 5 } }
```

```json
{ "flag": { "path": "flags.firstResetDone" } }
```

```json
{
  "all": [
    { "resourceGte": { "path": "resources.points", "value": 100 } },
    { "not": { "flag": { "path": "flags.lockedOut" } } }
  ]
}
```

```json
{
  "any": [
    { "compare": { "path": "resources.gold", "op": "gt", "value": 0 } },
    { "flag": { "path": "flags.devBypass" } }
  ]
}
```

Compare ops currently accepted: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`.

Reference validation reminder:
- unlock `path` values are checked against canonical `state` paths.
- missing state path => `REF_UNLOCK_PATH_MISSING` fail-fast error.

---

## 4) `nodeRef` examples

Canonical format:

`layer:<layerId>[/sublayer:<sublayerId>[/section:<sectionId>[/element:<elementId>]]]`

Valid examples:
- `layer:core`
- `layer:core/sublayer:main`
- `layer:core/sublayer:main/section:primary`
- `layer:core/sublayer:main/section:primary/element:points_bar`

Invalid examples (will fail reference/schema validation):
- `section:primary` (must start with `layer`)
- `layer:core/section:primary` (scope gap/order violation)
- `layer:core/layer:dup` (duplicate scope)
- `layer:missing` (well-formed, but unresolved id)

`effect.targetRef` must be a string nodeRef when `effect` is present.

---

## 5) Reset + softcap placeholders (current supported modes only)

Reset scaffold (supported today):

```json
"reset": {
  "keep": [
    "flags.firstResetDone"
  ]
}
```

Softcap scaffold (supported today):

```json
"softcaps": [
  {
    "id": "points_softcap",
    "scope": "layer:core/sublayer:main/section:primary/element:points_bar",
    "key": "value",
    "softcapAt": 1000,
    "mode": "power",
    "power": 0.5
  }
]
```

Current support notes:
- `softcaps[].mode` supports only `power`.
- `power` mode expects `0 < power < 1` at runtime.
- `reset.keep` should always be present as an array (empty is valid).

---

## 6) Fast-fail authoring checklist

Before shipping JSON, verify against these constraints to keep errors understandable and immediate:
1. Top-level shape and enums pass `validateGameDefinitionSchema`.
2. Node refs and unlock state paths pass `validateReferences`.
3. Parsing via `parseGameDefinition` succeeds (throws `ValidationError` if any issue exists).

---

## 7) Agent character sheet summary (from `AGENTS.md`)

- **Role:** implementation-focused engine architect; translate blueprint into deterministic modules/interfaces.
- **Style:** explicit/deterministic decisions, composable modules, documented invariants/dependency direction.
- **Stack:** engine modules under `engine/core`, `engine/systems`, `engine/plugins`, `engine/ui`, `engine/validation`; docs in `docs/`.
- **Architecture invariants:** preserve layer order execution, avoid direct cross-layer writes/calls, keep UI intent-driven, keep event bus deterministic FIFO + snapshot semantics.
