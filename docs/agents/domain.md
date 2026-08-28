# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo uses a spec-driven-development layout instead of the generic
`CONTEXT.md`/`docs/adr/` convention — see `spec/README.md` for the full
structure and `AGENTS.md` §1 for why it's normative.

## Before exploring, read these

- **`spec/overview.md`** — mission, design philosophy, packages, public API
  surface (plays the role `CONTEXT.md` would).
- **`spec/glossary.md`** — domain vocabulary, one flat `##` heading per term.
- **`spec/decisions/`** — ADRs (`ADR-EC-NNN-slug.md`, indexed in
  `spec/decisions/index.yaml`), playing the role `docs/adr/` would.
- **`spec/invariants.md`** and **`spec/behaviors/`** — properties and testable
  contracts; read whichever behavior file touches the area you're about to
  work in.

If `spec/` doesn't exist, proceed silently rather than flagging its absence —
this convention only applies once it does.

## File structure

Single-context. No `CONTEXT.md`/`docs/adr/` — see `spec/README.md` for the
full layout:

```
/
├── AGENTS.md
├── CONTRIBUTING.md
└── spec/
    ├── README.md
    ├── overview.md
    ├── glossary.md
    ├── invariants.md
    ├── roadmap.md
    ├── traceability.md
    ├── decisions/        ← ADR-EC-NNN, plays the role docs/adr/ would
    ├── behaviors/         ← BEH-EC-NNN
    └── process/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor
proposal, a hypothesis, a test name), use the term as defined in
`spec/glossary.md`. Don't drift to synonyms the glossary explicitly avoids
(e.g. "World," not "context").

If the concept you need isn't in the glossary yet, that's a signal — either
you're inventing language the project doesn't use (reconsider) or there's a
real gap worth raising.

## Flag ADR conflicts

If your output contradicts an existing decision, surface it explicitly rather
than silently overriding:

> _Contradicts ADR-EC-006 (two Layer scopes only) — but worth reopening because…_
