# 07 — Hook ordering and guarantees

What order the six hooks run in, which batches are independent, and which guarantees survive a
failure. [BEH-EC-006](./02-shared-layers-and-tags.md) already establishes that hooks are Effects and
that `After` always runs; this file is the normative source for the full six-hook shape — `Before`,
`After`, `BeforeStep`, `AfterStep`, `BeforeAllScenarios`, `AfterAllScenarios` — that BEH-EC-006's
worked example predates.

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-017: Six hooks, a fixed ordering, and three independent guarantees

> **Invariant:** [INV-EC-004](../invariants.md#inv-ec-004-after-hooks-run-even-when-a-step-fails)
> **See:** [ADR-EC-004](../decisions/004-one-it-effect-per-scenario.md), [ADR-EC-005](../decisions/005-effect-fn-for-step-and-hook-bodies.md)

```
REQUIREMENT: A Feature's hooks run in the following order, for every Scenario
             it contains:

               BeforeAllScenarios (once per Feature)
                 -> per Scenario:
                      Before
                      -> per step (Background steps included):
                           BeforeStep -> step body -> AfterStep
                      -> After
                 -> AfterAllScenarios (once per Feature, after every Scenario)

             Background steps are wrapped by the per-step BeforeStep/AfterStep
             pair IDENTICALLY to the Scenario's own steps — there is no
             origin-based partitioning. Background steps are already the
             leading steps of a Scenario's step list (ADR-EC-004), so this
             ordering falls out of iterating that list, not from a case split.
```

```
REQUIREMENT: A Feature MAY register more than one hook of a given kind. Two or
             more hooks of the same kind run in REGISTRATION ORDER — the order
             the test author wrote the calls in, never sorted, never
             reordered.
```

```
REQUIREMENT: The hooks in one BATCH — every hook of one kind due to run at one
             point (every registered Before hook ahead of one Scenario's
             steps, every registered After hook after them, and so on for
             every other kind) — are INDEPENDENT of one another. A failing
             hook does NOT stop the rest of its own batch from running, and
             every failure from the batch is combined into the ONE reported
             failure — never first-wins, never silently dropped.

             This is a DELIBERATE, SCOPED departure from
             [INV-EC-001](../invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept)'s
             fail-fast rule. It applies to the batch ONLY: fail-fast still
             governs everything outside a hook batch — a Scenario's own steps
             still stop at the first failing step, and a failing Before batch
             still prevents the steps that follow it (see below). Nothing
             about this requirement widens fail-fast's scope; it narrows one
             exception into it, at exactly the hook-batch boundary.
```

```
REQUIREMENT: A Scenario's own steps run ONLY IF every hook in that Scenario's
             Before batch succeeded. A Before batch that combines two or more
             failures per the requirement above still gates the steps exactly
             once — the steps do not run partially, and do not run because
             some Before hooks in the batch happened to succeed.
```

```
REQUIREMENT: After, AfterStep and AfterAllScenarios each run WHETHER the thing
             they guard succeeded or failed:

               After runs whether the Scenario's own steps (Before batch
               included) succeeded or failed.

               AfterStep's guarantee spans the WHOLE per-step unit — the
               paired BeforeStep hooks AND the step body — so AfterStep still
               runs when the BeforeStep batch that precedes its step failed
               and the step body itself never ran.

               AfterAllScenarios runs once, after every Scenario in the
               Feature has been ATTEMPTED, regardless of whether
               BeforeAllScenarios succeeded, whether any Scenario's hooks or
               steps failed, or whether any earlier After/AfterStep hook
               failed.

               ONE CARVE-OUT applies to AfterAllScenarios, and only to the
               case where NO Scenario was attempted at all — every Scenario
               in the Feature skipped (@skip) or removed by a registration
               filter (includeTags/excludeTags), or the Feature declaring no
               Scenarios in the first place. In that case the node MUST NOT
               be emitted: BeforeAllScenarios is reachable only from inside
               a Scenario's body, so it structurally CANNOT have run, and an
               AfterAllScenarios node would tear down resources nothing ever
               set up. This carves the VACUOUS case out of the guarantee; it
               does not weaken it. All three "regardless of" clauses above
               are unchanged, because what they are about is a FAILURE being
               unable to stop teardown — and a failing Scenario was still
               attempted, so it still emits the node.

             A guaranteed hook that itself fails does NOT mask or replace the
             failure it was guarding — both reach the reported failure,
             combined, exactly as the independent-batch requirement above
             already requires within one batch.
```

```
REQUIREMENT: BeforeAllScenarios runs AT MOST ONCE per Feature, shared across
             every Scenario in that Feature — never once per Scenario. If
             BeforeAllScenarios fails, that SAME failure is reported by EVERY
             Scenario in the Feature individually, not by a single
             Feature-level failure with zero Scenario results.
```

```
REQUIREMENT: Hooks are registered through a dsl object ONLY — the same object
             Given/When/Then/Background/Scenario are registered through
             (DSL-04's prohibition on a module-level registry applies
             identically to hooks). A hook registered on the FEATURE dsl
             applies to every Scenario in that Feature, Rule-nested Scenarios
             included. A Rule's own dsl additionally accepts Before, After,
             BeforeStep and AfterStep, which narrow to that Rule's Scenarios
             and compose with the Feature's own — see
             [BEH-EC-018](./03-rules-outlines-and-testclock.md) for that
             composition order, which this file does not restate.
             BeforeAllScenarios and AfterAllScenarios stay Feature-only and
             are a compile error on a Rule's dsl.
```

```
REQUIREMENT: Every hook body — Before, After, BeforeStep and AfterStep
             included — receives NO ARGUMENTS. BeforeStep/AfterStep do NOT
             receive the step they bracket; there is no step-text parameter
             and no step-result parameter on any hook kind
             (ADR-EC-005's Negative consequence).
```

### Worked example

```typescript
// Pre-implementation reference at the time this file was written — see spec/roadmap.md for
// current build status. The dsl shape matches Dsl.ts's real FeatureDsl<ROut>: hooks are members
// of the object describeFeature hands `define`, never free-standing exports (DSL-04).
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { Context, Effect, Layer, Ref } from "effect"

class Log extends Context.Service<Log, { readonly entries: Ref.Ref<ReadonlyArray<string>> }>()("Log") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return Log.of({ entries: yield* Ref.make<ReadonlyArray<string>>([]) })
    })
  )
}

const feature = await loadFeature("./checkout.feature")

describeFeature(feature, Log.layer, ({ After, AfterAllScenarios, Before, BeforeAllScenarios, Scenario }) => {
  // Runs once for the whole Feature, ahead of every Scenario's own Before.
  BeforeAllScenarios(function*() {
    yield* Ref.update((yield* Log).entries, (log) => [...log, "beforeAll"])
  })

  // Gates this Scenario's steps: if this fails, no step below runs, but After still does.
  Before(function*() {
    yield* Ref.update((yield* Log).entries, (log) => [...log, "before"])
  })

  // Guaranteed regardless of whether this Scenario's steps succeeded or failed.
  After(function*() {
    yield* Ref.update((yield* Log).entries, (log) => [...log, "after"])
  })

  // Runs once, after every Scenario in the Feature, even if BeforeAllScenarios or a Scenario failed.
  AfterAllScenarios(function*() {
    yield* Ref.update((yield* Log).entries, (log) => [...log, "afterAll"])
  })

  Scenario("Adding an item", ({ Then, When }) => {
    When("I add an item", function*() {
      yield* Ref.update((yield* Log).entries, (log) => [...log, "when"])
    })

    Then("the cart has 1 item", function*() {
      // ...assertion against Log's accumulated entries
    })
  })
})
```

---

_Previous: [06 — DataTable and DocString arguments](./06-datatable-and-docstring-arguments.md)_
