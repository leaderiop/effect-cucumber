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

Both packages are built, so the rule above applies in its normal direction: a
code change that isn't reflected in `spec/` in the same commit is incomplete,
not merely undocumented. `spec/roadmap.md`'s "Current state" remains the single
place that says what's built vs. specified — cite it rather than re-asserting
status elsewhere.

`spec/` is no longer only described; it is EXECUTED. The worked examples in
`spec/behaviors/01`–`03` run as real `.feature` + `.steps.test.ts` pairs under
`packages/vitest/test/acceptance/`, and every v1 requirement carries a
`@REQ-EC-NNN` tag there. Run
`bash spec/scripts/verify-traceability.sh` before committing a spec change: it
checks `spec/`'s own internal consistency (index.yaml ↔ disk, every invariant
and decision traced, every `@REQ-EC-NNN` tag carried exactly once with a §5 row,
no broken relative links).

One gate in `spec/process/definitions-of-done.md` is still **planned, not
wired**: the script that extracts and type-checks every `` ```typescript ``
fence under `spec/behaviors/` against the real API. Until it exists nothing
compiles those fences — treat them as reviewed, not verified.

## 2. Specification code fences

`spec/` uses three TypeScript fence languages, and the distinction is
load-bearing:

- `` ```typescript `` — a **runnable example**. Intended to be extracted and
  compiled against the real API by the doc-examples check, which is not wired
  yet; write it as though it were, and it must import what it uses.
- `` ```tsx `` — a runnable example **containing JSX**. Unlikely to be needed here
  (this is a headless testing library), kept for parity with the convention.
- `` ```ts `` — an **API signature listing or fragment**. Reference material,
  not compiled.

Prefer `typescript` wherever an example can be made to compile. The API exists
now, so a new example has no excuse to be a fragment; the pre-implementation
comments on the existing worked examples in `spec/behaviors/` are historical and
those examples are separately proven by the acceptance pairs that execute them.

## 3. Imports

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

This cuts both ways, and the second direction is the one that rots quietly: a
capability that HAS shipped must not still be described as planned. A status
sentence left behind by a phase that overtook it is as false as one written too
early, and it is harder to notice because nothing about it looks like a claim.

## 5. Tests

`@effect/vitest`: `it.effect`, `it.layer`, `TestClock`. Every behavior in
`spec/behaviors/` gets tests; every `.feature` file used in the library's own
test suite is tagged `@REQ-EC-NNN` so acceptance scenarios join the
traceability chain (see `spec/traceability.md` §5). One exception, enforced in
both directions by `spec/scripts/verify-traceability.sh` check 4: the parser
corpus under `packages/gherkin/test/fixtures/` and the tag-scanning fixtures
under `packages/vitest/test/fixtures/` are never handed to a runner and must
NOT carry the tag — `packages/vitest/test/acceptance/` is the only directory
where a `.feature` file may.

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
