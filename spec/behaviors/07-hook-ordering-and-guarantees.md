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

             A hook excluded by its OWN tag expression
             ([BEH-EC-027](#beh-ec-027-tag-expression-scoped-hooks-compose-with-rulefeature-scoping-and-are-excluded-before-batch-assembly))
             is NOT a member of this batch at all — it is excluded BEFORE the
             batch is assembled, never invoked, and therefore never a source
             of a failure this requirement could combine or drop. A reader
             tempted to read "every hook of one kind due to run" as including
             a tag-filtered-out hook should not: that hook was never due to
             run for THIS Scenario in the first place, the same way a hook
             registered on a different Rule never was.
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

               AfterAllScenarios is NOT a test node. It is the Feature
               block's own teardown hook (the runner's afterAll), so a run
               narrowed with -t or --tagsFilter to a single Scenario of the
               Feature still runs it once, after that Scenario — test
               selection cannot skip it (F-06). A failing AfterAllScenarios
               reports as a failure of the Feature's block, not of a node.

               ONE CARVE-OUT applies to AfterAllScenarios, and only to the
               case where NO Scenario was attempted at all — every Scenario
               in the Feature skipped (@skip), removed by a registration
               filter (includeTags/excludeTags) or deselected by a CLI
               filter, or the Feature declaring no Scenarios in the first
               place. In that case the hook's body MUST do nothing:
               BeforeAllScenarios is reachable only from inside a Scenario's
               body, so it structurally CANNOT have run, and a teardown would
               release resources nothing ever set up. The decision is made
               AT RUN TIME, from whether any Scenario's body was invoked,
               because under a CLI filter it cannot be made at registration.
               This carves the VACUOUS case out of the guarantee; it does not
               weaken it. All three "regardless of" clauses above are
               unchanged, because what they are about is a FAILURE being
               unable to stop teardown — and a failing Scenario was still
               attempted, so it still tears down.

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

             That SAME outcome includes an interruption: BeforeAllScenarios is
             a once-cell whose first exit — success, failure, or the runner's
             per-test timeout interrupting it — is what every later Scenario
             awaits. It is NOT retried, because a retry would make a later
             Scenario's result depend on how far the first attempt got and
             could re-run half-applied side effects. Consequences stated so
             nobody discovers them the hard way (F-21): BeforeAllScenarios
             runs inside the FIRST attempted Scenario's timeout budget, so a
             slow setup needs a larger testTimeout; and a Scenario-level
             retry cannot turn a failed setup into a passing one.

             Concurrent sequencing is UNSUPPORTED: a Feature emitted under
             vitest's `sequence.concurrent: true`, or inside a consumer's
             `describe.concurrent`, may run two Scenarios' fibers into the
             once-cell together and the ordering guarantees in this file
             do not hold. The runner cannot detect that setting and does
             not try to; it is a documented precondition.

             BeforeAllScenarios and AfterAllScenarios see the SHARED tier and
             nothing else (F-10). They are typed HookRegistrar<RShared> —
             `RShared` being the `shared` field's output, and `never` on the
             plain-Layer form of describeFeature — so a once-per-Feature hook
             that reaches for a per-Scenario service is a compile error by
             name (effect(missingEffectContext)), and the runner provides no
             per-Scenario build to either hook. A hook that must seed state
             every Scenario reads puts that state in `shared`.
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

// `Log` lives in the SHARED tier: the two once-per-Feature hooks below see that tier and nothing
// else, so a Log in a plain (per-Scenario) Layer would be a compile error at `BeforeAllScenarios`.
describeFeature(
  feature,
  { shared: Log.layer, perScenario: Layer.empty },
  ({ After, AfterAllScenarios, Before, BeforeAllScenarios, Scenario }) => {
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
  }
)
```

---

## BEH-EC-027: Tag-expression-scoped hooks compose with Rule/Feature scoping, and are excluded before batch assembly

> **See:** [ADR-EC-035](../decisions/035-tag-expression-scoped-hooks-reuse-vitests-createtagsfilter.md), [ADR-EC-026](../decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md), [BEH-EC-017](#beh-ec-017-six-hooks-a-fixed-ordering-and-three-independent-guarantees)

```
REQUIREMENT: Before, After, BeforeStep and AfterStep each accept an
             ADDITIONAL, optional leading argument: a tag-expression string,
             parsed and evaluated by the SAME grammar and engine vitest's own
             --tagsFilter uses (and/or/not/&&/||/!/parens) — never a second,
             bespoke grammar. Before(fn) keeps working exactly as it does
             without this behavior; Before(tagExpr, fn) is the additive form.
             A hook registered with a tag expression runs for a Scenario ONLY
             IF that Scenario's own fully-flattened, inherited tags (Feature,
             Rule, Scenario and Examples tags all included, ADR-EC-026)
             satisfy the expression; a hook registered without one keeps
             running unconditionally for every Scenario its Rule/Feature
             scope already reaches.
```

```
REQUIREMENT: BeforeAllScenarios and AfterAllScenarios do NOT accept a tag
             expression — passing one is a compile error by arity, not a
             runtime rejection. No coherent single-Scenario tag set exists to
             check against a once-per-Feature hook (it runs once, shared
             across every Scenario, with no one Scenario's tags to consult at
             the point it actually fires), so no arbitrary semantic was
             invented for it. This is the SAME kind of restriction
             BeforeAllScenarios/AfterAllScenarios already have on a Rule's
             dsl (BEH-EC-017) — a compile-time absence, not a new mechanism.
```

```
REQUIREMENT: A tag-expression-scoped hook composes ADDITIVELY with the
             existing Rule/Feature scoping (BEH-EC-017/018) — the two filters
             are orthogonal and both apply. A Rule-scoped Before("@db", fn)
             narrows to that Rule's Scenarios (via Rule/Feature scoping,
             unchanged) AND further narrows to only the @db-tagged ones among
             them (via its own tag expression); neither filter widens or
             replaces the other.
```

```
REQUIREMENT: Every tag literal a hook's tag expression names must already be
             declared somewhere in that hook's own Feature — the SAME
             "declared tag universe" rule ADR-EC-026 already requires for
             describeFeature's own includeTags/excludeTags, extended here to
             a second call site, not a new rule. The universe is
             FEATURE-WIDE: a Rule-scoped hook's tag expression is validated
             against every tag anywhere in the whole Feature, not only tags
             declared within that Rule, because an expression like "@db and
             not @slow" needs @slow declared even for a Scenario that does
             not carry it. A tag literal absent from the Feature's own
             universe is a LOUD, located, registration-time throw — never a
             silent degradation — naming the offending hook's kind, its exact
             expression string and the .feature file.
```

```
REQUIREMENT: A hook excluded by its own tag expression for a given Scenario
             is excluded BEFORE that Scenario's hook batch is assembled — it
             is never invoked, contributes no exit, and is therefore never a
             batch member whose failure could be combined or dropped. The
             independent-batch/combined-failure guarantee BEH-EC-017 already
             states for a batch's SURVIVING members is unaffected by
             filtering: registration order among the entries that DO run is
             preserved, and their failures still combine exactly as an
             unfiltered batch's would.
```

### Worked example

```typescript
// The dsl shape matches Dsl.ts's real FeatureDsl<ROut>: Before/After/BeforeStep/AfterStep are
// TaggedHookRegistrar<ROut> — the existing one-arg form, plus this additive two-arg form.
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

// checkout.feature declares @db somewhere (ADR-EC-026/ADR-EC-035's "declared tag universe" rule),
// e.g. on the "Paying with a card that hits the database" Scenario below.
describeFeature(feature, Log.layer, ({ Before, Scenario }) => {
  // Runs for EVERY Scenario in this Feature — unconditional, today's only shape before ADR-EC-035.
  Before(function*() {
    yield* Ref.update((yield* Log).entries, (log) => [...log, "always"])
  })

  // Runs ONLY for a Scenario whose own tags include @db — the additive, tag-expression-scoped form.
  Before("@db", function*() {
    yield* Ref.update((yield* Log).entries, (log) => [...log, "db-scoped"])
  })

  Scenario("Paying with a saved card", ({ Then, When }) => {
    // No @db tag: only "always" ran ahead of this Scenario's steps.
    When("I pay with a saved card", function*() {/* ... */})
    Then("the order is confirmed", function*() {/* ... */})
  })
})
```

---

_Previous: [06 — DataTable and DocString arguments](./06-datatable-and-docstring-arguments.md)_
