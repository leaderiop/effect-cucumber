# Phase 11: Composition Root and Dogfooded Acceptance Suite - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 12 file groups (new + modified)
**Analogs found:** 11 / 12

There is no RESEARCH.md for this phase (research deliberately skipped). Every
pattern below is extracted from real files on disk, with line numbers.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/vitest/test/acceptance/*.feature` (tagged `@REQ-EC-NNN`) | test fixture | file-I/O | `packages/gherkin/test/fixtures/*.feature` + its `README.md` | role-match |
| `packages/vitest/test/acceptance/*.steps.ts` (worked-example pairs 01/02/03) | test | request-response (collection → emission) | `packages/vitest/test/emission.test.ts` | exact |
| `packages/vitest/test/acceptance/README.md` (fixture convention doc) | doc | — | `packages/gherkin/test/fixtures/README.md` | exact |
| `packages/vitest/test/acceptance/*-negative.feature` (MATCH-03/04/05, PARSE-03 starved fixtures) | test fixture | file-I/O | `packages/vitest/test/tsgo-gate/src/*-missing-*.ts` | role-match |
| `packages/vitest/test/acceptance/negative-requirements.test.ts` (D-02 wrapper) | test | request-response | `packages/vitest/test/Plan.test.ts` + `scripts/verify-tsgo-gate.sh` satisfied/starved structure | role-match |
| `packages/vitest/test/acceptance/pitfalls-checklist.test.ts` (D-03, 24 items) | test | CRUD/mixed | `packages/vitest/test/emission.test.ts` (blocked, header-documented, mutation-recorded) | role-match |
| `scripts/verify-acceptance-no-any.sh` (D-04b) | gate script | batch/structural grep | `scripts/verify-no-runner-dep.sh` | exact |
| `scripts/verify-acceptance-ref-state.sh` (RUN-06 / SC#2 no-`let` proof) | gate script | batch/structural grep | `scripts/verify-no-runner-dep.sh` | exact |
| `scripts/verify-watch-rerun.sh` (D-03, Pitfall 3 watch-mode smoke) | gate script | event-driven (CLI subprocess + report parse) | `scripts/verify-tags-filter.sh` | role-match |
| `vitest.config.ts` (MODIFIED — declare the 22 `@REQ-EC-NNN` tags) | config | — | `vitest.config.ts` itself, note (e) | exact (self) |
| `spec/traceability.md` §5 (MODIFIED — mapping table) | doc | — | `spec/traceability.md` §4 (hand-enumerated-from-disk table + preamble) | exact |
| `package.json` scripts (MODIFIED — `verify:*` entries) | config | — | `package.json` `scripts` block | exact (self) |
| `spec/overview.md` / `packages/vitest/README.md` (MODIFIED — INV-EC-003 lint recommendation, D-04a) | doc | — | — | **no analog** |

## Blocking Facts the Planner Must Design Around

These are not style preferences; each one will break the phase if missed.

1. **`loadFeature` is NOT exported from `@effect-cucumber/vitest`.**
   `packages/vitest/src/index.ts` exports only `describeFeature`,
   `gherkinTags`, `StepMatchError` and types (lines 136, 174, 187, 218). The
   worked examples in `spec/behaviors/01`–`03` all open with
   `import { describeFeature, loadFeature } from "@effect-cucumber/vitest"`,
   and `03-rules-outlines-and-testclock.md` says so explicitly in its own
   caveat block ("`loadFeature` is NOT exported by @effect-cucumber/vitest —
   ADR-EC-024's wrapped, ManagedRuntime-backed version is the one export this
   package is still missing"). Dogfooding a worked example verbatim therefore
   requires EITHER shipping ADR-EC-024's wrapper (a new public export, which
   CONTEXT.md's boundary says this phase does not add) OR loading through
   `@effect-cucumber/gherkin`'s own `loadFeature`/`parseFeature` and
   providing `NodeFileSystem.layer` + `ParameterTypeStore` — the deviation
   must be a recorded, deliberate planner decision.
2. **`@effect/platform-node` is not a devDependency of `packages/vitest`.**
   `packages/vitest/package.json` devDeps are `effect`, `@effect/vitest`,
   `vitest`, `@types/node`. `packages/gherkin/package.json:57` has it. Path
   (2) above needs it added; path (`?raw`) does not.
3. **`packages/vitest` has NO `*.feature?raw` ambient declaration and
   deliberately no `moduleDetection: "auto"`.** `packages/vitest/tsconfig.test.json`
   states this in a standing comment ("packages/vitest has no such ambient
   .d.ts, so the base's 'force' stands. Do not copy it over 'for parity'").
   Using `?raw` in the acceptance suite means adding BOTH a
   `packages/vitest/test/feature-raw.d.ts` and the `moduleDetection` override,
   and updating that comment.
4. **`vitest.config.ts` must declare every `@REQ-EC-NNN` tag or the whole
   acceptance file collects to 0 tests.** Note (a) and note (e) of that file
   say so; note (e) names this phase by name: "A future phase that adds
   `@REQ-EC-NNN` acceptance tags (AGENTS.md §5) adds them here, or reaches
   the D-08 degradation path instead." `gherkinTags("packages/vitest/test/acceptance/**/*.feature")`
   is the exported helper built for exactly this and avoids 22 hand-written
   entries.
5. **`describeFeature` must be called at MODULE scope**, and the feature value
   must already be resolved — see `emission.test.ts:279-282`. `Effect.runSync`
   works for `parseFeature` (ParameterTypeStore is `Layer.succeed`-backed);
   it throws `AsyncFiberError` for the real `loadFeature`, so a path-based
   load needs top-level `await Effect.runPromise(...)`
   (`packages/gherkin/test/loadFeature.test.ts:60-61`).
6. **`.feature` files are outside `dprint.json`'s `includes` glob**
   (`["**/*.{ts,tsx,js,jsx,json,md}"]`) — the new fixtures are byte-exact and
   nothing reformats them, same as the gherkin corpus.
7. **`spec/scripts/verify-traceability.sh` check 4 greps the WHOLE repo** for
   `@REQ-EC-[0-9]{3}` in any `*.feature`, and fails unless each tag's bare
   form (`REQ-EC-NNN`) appears in `spec/traceability.md`. The mapping table
   is what turns its current SKIP into a PASS.

## Pattern Assignments

### `packages/vitest/test/acceptance/*.steps.ts` (test, real describeFeature)

**Analog:** `packages/vitest/test/emission.test.ts` — the only file in the repo
that calls `describeFeature` for real (its header, line 5, says so, and
`spec/traceability.md:198` repeats it).

**Imports pattern** (`emission.test.ts:171-182`) — submodule namespace imports
per AGENTS.md §3, never `from "effect"`:

```typescript
import { ParameterTypeStore, parseFeature } from "@effect-cucumber/gherkin"
import { assert, beforeAll, describe, expect, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as TestClock from "effect/testing/TestClock"
import { collectFeature, describeFeature } from "../src/describeFeature.ts"
```

For the acceptance suite the last line becomes `"../../src/index.ts"`-shaped —
but note `pnpm lint` forbids a relative value-import whose basename is
`index.*` (`packages/gherkin/test/loadFeature.test.ts:36-38`), so import the
concrete module (`../../src/describeFeature.ts`) exactly as the analog does.

**Feature-value pattern** (`emission.test.ts:252-277`) — real source through
the real parser, resolved at module scope:

```typescript
const emissionFeature = Effect.runSync(
  parseFeature(
    `Feature: Emission
  Background:
    Given the log is opened
...
`,
    "test/emission.feature"
  ).pipe(Effect.provide(ParameterTypeStore.Default))
)
```

The acceptance suite's variant reads a real `.feature` FILE instead of an
inline string — see Blocking Fact 1/3 for the two allowed mechanisms.

**Core pattern — the call under test** (`emission.test.ts:279-314`), including
the Ref-through-World state rule this phase's SC#2 requires:

```typescript
// THE CALL UNDER TEST. At module scope, exactly as a test author writes it, with nothing wrapping
// it and nothing intercepting it.
describeFeature(emissionFeature, logLayer, ({ Background, Then, When }) => {
  Background(({ Given }) => {
    Given("the log is opened", function*() {
      yield* append("opened")
    })
  })

  When("I record {string}", function*(entry: string) {
    yield* append(entry)
  })

  Then("the log reads {string}", function*(expected: string) {
    const { entries } = yield* Log
    const actual = (yield* Ref.get(entries)).join(",")
    assert.strictEqual(actual, expected)
  })
})
```

**World/Ref state pattern** (`spec/behaviors/01-steps-and-world.md:291-298`) —
the exact shape every acceptance `.steps.ts` must use so no step closes over a
`let`:

```typescript
class World extends Context.Service<World, { apples: Ref.Ref<number> }>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}
```

**Rule + Scenario Outline + TestClock pattern:** copy structurally from
`spec/behaviors/03-rules-outlines-and-testclock.md` §"Worked example"
(`Rule("...", DiscountRegistry.layer, ({ ScenarioOutline, Scenario }) => ...)`,
`Schema.decodeUnknown(Schema.Array(CartRow))(table.hashes())`), and cross-check
against the already-shipped Rule-composition and Outline blocks in
`emission.test.ts` (Rule block at line 844, Outline block at 638) which are the
running proof that this composition works.

**Header/doc pattern:** every block in `emission.test.ts` carries a prose header
stating what it asserts, why it is placed where it is, and a numbered mutation
record (`emission.test.ts:99-140`). The acceptance files are expected to do the
same — CONTEXT.md's "Established Patterns" makes mutation-testing every new gate
a standing requirement.

---

### `packages/vitest/test/acceptance/*.feature` (fixture, file-I/O)

**Analog:** `packages/gherkin/test/fixtures/README.md` (the corpus convention),
`packages/vitest/test/fixtures/tag-scan-*.feature` (the vitest-package fixtures).

**Convention to mirror** (`packages/gherkin/test/fixtures/README.md:1-6, 8-10`):

```markdown
One `.feature` file per row of ...'s fixture table, named for the reason it triggers so a failing test
names the defect. Every behavior recorded below was reproduced against ... and is pinned by an
executable assertion in [`../upstream-pin.test.ts`](../upstream-pin.test.ts) ...

## These files are byte-exact and NOT formatted

`dprint.json`'s `includes` glob is `**/*.{ts,tsx,js,jsx,json,md}`. `.feature` is deliberately absent ...
```

**The rule this phase INVERTS** (`packages/gherkin/test/fixtures/README.md:23-26`):

```markdown
No fixture may carry a tag matching `@REQ-EC-NNN`. `spec/scripts/verify-traceability.sh` check 4 greps every `.feature`
file in the repository for that pattern and fails `pnpm verify:spec` when the tag is not defined in
`spec/traceability.md`. Fixture tags use names like `@featuretag`, `@ruletag`, ...
```

The new `packages/vitest/test/acceptance/README.md` states the opposite for its
own directory — this is the ONLY place in the repo where `@REQ-EC-NNN` may
appear on a `.feature`. Leave the gherkin README's sentence intact.

---

### `packages/vitest/test/acceptance/negative-requirements.test.ts` + starved fixtures (D-02)

**Analog:** `scripts/verify-tsgo-gate.sh` assertions 5/6 (the satisfied/starved
flip pair), one level up — a runtime error instead of a compile diagnostic.

**Pair rationale to copy verbatim in spirit** (`verify-tsgo-gate.sh:139-157`):

```bash
# Assertions 5 and 6: THE SATISFIED/STARVED FLIP PAIR.
# step-satisfied.ts and step-missing-service.ts are deliberate near-twins. ...
# Whether the ambient Layer provides the service the step needs is the ONLY substantive difference
# between them.
# ... It is deliberately a committed PAIR rather than a script that edits a file and recompiles:
# there is no mutable working tree, no cleanup path that can leave the repo dirty, and the flip is
# re-proven on every CI run instead of once at authoring time.
```

**Two-check rule — never one** (`verify-tsgo-gate.sh:182-201`): assert the
failure happened AND assert it was the named error. Runtime translation: assert
the Effect/throw is a `StepMatchError` with the right `reason` tag, not merely
that "something failed". `StepMatchError` is exported from
`packages/vitest/src/index.ts:218` precisely so a test can match on the class
rather than on message text.

**Where to copy the existing runtime assertions from:**
`packages/vitest/test/Plan.test.ts` already asserts `UndefinedStep`/`AmbiguousStep`
against values (`spec/traceability.md:191`). The D-02 wrapper's addition is that
the tagged `.feature` FIXTURE is the artifact, run through the real
`describeFeature`/`planFeature`, and the wrapper is what passes.

---

### `scripts/verify-acceptance-no-any.sh` and `scripts/verify-acceptance-ref-state.sh` (gate, structural grep)

**Analog:** `scripts/verify-no-runner-dep.sh` — the repo's canonical structural
grep gate.

**Preamble + method-note pattern** (`verify-no-runner-dep.sh:1-47`):

```bash
#!/usr/bin/env bash
#
# Asserts that <claim>.
#
# METHOD NOTE (do not weaken this):
#   `pnpm test` exiting 0 does NOT prove any of this. Observation cannot
#   distinguish "has no capability" from "has the capability and did not use
#   it today". Only a structural scan can, and that is what this script is.
#
#   Comment lines are stripped before any occurrence is counted. ...
#   Counting raw text would make the gate self-invalidating: documenting the
#   rule would violate it.
#
#   Assertion 1 is a positive control. Without it, a moved or renamed source
#   tree makes assertions 2 and 3 pass by scanning nothing. STATE.md 01-02
#   records a grep-based gate in this repo that passed, and was then proven
#   vacuous by mutation testing.
#
# Usage: bash scripts/verify-no-runner-dep.sh
```

**Body pattern** (`verify-no-runner-dep.sh:49-56` and `verify-tsgo-gate.sh:28-58`):

```bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Spelled out in full rather than composed, so these paths stay greppable.
SRC_DIR="packages/gherkin/src"

fail() {
  echo ""
  echo "✗ <gate name>: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}
```

…and closes with `echo "<gate name>: ENFORCED"` (`verify-tsgo-gate.sh:392-393`).

**Precise-regex pattern for the `let`/`var`-closure and zero-`any` scans**
(`verify-no-runner-dep.sh:64-79`) — note the backtick in the quote class and the
committed positive control:

```bash
FORBIDDEN_RE='(vitest|@effect/vitest|@effect/platform-node|...)'
IMPORT_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"'\`]${FORBIDDEN_RE}(/[^\"'\`]*)?[\"'\`]"
CONTROL_RE="(^|[^A-Za-z0-9_\$])(from|import|require)[[:space:]]*\(?[[:space:]]*[\"'\`]@cucumber/gherkin[\"'\`]"
```

Both new gates MUST strip comment lines before counting (CONTEXT.md's
"a grep-based acceptance criterion that forbids a literal also forbids
explaining it in a comment") and MUST carry a positive control that fails when
the scanned directory is empty or renamed.

**Registration:** add a `verify:<name>` row to root `package.json` `scripts`,
alongside `"verify:tags-filter": "bash scripts/verify-tags-filter.sh"`.

---

### `scripts/verify-watch-rerun.sh` (gate, subprocess + structured report)

**Analog:** `scripts/verify-tags-filter.sh` — the only gate that drives the real
runner from outside and parses its report.

**Subprocess-run pattern** (`verify-tags-filter.sh:146-154`):

```bash
VITEST="node_modules/.bin/vitest"   # repo-local runner, never a global `vitest`

run_vitest() {
  local report="$1" log="$2"
  shift 2
  "$VITEST" run "$TEST_FILE" \
    --allowOnly=false \
    --reporter=json \
    --outputFile="$report" \
    "$@" >"$log" 2>&1 || true
}
```

**Report-as-structured-data pattern** (`verify-tags-filter.sh:56-61, 164-185`) —
never grep the reporter's glyphs:

```bash
report_query() {
  local report="$1" mode="$2" title="${3-}"
  REPORT="$report" QUERY_MODE="$mode" QUERY_TITLE="$title" node -e '
    const report = JSON.parse(require("node:fs").readFileSync(process.env.REPORT, "utf8"))
    const results = (report.testResults || []).flatMap((file) => file.assertionResults || [])
    ...
    const matches = results.filter((result) => result.title === process.env.QUERY_TITLE)
    if (matches.length === 0) console.log("ABSENT")
    else if (matches.length > 1) console.log("AMBIGUOUS")
    else console.log(matches[0].status)
  '
}
```

**Vacuity-control pattern** (`verify-tags-filter.sh:236-246`) — mandatory, and
directly relevant here because an undeclared `@REQ-EC-NNN` tag collapses a file
to zero tests, against which every later assertion is trivially true:

```bash
TOTAL_A="$(report_query "$REPORT_A" total)"
if [[ "$TOTAL_A" -eq 0 ]]; then
  cat "$LOG_A"
  fail "the unfiltered run reported ZERO test results — $TEST_FILE did not collect, so every assertion below would be vacuously true. ..."
fi
```

**Exact-title precondition pattern** (`verify-tags-filter.sh:196-224`) — a
containment grep is NOT sufficient; anchor on `*"Scenario: $title"` at
end-of-line. Reuse this verbatim wherever the watch gate depends on a Scenario
name existing.

**Temp-dir + trap pattern** (`verify-tags-filter.sh:127-133`): the watch gate is
the one gate that MUTATES a file (it edits a `.feature` to trigger a rerun), so
it needs a restore path at least as strong as
`TMP_DIR="$(mktemp -d)"; trap 'rm -rf "$TMP_DIR"' EXIT` — prefer copying the
fixture into `$TMP_DIR` over editing a committed file, matching the tsgo gate's
"no mutable working tree, no cleanup path that can leave the repo dirty"
rationale (`verify-tsgo-gate.sh:153-157`).

---

### `vitest.config.ts` (config, MODIFIED)

**Analog:** itself. Current shape (lines 44-60):

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    tags: [
      { name: "@skip" },
      { name: "@only" },
      ...
      { name: "@exampletag" }
    ],
    allowOnly: false
  }
})
```

Note (e) (lines 37-43) names this phase and its two options. Note (d) (lines
31-35) is a hard constraint: `@undeclared-on-purpose` must NEVER be added, and
"the list stops at eight entries — the ninth slot is deliberately empty" — that
sentence needs updating if 22 literal entries are appended. Preferred: spread
`gherkinTags("packages/vitest/test/acceptance/**/*.feature")`
(`packages/vitest/src/index.ts:174`), whose whole purpose is this, and whose
spread-into-`TestTagDefinition[]` claim is already type-asserted by
`packages/vitest/test/GherkinTags.types.ts`. Note (c) (lines 26-29) forbids
touching the include/exclude globs.

---

### `spec/traceability.md` §5 (doc, MODIFIED)

**Analog:** §4 "Test file map" (lines 146-211).

**Preamble pattern** (lines 148-165) — state the enumeration source and call out
every deliberate non-obvious entry:

```markdown
Every row below names a real file on disk. The preamble's planned/real split
applies to the **Source module** column above, never to this section.

The rows below are enumerated from disk — one per ... file — plus **three deliberate non-suite
entries**, ... Each is listed here because it is the ONLY place its claim is asserted ...
```

**Trailing exclusion-note pattern** (lines 202-211) — the model for explaining
why the D-02 starved fixtures are tagged but never green:

```markdown
`packages/vitest/test/tsgo-gate/` is deliberately absent from the table above,
and its absence is not drift. Those files are **compile-gate fixtures**, not
vitest suites: most of them are meant not to compile ... They are asserted by
`scripts/verify-tsgo-gate.sh`, which compiles each one against its own isolated
`tsconfig` ... — that script, not this table, is where INV-EC-003's enforcement
is traced.
```

**Text being REPLACED** (lines 213-219), quoted so the planner can grep it:

```markdown
## §5 Acceptance scenario traceability

Empty — no acceptance suite exists yet. ... Each row will map a `@REQ-EC-NNN` tag to the `.feature`
file carrying it and the behavior(s) it verifies, once the acceptance suite exists.
```

Per D-01 the replacement table columns are: `REQ-EC-NNN` | v1 requirement ID |
`.feature` file | Scenario title | behavior(s). The 22 v1 requirement IDs are
enumerated at `.planning/REQUIREMENTS.md:84-105` (PARSE-01..04, MATCH-01..05,
DSL-01..07, RUN-01..06) — RUN-06 is the only `Pending` row and this phase flips
it to Complete.

---

## Shared Patterns

### Prove-it-don't-assert-it gate preamble
**Source:** `scripts/verify-no-runner-dep.sh:16-46`, `scripts/verify-tsgo-gate.sh:10-24`, `scripts/verify-tags-filter.sh:13-74`
**Apply to:** all three new `scripts/verify-*.sh`
Every gate opens with a METHOD NOTE explaining what a green `pnpm test` does
NOT prove, names the mutation that would slip past a weaker check, and carries
at least one positive/vacuity control. `fail()` messages name the likely cause
and the file to look at, never just "assertion failed".

### Mutation-test every new assertion
**Source:** `packages/vitest/test/emission.test.ts:99-140` (mutations A–I, each "performed, run, then reverted"); `scripts/verify-tags-filter.sh:32-42` (mutation proof 1a vs 1c)
**Apply to:** every D-02 wrapper test, every D-03 checklist test, all three new gates
The recorded form is: the mutation, what went red, and — critically — what
stayed green. `verify-tags-filter.sh:32-42` is the exemplar of "do not
'simplify' the sharp mutation back into the blunt one".

### Submodule namespace imports
**Source:** `packages/vitest/test/emission.test.ts:171-182`
**Apply to:** every new `.ts` file
`import * as Effect from "effect/Effect"`, never `import { Effect } from "effect"`.
`effect/testing` has no barrel — `TestClock` is at `effect/testing/TestClock`.
The behaviors' worked examples use barrel imports and are explicitly flagged as
wrong for this repo (`spec/behaviors/03` caveat, item 3): translate them.

### Path constants spelled out, never composed
**Source:** `scripts/verify-tsgo-gate.sh:33-46`, `scripts/verify-tags-filter.sh:83-84`
**Apply to:** all three new gates
> `# Spelled out in full rather than composed from a $FIXTURE variable, so these paths are greppable for traceability checks.`

### Strip comments before counting
**Source:** `scripts/verify-no-runner-dep.sh:36-39`, `vitest.config.ts:22-23` (note (b): "the literal setting is written exactly once, below, so that an acceptance grep counting it cannot be satisfied by this paragraph instead — STATE.md's 03-04 lesson")
**Apply to:** `verify-acceptance-no-any.sh`, `verify-acceptance-ref-state.sh`

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `spec/overview.md` / `packages/vitest/README.md` INV-EC-003 lint-recommendation paragraph (D-04a) | doc | — | No existing "recommended consumer lint config" prose anywhere in the repo. Nearest tone reference is `spec/invariants.md` §INV-EC-003's own boundary wording and `verify-tsgo-gate.sh:169`'s standing warning ("Do not add `any` to the fixture to make this pass — one `any` in a step body is assignable to everything and disables the whole guarantee"), which is the argument the new paragraph should restate for consumers. |

## Metadata

**Analog search scope:** `packages/vitest/{src,test}`, `packages/gherkin/test`,
`scripts/`, `spec/`, `vitest.config.ts`, root `package.json`
**Files scanned:** 120 (find), 11 read in full or in targeted ranges
**Pattern extraction date:** 2026-08-30
