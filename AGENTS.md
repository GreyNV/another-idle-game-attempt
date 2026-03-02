# AGENT CHARACTER SHEET (Repository Scope)

Canonical handoff lives in `docs/agent-character-sheet.md`.

## Repository-specific context
- Scope: this file applies to the entire repository tree.
- Treat `docs/agent-character-sheet.md` as the source of truth for:
  - role,
  - preferred style,
  - technology stack assumptions,
  - non-negotiable architecture rules,
  - delivery checklist.
- If guidance here and the canonical sheet diverge, update both to restore consistency.

## Active product direction (repository-wide)
- Plan and document two separate UI projects:
  - **Game UI**: mobile-first, player-facing runtime interface.
  - **Author UI**: desktop/PC executable builder interface, may use a different tech stack.
- Both UIs must integrate through shared engine contracts (schema, intents/events, read-only composed UI model), not unstable internal imports.
