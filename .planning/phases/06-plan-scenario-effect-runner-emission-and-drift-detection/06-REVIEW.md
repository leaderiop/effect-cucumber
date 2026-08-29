---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
reviewed: 2026-08-29T04:02:55Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - README.md
  - packages/gherkin/src/Snippet.ts
  - packages/gherkin/src/index.ts
  - packages/gherkin/test/Snippet.test.ts
  - packages/vitest/README.md
  - packages/vitest/package.json
  - packages/vitest/src/CallSite.ts
  - packages/vitest/src/Errors.ts
  - packages/vitest/src/Plan.ts
  - packages/vitest/src/Registry.ts
  - packages/vitest/src/Runner.ts
  - packages/vitest/src/ScenarioEffect.ts
  - packages/vitest/src/TestApi.ts
  - packages/vitest/src/describeFeature.ts
  - packages/vitest/src/index.ts
  - packages/vitest/test/CallSite.test.ts
  - packages/vitest/test/Errors.test.ts
  - packages/vitest/test/Plan.test.ts
  - packages/vitest/test/Registry.test.ts
  - packages/vitest/test/Runner.test.ts
  - packages/vitest/test/ScenarioEffect.test.ts
  - packages/vitest/test/describeFeature.test.ts
  - packages/vitest/test/emission.test.ts
  - packages/vitest/test/tsgo-gate/tsconfig.json
  - packages/vitest/tsconfig.json
  - packages/vitest/tsconfig.test.json
  - pnpm-lock.yaml
  - spec/invariants.md
  - spec/roadmap.md
  - spec/traceability.md
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-08-29T04:02:55Z
**Depth:** standard
**Files Reviewed:** 29 (`spec/traceability.md` counted once; `pnpm-lock.yaml` spot-checked as a diff-only artifact)
**Status:** issues_found

## Summary

This phase implements the Plan → ScenarioEffect → Runner pipeline and its drift-detection surface
(`StepMatchError`, `UnusedStepDefinitionWarning`) for `@effect-cucumber/vitest`, plus the
`CallSite.ts` definition-site capture mechanism and `generateStepSnippet` in `@effect-cucumber/gherkin`.
The implementation is unusually well-documented and unusually thoroughly mutation-tested — every
module doc comment states the failure mode a plausible "tidy-up" would introduce, and nearly every
non-obvious branch has a test built specifically to discriminate it from a wrong implementation. I
was not able to find a crash, injection vector, or clearly incorrect happy-path behavior in the
reviewed source.

That said, an adversarial pass over the actual logic (not just the accompanying prose) turned up five
real defects worth fixing and two quality gaps. The most concrete is `WR-01`: the `AmbiguousStep`
sort in `Plan.ts` silently drops the very "never depend on registration order" guarantee the whole
MATCH-04/D-03 design exists to provide, in exactly the case where the sort's own tiebreak matters —
and, unlike the sibling `UnusedStepDefinitionWarning` sort a few lines below it in the same file,
there is no test that exercises the tied case. `WR-02` is a genuine message-quality defect: every
`AmbiguousStep` error embeds a hardcoded, unrelated illustrative example (`{int}`/`{word}` apples)
regardless of what the real competing patterns are, which actively undermines the stated design goal
that the message "stand alone" without a second source of confusion. The rest are smaller: an unused,
undocumented, untested field (`WR-03`), a magic string tripled across three modules with one
unreachable branch (`WR-04`), and an unescaped-name gap in the threat model (`WR-05`).

No Critical/Blocker findings were identified.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `AmbiguousStep`'s pattern ordering has no tiebreak, unlike its sibling sort in the same file

**File:** `packages/vitest/src/Plan.ts:357`
**Issue:**

`ambiguousStep` orders the colliding patterns with:

```ts
const ordered = matches.toSorted((left, right) => compareCallSites(left.definedAt, right.definedAt))
```

`compareCallSites` returns `0` both when two sites are structurally equal (e.g. two definitions that
happen to share a `file`/`line`/`column`) and, per `CallSite.ts`, when **both sites are `null`**
(`compareCallSites(null, null) === 0`). In either tie case, `Array.prototype.toSorted` is stable, so
the result falls back to `matches`' incoming order — which is the matcher's return order, which is
effectively registration order.

That is precisely the property MATCH-04/D-03 exists to rule out. The module's own doc comment says so
in the same file: *"registration order would make the message itself change under an unrelated
refactor, which is the very defect this error exists to report."* `definedAt: null` is not a
theoretical case — `CallSite.ts` documents it as the real outcome when a stack offers no frame outside
the package's own directory, and nothing prevents two competing definitions from both landing there
(e.g., two step definitions registered from a deeply-generated or wrapped call site that exhausts
`Error.stackTraceLimit`, or two hand-constructed `StepDefinition`s as several of this repo's own test
fixtures build). When it happens for two *colliding* patterns, `AmbiguousStep.matchedPatterns` — and
therefore the rendered message — becomes registration-order-dependent again, silently.

Contrast this with `planFeature`'s other sort a few dozen lines below, for
`UnusedStepDefinitionWarning`, which explicitly adds a secondary key for exactly this reason:

```ts
.toSorted((left, right) => {
  const bySite = compareCallSites(left.definedAt, right.definedAt)
  return bySite === 0 ? left.pattern.localeCompare(right.pattern) : bySite
})
```

`ambiguousStep` has no equivalent, and no test in `Plan.test.ts` or `Errors.test.ts` exercises two
colliding matches that both carry `definedAt: null` (or the same site), so the gap is currently
invisible to the suite despite the file's otherwise very deliberate mutation-testing discipline.

**Fix:**
```ts
// Plan.ts, inside ambiguousStep
const ordered = matches.toSorted((left, right) => {
  const bySite = compareCallSites(left.definedAt, right.definedAt)
  return bySite === 0 ? left.pattern.localeCompare(right.pattern) : bySite
})
```
Add a test with two `define({ ..., definedAt: null })` entries (or two identical sites) matching one
step, and assert the message/`matchedPatterns` order is stable and independent of the definitions
array's input order — mirroring the existing "returns warnings in an order that does not depend on
the registration order" test for `UnusedStepDefinitionWarning`.

### WR-02: Every `AmbiguousStep` message embeds a hardcoded, unrelated illustrative example

**File:** `packages/vitest/src/Plan.ts:369-370`
**Issue:**

`ambiguousStep`'s message always appends this fixed text, regardless of which two patterns actually
collided:

```ts
"`I have {int} apples` and `I have {word} apples` both match `I have 5 apples`, yielding the",
"number 5 from one and the string \"5\" from the other.",
```

This is a generic illustration of *why* ambiguity is a problem, not a description of the failure
being reported. It is spliced into the message using the same backtick-quoting style used elsewhere
for real, situation-specific values (e.g. the just-listed matching patterns above it), so a reader has
no visual cue that this sentence is not about their step. Confirmed with the real rendered example
from this phase's own summary (`06-04-SUMMARY.md`):

```
...listed here in definition-site order. "I do the
{word}" was registered as a Given at /repo/test/shop.steps.ts:9:5. "I do the thing" was registered
as a Given at /repo/test/shop.steps.ts:10:5. Resolving this by registration order would make the
...an unrelated refactor that reorders two registrations would silently change what this test asserts:
`I have {int} apples` and `I have {word} apples` both match `I have 5 apples`, yielding the number 5
from one and the string "5" from the other. Delete all but one of them, ...
```

Here the actual colliding patterns are `"I do the thing"` / `"I do the {word}"`, and the message then
pivots — with no "for example" framing — to a completely unrelated `{int}`/`{word}`/apples scenario.
A developer skimming this for the first time can easily read the second, canned example as further
description of their own failure. This directly undercuts the stated design goal (restated in the
module doc comment and in `06-04-SUMMARY.md`'s own "Judgement") that each message should "stand
alone" and let "a developer who has never opened this codebase act on [it] without reading a source
file."

**Fix:** Either drop the canned example (the preceding sentence about registration-order dependence
already states the risk abstractly and correctly) or clearly mark it as illustrative:
```ts
"For example, `I have {int} apples` and `I have {word} apples` both match `I have 5 apples`,",
"yielding the number 5 from one and the string \"5\" from the other — a change nobody asked for.",
```

### WR-03: `ScenarioPlan.ruleId` has no consumer, no doc-comment justification, and no test coverage of its value

**File:** `packages/vitest/src/Plan.ts:211,553`
**Issue:**

`ScenarioPlan` carries `readonly ruleId: Option.Option<string>`, populated from `scenario.ruleId` in
`planFeature`. Grepping the whole package finds no reader of this field anywhere in `src`:

```
$ grep -rn "ruleId" packages/vitest/src packages/vitest/test
packages/vitest/src/Plan.ts:211:  readonly ruleId: Option.Option<string>
packages/vitest/src/Plan.ts:553:    ruleId: scenario.ruleId,
packages/vitest/test/ScenarioEffect.test.ts:181:  ruleId: Option.none(),   # fixture filler only
```

`Runner.ts` (the only place that would plausibly need it) re-derives Rule nesting independently by
walking `feature.rules[].scenarios` and joining on `scenarioId`, never reading `ruleId`. Unlike every
other field on `ScenarioPlan` (`name` vs. `astName` gets a full paragraph explaining the difference
and the failure mode of confusing them), `ruleId` gets no explanation at all in the type's doc
comment, and no test in `Plan.test.ts` or `Runner.test.ts` asserts its value for a Scenario that is
actually inside a `Rule:` block versus one that is not. Given this codebase's own stated standard
("every behaviour ... gets tests," every field elsewhere in this phase is asserted and mutation-tested),
this is an inconsistency: if the `scenario.ruleId` join were ever wrong (e.g., swapped, or `None` for
every Rule-nested Scenario), nothing in the test suite would notice.

**Fix:** Either wire a real consumer (or state explicitly in the doc comment that it is intentionally
unused today and name the future consumer, matching this module's own house style for every other
forward-looking decision — e.g. Phase 8's Rule-scoped Layer), or add a `Plan.test.ts` assertion that a
Scenario nested in a `Rule:` block gets `ruleId: Option.some(...)` and a top-level Scenario gets
`Option.none()`.

### WR-04: The "an unrecorded location" wording is tripled across three modules with one unreachable branch

**File:** `packages/gherkin/src/ParameterTypes.ts:160`, `packages/vitest/src/CallSite.ts:88`, `packages/vitest/src/Runner.ts:112`
**Issue:**

The literal string `"an unrecorded location"` is independently hardcoded in three places:

```
packages/gherkin/src/ParameterTypes.ts:160:const unrecordedLocation = "an unrecorded location"
packages/vitest/src/CallSite.ts:88:const unrecordedLocation = "an unrecorded location"
packages/vitest/src/Runner.ts:112:    Option.getOrElse(warning.definedAt, () => "an unrecorded location")
```

The duplication across `ParameterTypes.ts` and `CallSite.ts` is a deliberate, documented tradeoff (to
keep each module free of a cross-package/cross-module import) and is reasonable. `Runner.ts`'s copy,
however, is dead in production: `warning.definedAt` is only ever `Option.none()` when a
`UnusedStepDefinitionWarning` is constructed by hand (as several tests do); the one real producer,
`Plan.ts`'s `unusedStepDefinition`, always calls `formatCallSite` first and passes the *already
formatted* string (which itself already contains `"an unrecorded location"` when the site is absent),
so `definedAt` coming out of `planFeature` is always `Option.some(...)`. `Runner.ts`'s
`Option.getOrElse(..., () => "an unrecorded location")` branch can therefore never fire on the actual
`describeFeature` → `planFeature` → `emitFeature` path — it is only reachable through the one
hand-built warning in `Runner.test.ts`. No test anywhere asserts that the three copies of this string
stay byte-identical, so a future wording change in one location (e.g. `CallSite.ts`, which is quoted
verbatim in a reader-facing message) would silently diverge from `Runner.ts`'s copy with nothing to
catch it.

**Fix:** Low priority, but worth a one-line note in `Runner.ts` at the `warningTitle` fallback stating
that the branch is currently unreachable via `planFeature` and exists only for a directly-constructed
`UnusedStepDefinitionWarning` (following this codebase's own convention of naming a construct's
reachable case explicitly, e.g. `Snippet.ts`'s note on its positional-name fallback). Consider a
single exported constant if a fourth copy is ever added.

### WR-05: Feature/Rule/Scenario names reach test titles and terminal output unescaped, with no threat-model entry for that specific surface

**File:** `packages/vitest/src/Runner.ts` (test titles via `api.describe`/`api.effect`), `packages/vitest/src/describeFeature.ts:342-344` (`console.warn`)
**Issue:**

`Plan.ts` and `Runner.ts` are careful to run every step *pattern* and step *text* through
`JSON.stringify` before embedding it in a message or a test title (T-06-04-03, T-06-06-01), so a
pattern containing a quote or control character cannot forge message structure. Feature, Rule and
Scenario **names**, however, are deliberately passed through unescaped into both the emitted
`describe`/`it.effect` titles (`plan.feature.name`, `rule.name`, `scenarioPlan.name`) and, through
`warning.message`, into `console.warn` output. This is a documented, intentional choice ("they must
render exactly as the author wrote them"), but the accompanying threat register only covers pattern
text and absolute file paths — there is no disposition for a `.feature` file whose `Feature:`/
`Scenario:`/`Rule:` name contains ANSI escape sequences or other control characters, which would be
written verbatim to a CI terminal/log via both the vitest reporter and `console.warn`. For a project
whose `.feature` files may originate from a less-trusted contributor (e.g. a PR that only touches
`.feature` files and never touches reviewed step-definition code), this is a real, if narrow, log/
terminal-injection surface that the existing threat model does not acknowledge.

**Fix:** Not necessarily a code change — this may be an acceptable risk identical in kind to the
already-accepted "absolute developer paths in output" disposition — but it should be an explicit
`accept` disposition in the threat register rather than an unaddressed gap, so a future reviewer does
not have to rediscover it.

## Info

### IN-01: `packages/vitest/tsconfig.json` widened workspace-wide ambient globals from `types: []` to `types: ["node"]`

**File:** `packages/vitest/tsconfig.json:4`
**Issue:** This phase adds `"types": ["node"]` to the package's main `tsconfig.json` (and its test/
gate siblings) solely so `console.warn` in `describeFeature.ts` type-checks. This is well-justified
and documented in-line, but it is a package-wide capability widening (every file under `src` now has
ambient `NodeJS`/`process`/etc. globals in scope, not just `describeFeature.ts`) for the sake of one
call site. Not a defect, just worth flagging for anyone auditing why a previously `types: []` package
gained Node ambient types — a stricter (if more awkward) alternative would have been a local
`declare const console: { warn: (...args: unknown[]) => void }` in the one file that needs it.

### IN-02: `registrarKeywordByKeywordType` in `Plan.ts` silently falls back to `"Given"` for any unrecognized `keywordType`, including future dialects

**File:** `packages/vitest/src/Plan.ts:253-258,278-281`
**Issue:** `registrarKeywordOf`'s fallback chain ends in `?? "Given"` for *any* `keywordType` not in
`{Context, Action, Outcome, Conjunction}` — including a value like `"Unknown"` that
`@cucumber/gherkin`'s own dialect table can, in principle, produce, and including any keyword type a
future upstream gherkin version might add. This is intentional and documented ("a suggestion has to
name some registrar and `Given` is the one that reads least wrong"), and it only affects the
*suggested snippet* text (not the reported/matched keyword), so the blast radius is small. Flagged
only because there is no test pinning the `"Unknown"`-keywordType path specifically (the existing
`starKeyword` test exercises the `*` keyword, which has `keywordType: "Unknown"` today, so this may
already be covered incidentally — worth confirming that fixture is what exercises this branch rather
than the literal-keyword branch).

---

_Reviewed: 2026-08-29T04:02:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
