---
phase: 10-layer-scopes-per-scenario-default-shared
reviewed: 2026-08-30T13:56:25Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - packages/vitest/src/TestApi.ts
  - packages/vitest/src/Runner.ts
  - packages/vitest/src/describeFeature.ts
  - packages/vitest/test/Runner.test.ts
  - packages/vitest/test/emission.test.ts
  - spec/behaviors/02-shared-layers-and-tags.md
  - spec/invariants.md
  - spec/traceability.md
findings:
  critical: 0
  warning: 7
  info: 3
  total: 10
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-08-30T13:56:25Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the current state of the eight files carrying plans 10-07 (the `EmitOptions.contextFree`
routing flag) and 10-08 (the spec write-up). The routing mechanism itself is **correct**, and I
verified that rather than accepting it:

- Read the installed `@effect/vitest@4.0.0-rc.112` `dist/internal/internal.js` directly. The shared
  constructor really is `effect => Effect.flatMap(contextEffect, context => effect.pipe(Effect.scoped,
  Effect.provide(context)))`, so any body — including `Effect.void` — forces the memoised build. The
  module-level constructor is `makeTester(flow(Effect.scoped, Effect.provide(TestEnv)), V.it)`, which
  supplies its own clock/console and touches no shared Layer. Routing `⚠` nodes to the second one is
  a real fix, not a re-labelling.
- Confirmed the `blockTasks.length === 0` early-return arm of `layer(...)` is reached identically
  before and after the change (emission is always inside a deferred `describe(feature.name, …)`
  factory, so `collectTasks` sees an empty task list either way), so release timing is unchanged.
- Traced the residual build paths for a totally-excluded Feature: `describe` (no build), `⚠` nodes
  (now routed off), `⚙ AfterAllScenarios` (already suppressed by `runnableScenarioCount > 0`),
  `@skip` nodes (`it.skip` never invokes the body). No remaining path forces a build. The gap is
  genuinely closed.
- Ran the gates: `vitest run` on both test files (107 passed / 3 skipped), `tsc --noEmit -p
  packages/vitest/tsconfig.test.json`, `oxlint`, `dprint check`, and
  `spec/scripts/verify-traceability.sh` (7 PASS / 0 FAIL). All clean.

**No BLOCKER-class defect found.** That is a measured result, not a default.

What the diff *does* carry is a cluster of truth-and-coverage defects that this repo's own conventions
(`AGENTS.md` §1 "spec/ is normative" and §4 "Say only what is true") make material: a load-bearing
doc note in `Runner.ts` that the file itself falsifies; a `contextFree` contract documented as a
property of a node's *body* while the code uses it as a *route selector*, with no guard on the one
direction that fails silently; a structural routing assertion that covers only one of `Runner.ts`'s
two Scenario loops; a "load-bearing non-vacuity control" whose stated proxy argument does not hold;
and a normative REQUIREMENT block left asserting a MUST the implementation now deliberately does not
satisfy, while the requirements it backs were re-marked Complete.

## Warnings

### WR-01: `Runner.ts` note (a) asserts a rule the file violates ten times, on a rationale that is factually wrong about the gate

**File:** `packages/vitest/src/Runner.ts:18-21` (claim), contradicted at `:9`, `:36`, `:37`, `:64`,
`:65`, `:222`, `:260`, `:476`, `:700`; reinforced by 10-07's own added text at `:211-212`

**Issue:** Note (a) states:

> "No import from `vitest`, or from the `@effect` package wrapping it, may ever appear here — not even
> an `import type`. **Neither name is written out anywhere in this file, comments included, because
> the acceptance grep that enforces the rule cannot tell a citation from an import**"

Both halves are false.

1. `vitest` *is* written out, in comments, nine times — `grep -n vitest packages/vitest/src/Runner.ts`
   returns lines 9, 18, 36, 37, 64, 65, 222, 260, 476, 700.
2. The acceptance grep **can** tell a citation from an import. `scripts/verify-testapi-seam.sh` builds
   `COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'` and pipes every line through
   `grep -vE "$COMMENT_RE"` *before* matching `IMPORT_RE`, precisely so that a doc comment naming a
   framework cannot register as a hit. Its own METHOD NOTE says so.

Plan 10-07 then added, at `:211-212`, "Named here as a property of the EMISSION ROUTE, without
importing or **naming** a framework specifier, exactly as note (a) refuses to" — propagating the false
claim into new text.

This is not cosmetic in this repo. `AGENTS.md` §4 ("Say only what is true") makes a doc comment that
states an unenforced/violated rule a defect in its own right, and a future maintainer acting on note
(a) would strip legitimate, useful citations (e.g. `:222`, the deferred-`describe` explanation that
note (h) depends on) to satisfy a constraint that does not exist.

**Fix:** Narrow the claim to what the gate actually enforces:

```ts
 * (a) **No IMPORT of a test framework may ever appear here — not even an `import type`.**
 *     `scripts/verify-testapi-seam.sh` enforces this structurally: it strips comment lines before
 *     matching, so a framework named in PROSE (as it is several times below, and in `TestApi.ts`
 *     note (a)) is not a violation and cannot false-positive the gate. Only an import position —
 *     `from "…"`, `import "…"`, `import("…")`, `require("…")` — is scanned.
```

Then delete the "exactly as note (a) refuses to" clause at `:212`.

### WR-02: `EmitOptions.contextFree` is documented as a property of a node's BODY but is only ever a ROUTE selector — and the silent-failure direction is undocumented and unguarded

**File:** `packages/vitest/src/TestApi.ts:152-180`; consumer at
`packages/vitest/src/describeFeature.ts:596-600`; producers at `packages/vitest/src/Runner.ts:376`,
`:389`, `:592`, `:649`

**Issue:** The field is specified as a *predicate over the body*:

> "`true` when this node's body requires NOTHING from either of the Feature's Layer tiers"

But `Runner.ts` does not compute that predicate — it hard-codes the value per node *kind*. Every
Scenario is `contextFree: false` (`:592`, `:649`) regardless of whether its steps need anything, so
the code establishes only the one-way implication `contextFree ⇒ body needs nothing`, never the
converse the doc asserts.

The doc then warns about exactly one misuse — setting `true` on `⚙ AfterAllScenarios` (`:158-166`) —
and says nothing about the symmetrical, more likely one: a maintainer reading the documented
predicate literally and marking a Scenario whose steps look service-free `contextFree: true`. On the
shared path that Scenario is routed to `contextFreeEffect`, which supplies neither the shared tier nor
`testEnv`. Two outcomes, and only one is loud:

- the Scenario names a shared service → runtime missing-service defect (loud, but attributed to the
  step, not to the flag);
- the Scenario reads only the clock or console → it silently runs against the *framework's* per-test
  `TestEnv` instead of `sharedLayerTestApi`'s `Effect.provide(testEnv)`. Nothing goes red, and
  ADR-EC-018's isolation reasoning no longer applies to that node.

Nothing in the type system, in `Runner.ts`, or in any test prevents a Scenario emission from carrying
`contextFree: true` — the field is a bare `boolean` on a struct any of the four call sites builds
inline.

**Fix:** State the contract as the routing directive it is, and name the second failure direction:

```ts
  /**
   * Which EMISSION ROUTE this node takes on the shared path — `true` selects the Layer-free route.
   *
   * The emitter sets this per node KIND, never by analysing a body: only the library's own `⚠`
   * nodes are `true`. Every Scenario is `false` unconditionally, even one whose steps happen to
   * need nothing, because the flag is a routing decision and a Scenario's body is the author's.
   *
   * Setting `true` on a Scenario is the mirror of the `⚙ AfterAllScenarios` mistake below and is
   * WORSE, because one of its two outcomes is silent: a Scenario naming a shared service fails
   * loudly with a missing-service defect, but one that only reads the clock or console runs against
   * the framework's own per-test services instead of `sharedLayerTestApi`'s `Effect.provide(testEnv)`
   * — ADR-EC-018's isolation argument no longer covers it, and nothing goes red.
   */
  readonly contextFree: boolean
```

Consider additionally narrowing the emitted value at the two Scenario call sites to the literal
`false` via a shared `const scenarioEmitBase = { contextFree: false } as const`, so a future edit has
to be deliberate.

### WR-03: the structural routing assertion covers only one of `Runner.ts`'s two Scenario loops

**File:** `packages/vitest/test/Runner.test.ts:1361-1401`; uncovered source at
`packages/vitest/src/Runner.ts:649`

**Issue:** `Runner.ts` deliberately writes its Scenario emission out **twice** — once for
Feature-level Scenarios (`:577-593`) and once for Rule-nested ones (`:638-650`) — and `Runner.test.ts`
already records why that duplication needs paired coverage, in the `filtering` fixture's own header
(`:604-607`):

> "the filter is written out twice in `Runner.ts`, once per loop, and a fixture with no Rule would
> leave the second copy free to be deleted with every assertion still green."

The new `routingOf` assertion drives the `checkout` fixture (`:489-501`), which declares **no `Rule`**.
`routingOf` is referenced exactly once in the file (`:1389`). So `Runner.ts:649`'s
`contextFree: false` is pinned by nothing structural: flipping it to `true` leaves every assertion in
`Runner.test.ts` green.

The mitigation is real but incidental rather than structural: `emission.test.ts`'s "Shared rule
composition" block (`:2551-2582`) would go red, but only because that particular fixture's Rule Layer
is derived from the shared tier (`ruleNetPrices` `[90, 90]`). A Rule fixture that did *not* read a
shared service would leave the mutation entirely undetected — which is the same "covered by accident"
condition the file's own header rejects for `shapeOf` vs `emissionOf`.

**Fix:** Reuse the existing `shop` fixture (it has one Rule with two Scenarios, and `shopRule` is
already resolved at `:814`) for a second `routingOf` assertion, so both loops are pinned:

```ts
  it("marks a RULE-NESTED Scenario NOT context-free — Runner.ts's second Scenario loop", () => {
    const { api, records } = makeRecordingApi()
    emitFeature({
      api,
      plan: planFeature({ feature: shop, definitions: shopRecorderDefinitions }),
      layer,
      hooks: emptyHooks,
      ...noRuleScope,
      ...unfiltered
    })
    assert.deepStrictEqual(routingOf(records), [
      { kind: "describe", name: "Shop", contextFree: null },
      { kind: "effect", name: "browsing", contextFree: false },
      { kind: "describe", name: "refunds", contextFree: null },
      { kind: "effect", name: "refund granted", contextFree: false },
      { kind: "effect", name: "refund denied", contextFree: false }
    ])
  })
```

### WR-04: the 10-07 block's "load-bearing non-vacuity control" does not observe what its own comment claims it observes

**File:** `packages/vitest/test/emission.test.ts:2726-2745` (comment at `:2735-2737`)

**Issue:** The control asserts that a `console.warn` line containing `UnusedStepDefinition` was
printed for this Feature's uri, and justifies it as:

> "The console line and the `⚠` node come from the same `plan.warnings` array (`describeFeature.ts`
> lines ~1147-1155), so the line's presence is a **sound proxy** for the node's emission"

They come from the same *array*, but from two independent *code paths* in two different modules:

- the console line: `describeFeature.ts:1154-1156`, a loop in `describeFeature`'s own body, executed
  synchronously at call time;
- the `⚠` node: `Runner.ts:679-681`, a loop inside `emitFeature`'s deferred `describe` callback.

Nothing links them. `Runner.ts` note (g) (`:194-199`) records that "the `⚠` warning nodes emit [even
when every Scenario is filtered out]" as a **decision**, i.e. exactly the thing that could be reverted.
Add `if (excludedScenarioCount === 0)` around `Runner.ts:679` and this block stays **fully green** —
the console line is still printed, `excludedEverythingSharedBuilds` is still `0`, and the build-0
assertion has become vacuous for precisely the reason the control was written to rule out.

Mutation 4 as recorded (`:2631-2636`) deletes the *step definition*, which kills both channels at
once, so it cannot discriminate between them.

The claim is recoverable at repo level — `Runner.test.ts:2013-2030` ("emits identical ⚠ nodes with no
filter and with a filter that excludes every Scenario") does pin the node — but that is in another
file, is not cited here, and the comment asserts a soundness property that is false.

**Fix:** Replace the soundness claim with an honest one and cite the assertion that actually carries
it:

```ts
    // NOT a proxy for the ⚠ NODE's emission: the console line comes from describeFeature.ts's own
    // body loop (~:1154) and the node from Runner.ts's emission loop (~:680) — two independent code
    // paths over one shared `plan.warnings` array. Suppressing the node alone would leave this
    // assertion green. What pins the node under a total exclusion is
    // `Runner.test.ts`'s "emits identical ⚠ nodes with no filter and with a filter that excludes
    // every Scenario"; what THIS control rules out is a Feature that produced no warning at all,
    // which is the other way the build-0 assertion above could go vacuous.
```

### WR-05: BEH-EC-007's normative REQUIREMENT block now contradicts shipped behaviour, and RUN-03/RUN-04 were re-marked Complete against it

**File:** `spec/behaviors/02-shared-layers-and-tags.md:91-97` (REQUIREMENT, unchanged) vs `:145-181`
(the new correction)

**Issue:** The normative block still reads:

```
REQUIREMENT: When describeFeature's second argument has a `shared` field, that
             Layer MUST be built exactly once for the whole Feature ...
```

The correction added by 10-08 concedes the divergence in its own words (`:152-153`): *"Read literally,
'exactly once' would say once. The answer that matches the rest of the system is zero"* — and then
labels the change *"a STRENGTHENING of the requirement, not a divergence from it"* (`:148-149`). Those
two sentences cannot both be true: 0 ≠ 1, and a MUST the implementation intentionally does not satisfy
in a named case is a divergence by definition.

This matters for three concrete reasons, not as an editorial preference:

1. `AGENTS.md` §1: *"`spec/` is normative. Code follows the spec, not the reverse."* Here the code
   deliberately does not.
2. The **sibling** correction directly above it (`:99-143`, the RELEASE half) handles the identical
   situation the opposite way — it calls itself a divergence and explicitly says *"the requirement is
   left standing so the gap stays visible."* Two adjacent corrections on one requirement now use two
   incompatible conventions, so a reader cannot tell from the document whether a "correction" means
   "the requirement is wrong" or "the requirement is fine".
3. Commit `6b95833` re-marked RUN-03/RUN-04 **Complete** in `.planning/REQUIREMENTS.md` in the same
   plan. A requirement marked Complete against a MUST clause the implementation knowingly violates is
   exactly the state `spec/process/definitions-of-done.md` exists to prevent.

Note also that `AGENTS.md` §2's planned doc-fence check and any future conformance reader parse the
` ``` `-fenced REQUIREMENT block, not the `>`-quoted corrections around it.

**Fix:** Amend the normative block so the boundary is *in* the requirement, and reduce the correction
to a dated pointer:

```
REQUIREMENT: When describeFeature's second argument has a `shared` field, that
             Layer MUST be built AT MOST ONCE for the whole Feature (via
             @effect/vitest's layer(...) helper): exactly once when the Feature
             emits at least one node whose body needs it, and ZERO times when it
             emits none — a Feature whose every Scenario a registration-time tag
             filter removed never builds its shared tier, because the library's
             own always-passing warning nodes are routed off the shared emission
             path (ADR-EC-026, plan 10-07). Its resources MUST be released once,
             after every Scenario in the Feature has run — not once per Scenario.
```

If the append-only-correction convention must be preserved instead, then at minimum drop the
"STRENGTHENING, not a divergence" framing and match the RELEASE correction's wording, and re-open
RUN-03/RUN-04 until the requirement text and the implementation agree.

### WR-06: the new correction attributes BEH-EC-017's carve-out to "this behavior"

**File:** `spec/behaviors/02-shared-layers-and-tags.md:165-167`

**Issue:**

> "The `AfterAllScenarios` teardown node was already suppressed in this situation (**this behavior's
> own carve-out**, [BEH-EC-017](./07-hook-ordering-and-guarantees.md))"

The enclosing behavior is **BEH-EC-007**. The carve-out belongs to **BEH-EC-017**, in a different
document (`spec/behaviors/07-hook-ordering-and-guarantees.md:89-102`). The link target is right; the
attribution is wrong, and in a spec whose whole navigational contract is `BEH-EC-NNN` identity, "this
behavior's own" pointing at a different behavior is the kind of drift `spec/traceability.md` exists to
make impossible.

**Fix:**

```
> `AfterAllScenarios` teardown node was already suppressed in this situation by
> [BEH-EC-017](./07-hook-ordering-and-guarantees.md)'s own carve-out; the warning node that
```

### WR-07: the behaviour change and its spec update landed in different commits, against `AGENTS.md` §1

**File:** `packages/vitest/src/Runner.ts`, `packages/vitest/src/TestApi.ts`,
`packages/vitest/src/describeFeature.ts` (commit `743e9a0`) vs `spec/invariants.md`,
`spec/behaviors/02-shared-layers-and-tags.md` (commit `e63ba4f`), `spec/traceability.md`
(commit `6b95833`)

**Issue:** `AGENTS.md` §1 is explicit:

> "Changing public behavior means updating the relevant behavior doc, invariant, and the traceability
> matrix **in the same change** … a code change that isn't reflected in `spec/` in the same commit is
> **incomplete**, not merely undocumented."

`git show --stat 743e9a0` lists five files, all under `packages/vitest/` — no `spec/` file. The
behaviour change (a Feature with every Scenario excluded no longer builds its shared tier: an
observable change for any caller with a testcontainer in `shared`) therefore sat on `main` across
`b7349e5`, `2cd2c92`, `d2a2139` and `557c87c` with `spec/` describing the old behaviour, and
`spec/behaviors/02` in particular still asserting an unqualified build-once MUST.

**Fix:** Process, not code — squash or amend so a behaviour-changing commit carries its
`spec/behaviors/`, `spec/invariants.md` and `spec/traceability.md` edits, and treat the split as a
finding against the plan-decomposition step (a gap-closure plan that changes behaviour should not
defer its spec half to a downstream plan).

## Info

### IN-01: dangling JSDoc block attached to no declaration

**File:** `packages/vitest/src/Runner.ts:340-366`

**Issue:** A `/** … */` block opens at `:340`, closes at `:366`, and is followed by a blank line and
then a *second* `/** … */` at `:368` that attaches to `warningEmitOptions`. The first block therefore
documents nothing: TypeScript, the language server and every doc-generation tool associate a JSDoc
comment with the declaration that immediately follows it, and here that is another comment. The
shared rationale it carries — why both synthetic-node constants are untagged and unskipped, and why
one shared value per kind is safe — is invisible from either constant's hover, which is the exact
reader this repo's comment style targets.

**Fix:** Either demote it to a non-JSDoc section comment (`// ---- both synthetic-node option
constants ----` / `/* … */`), or fold its two load-bearing paragraphs into `warningEmitOptions`' and
`afterAllScenariosEmitOptions`' own doc comments with a cross-reference between them.

### IN-02: a whole `TestApi` is constructed to take one member, and the "ONLY reference" claim cites an unrunnable gate

**File:** `packages/vitest/src/describeFeature.ts:586`, `:589-590`

**Issue:** Two small things on adjacent lines.

`const contextFreeEffect = vitestTestApi(featureUri).effect` builds the default path's full adapter
object — `describe` included — and discards everything but `.effect`. The intent ("reuse the one
`makeDegradingEffect` implementation") is right and worth keeping; the expression reads as if the
whole adapter mattered.

The comment at `:589-590` says the shared closure is *"still the ONLY reference to `sharedIt.effect`
in this file (`pnpm verify:testapi-seam`-adjacent grep in the plan's own `<done>` counts it)"*. The
claim is true today (`grep -n sharedIt packages/vitest/src/describeFeature.ts` shows one code
reference, `:592`), but the cited enforcement lives in a `.planning/` plan document and is not
runnable in CI. `scripts/verify-testapi-seam.sh` does not scan this file at all — it scans only
`Runner.ts` and `TestApi.ts`, and only for framework imports.

**Fix:** Extract the shared factory so the reuse is explicit, and drop the enforcement claim or make
it real:

```ts
// Both adapters' `effect` comes from the same degrade-wrapper; the default path's IS the
// context-free route.
const contextFreeEffect = makeDegradingEffect(featureUri, (name, self, emitOptions) => {
  it.effect(name, self, emitOptions)
})
```
(with `vitestTestApi` rewritten in terms of it), and replace the parenthetical with a plain "one
reference, `:592`" note — or add the `sharedIt.effect` occurrence count to
`scripts/verify-testapi-seam.sh` so the sentence is backed by something `pnpm lint` runs.

### IN-03: the two module-scope `EmitOptions` constants share a runtime-mutable `tags` array process-wide

**File:** `packages/vitest/src/Runner.ts:376`, `:389`

**Issue:** `warningEmitOptions` and `afterAllScenariosEmitOptions` are single module-scope values
reused for every `⚠` and `⚙` node in every Feature in the process. `readonly` / `ReadonlyArray` are
erased at runtime, so `warningEmitOptions.tags` is one live `[]` shared by every warning node ever
emitted. The comment at `:362-365` argues this is safe, and today it is — `describeFeature.ts:476`
copies with `[...options.tags]` before the array reaches the framework, and `Runner.test.ts`'s fake
only reads. But the safety rests entirely on every current consumer's discipline, and `EmitOptions`
crosses a seam whose whole point is that the consumer is injected and swappable.

**Fix:** Low cost to make structural — `Object.freeze` the arrays, so an accidental mutation from any
future `TestApi` implementation throws in strict mode rather than corrupting every later node:

```ts
const warningEmitOptions: EmitOptions = { tags: Object.freeze([]), skip: false, contextFree: true }
const afterAllScenariosEmitOptions: EmitOptions = { tags: Object.freeze([]), skip: false, contextFree: false }
```

---

_Reviewed: 2026-08-30T13:56:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
