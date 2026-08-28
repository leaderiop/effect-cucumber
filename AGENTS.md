# effect-cucumber — Engineering Conventions

An Effect-native Gherkin/Cucumber runner for vitest. **Effect v4 (beta).**

New here? `CONTRIBUTING.md` is a short index into whichever part of this
document governs the change you're making — read that first rather than this
file end to end.

---

## 1. Specification

`spec/` is normative. Code follows the spec, not the reverse. Changing public
behavior means updating the relevant behavior doc, invariant, and the
traceability matrix in the same change.

This project has no code yet — `spec/` currently describes an intended
contract, not a verified one. That is a real, temporary state, not a shortcut:
every behavior, invariant, and decision in `spec/` was designed and stress-tested
against worked examples before any package existed (see `spec/roadmap.md` for
exactly what's built vs. specified). Once `packages/*` exists, the rule above
takes over in the normal direction — a code change that isn't reflected in
`spec/` in the same commit is incomplete, not merely undocumented.

Two gates are described in `spec/process/definitions-of-done.md` as **planned**,
not yet wired: a script that extracts and type-checks every `` ```typescript ``
fence under `spec/behaviors/` against the real API, and
`spec/scripts/verify-traceability.sh`, which already exists and can be run
today (`bash spec/scripts/verify-traceability.sh`) — it checks `spec/`'s own
internal consistency (index.yaml ↔ disk, every invariant and decision traced,
no broken relative links) independent of whether any code exists.

## 2. Specification code fences

`spec/` uses three TypeScript fence languages, and the distinction is
load-bearing:

- `` ```typescript `` — a **runnable example**. Once `packages/*` exists, this is
  extracted and compiled against the real API by a doc-examples check; it must
  import what it uses.
- `` ```tsx `` — a runnable example **containing JSX**. Unlikely to be needed here
  (this is a headless testing library), kept for parity with the convention.
- `` ```ts `` — an **API signature listing or fragment**. Reference material,
  not compiled.

Prefer `typescript` wherever an example can be made to compile once there's an
API to compile it against. Until then, worked examples in `spec/behaviors/`
are written as `typescript` fences with a comment noting they're pre-implementation.

## 3. Imports (once code exists)

Submodule namespace imports, matching Effect's own convention:

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
```

## 4. Say only what is true

A spec document may describe a planned capability, but it must say so. Don't
write a behavior or invariant as if it's enforced today when the enforcement
mechanism doesn't exist yet — say "not yet implemented" or "planned" instead.
`spec/roadmap.md`'s "Current state" table is the single place that says what's
actually built; everything else can cite it rather than re-asserting status.

## 5. Tests (once code exists)

`@effect/vitest`: `it.effect`, `it.layer`, `TestClock`. Every behavior in
`spec/behaviors/` gets tests; every `.feature` file used in the library's own
test suite is tagged `@REQ-EC-NNN` so acceptance scenarios join the
traceability chain (see `spec/traceability.md` §5).

## 6. Identifier scheme

See `spec/process/requirement-id-scheme.md`. Short version: every spec artifact
gets a permanent ID with the `EC` infix (`BEH-EC-NNN`, `INV-EC-NNN`,
`ADR-EC-NNN`, `REQ-EC-NNN`). IDs are allocated contiguously, never renumbered,
and never reused — a withdrawn item is marked "Withdrawn" and keeps its number.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`leaderiop/effect-cucumber`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context. Domain vocabulary and decisions live in the existing `spec/` (`spec/overview.md`, `spec/glossary.md`, `spec/decisions/`) rather than a separate `CONTEXT.md`/`docs/adr/`. See `docs/agents/domain.md`.
