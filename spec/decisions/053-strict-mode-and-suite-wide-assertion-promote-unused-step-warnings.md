# ADR-EC-053: An opt-in `strict` Feature option and a suite-wide `assertNoUnusedStepDefinitions` promote unused-step warnings to failures — ADR-EC-019's own default untouched

> **Status:** Accepted
> **Date:** 2026-09-06
> **Context:** revisits the policy question ADR-EC-019 explicitly left open

## Context

[ADR-EC-019](019-fail-loudly-on-unmatched-or-ambiguous-steps.md) made a registered pattern that
matches zero steps across the whole Feature a **Feature-level warning, not a hard failure**, and
said so with an explicit escape hatch in its own Negative consequences:

> The "unused pattern" case being a warning rather than a hard failure is a
> policy choice that could be revisited if it proves too noisy or too
> permissive in practice.

That warning — `UnusedStepDefinitionWarning`, the owning behavior [BEH-EC-013](../behaviors/01-steps-and-world.md#beh-ec-013-fail-loudly-on-an-unmatched-unused-or-ambiguous-step)
— today reaches a consumer on three channels, none of them able to fail a run: a `console.warn` in
`describeFeature.ts`, an always-passing reporter test node `Runner.ts`'s `emitFeature` emits
(`api.effect(warningTitle(warning), () => Effect.void, warningEmitOptions)`), and the collected
`FeaturePlan.warnings` array a consumer could inspect but nothing forces them to. This ADR **is**
the revisit ADR-EC-019 anticipated — for a project whose stated value proposition is "no drift goes
unnoticed," some consumers legitimately want an unused step definition — genuinely dead code, most
often a stale definition left behind after a `.feature` file was trimmed — to fail CI rather than
sit in log output nobody reads. Other consumers, mid-refactor or incrementally authoring a large
suite, want the exact opposite: the current non-fatal warning, undisturbed.

## Decision

**Two independent, additive mechanisms**, neither one replacing or gating the other, both reusing
`Plan.ts`'s already-computed `FeaturePlan.warnings` — no new collection pass, no new warning data:

**1. `DescribeFeatureOptions.strict?: boolean`** (`describeFeature.ts`), normalised to a required
`strict: boolean` at `emitFeature`'s internal layer (`Runner.ts`) via `options?.strict === true`.
`false`/absent is the exact ADR-EC-019 default, byte-for-byte — the warning node still emits, still
`contextFree`, still titled identically; only its BODY changes:

```ts
// Runner.ts, inside emitFeature's trailing warning loop
for (const warning of plan.warnings) {
  api.effect(
    warningTitle(warning),
    strict
      ? () => Effect.fail(new UnusedStepDefinitionFailure({ message: warning.message }))
      : () => Effect.void,
    warningEmitOptions
  )
}
```

`strict` is decided and applied ENTIRELY inside `Runner.ts`'s own closure — it never crosses the
`TestApi` seam as data the way `retry`/`timeout`/`skip` do, because turning a warning into a failure
is a choice about which `Effect` this module hands `api.effect`, not about how the framework runs
it; `TestApi.ts`/`VitestTestApi.ts`/`EmitOptions` are untouched.

**Why not `Effect.fail(new Error(warning.message))` or `Effect.fail(warning)` directly:**
`UnusedStepDefinitionWarning` is a plain interface, not an `Error` subclass, and vitest's default
reporter (`BaseReporter.printErrorInner`) only nicely renders a failure carrying `.name`/`.message`
— the identical problem `StepFailureLocation`/`HookFailureLocation` (`Errors.ts`, ADR-EC-033,
ADR-EC-052) already solved for a step/hook's own location. A bare `new Error(...)` would satisfy the
reporter but is exactly what this project's own build-gating `@effect/tsgo` diagnostic
(`globalErrorInEffectFailure`, ADR-EC-016, `ignoreEffectErrorsInTscExitCode: false`) flags as an
untagged error in the Effect failure channel. The fix mirrors this codebase's own established
convention for that exact conflict (`packages/gherkin/test/DataTable.test.ts`'s `UnexpectedOutcome`):
a small, private `Data.TaggedError`, `UnusedStepDefinitionFailure`, local to `Runner.ts` and never
exported — it is STILL a genuine `Error` subclass (`Data.TaggedError` extends `Data.Error` extends
`YieldableError` extends `globalThis.Error`; `.name` becomes the tag, `.message` the field), so the
reporter renders it exactly as the task's original design intended, while the plugin recognizes it
as tagged. This is not inconsistent with `ScenarioEffect.ts`'s own `Effect.fail(planned.error)`:
that call works unwrapped because `StepMatchError` already IS a real `Error`-shaped
`Schema.TaggedError`, whereas `UnusedStepDefinitionWarning` never was one.

**2. `assertNoUnusedStepDefinitions` (new file `StrictMode.ts`)**, a suite-wide function a consumer
calls ONCE, across every `collectFeature()` result in their suite:

```ts
export const assertNoUnusedStepDefinitions = (
  collections: ReadonlyArray<FeatureCollection>
): void => {
  const messages = collections.flatMap((collection) => collection.plan.warnings.map((warning) => warning.message))
  if (messages.length === 0) return
  throw new Error(
    `${messages.length} unused step definition(s) found across ${collections.length} collected Feature(s):\n\n`
      + messages.join("\n\n")
  )
}
```

This one DOES use a bare `new Error(...)`, deliberately: it runs entirely outside any `Effect`
value — a plain synchronous `throw`, most naturally called from an ordinary `it`/assertion or a
`globalSetup`, never inside an `Effect.gen`/`Effect.fail` — so `globalErrorInEffectFailure` has
nothing to flag; there is no Effect failure channel here to lose type safety in.

**Why both a per-Feature flag AND a suite-wide helper, rather than one mechanism doing double
duty:** the two solve different problems and neither can express the other's. `strict` can fail
THIS Feature's own run immediately, inside the SAME `vitest run` a reader is already watching, with
the warning attributed to its own reporter node — but it cannot express "gate my whole suite,"
because a consumer would have to remember to set it on every `describeFeature` call, and a Feature
with zero declared steps to forget it on is invisible by construction. A suite-wide helper can
express exactly that gate in one call, over every Feature at once — but it cannot fail an
individual Feature's own run inline, because `collectFeature` (which it consumes) never runs
anything; running the check requires a SEPARATE assertion point the consumer places deliberately
(a dedicated verification test, a `globalSetup`). Neither shape subsumes the other, so instead of
inventing a hidden mutable global config that would try to unify them, both are shipped as
independent, additive options: a Feature may use either, both, or neither, and using one never
disables or reshapes the other's own behavior.

**`collectFeature`/`FeatureCollection` are promoted to the public barrel (`index.ts`), as a real,
deliberate decision, not a side effect of this ADR.** `assertNoUnusedStepDefinitions`'s entire
design assumes a consumer calls `collectFeature()` themselves, once per Feature, and hands the
resulting array to the helper — that consumer-facing contract cannot exist while `collectFeature`
remains reachable only by relative import from inside this package's own test suite (as it was
before this ADR, used only by `describeFeature.test.ts`). Exporting it makes the suite-wide half of
this design usable outside this repository for the first time; `describeFeature` itself is
unaffected; and existing internal test usage against the relative path continues to work unchanged
(the class this promotes is unchanged, only where it exports from).

### Why only `UnusedStepDefinitionWarning` gets this treatment

`Errors.ts` documents FIVE non-fatal warning/notice types: `UnusedStepDefinitionWarning`,
`UndeclaredTagWarning`, `UnknownContainerWarning`, `ExcludedScenariosNotice`, and
`StaleRerunManifestKeyWarning`. This ADR deliberately builds NOTHING generic across all five — no
`WarningPolicy` type, no per-warning-kind `strict` map, no unified "promote any warning to a
failure" mechanism — and that omission is considered and rejected here, not a gap left for a later
ADR to fill.

The reason is structural, not a matter of taste: only `UnusedStepDefinitionWarning` has an
EMISSION-CHANNEL SHAPE a "promote to failure" mechanism can hook into. `Runner.ts`'s `emitFeature`
gives it a dedicated reporter test node — one `api.effect(warningTitle(warning), ...)` call per
warning, a real vitest node with a real body whose Effect this ADR's `strict` flag can swap. The
other four warning/notice types have no equivalent node anywhere in the emission walk: they reach a
consumer ONLY via `console.warn` inside `describeFeature.ts` (`UndeclaredTagWarning`,
`UnknownContainerWarning`, `ExcludedScenariosNotice`, `StaleRerunManifestKeyWarning` are all printed
this way, some from `describeFeature.ts` directly, `UndeclaredTagWarning` from an adapter-level
catch in `VitestTestApi.ts`). There is no node to flip the body of, because there is no node — a
"strict" flag for `UndeclaredTagWarning`, say, would have nowhere to attach a failure except
inventing a brand-new reporter node that does not exist today for an unrelated reason, which is a
materially different, much larger change than this ADR's scope, and not one any consumer has asked
for. Building a generic mechanism now, ahead of that need, would mean designing an abstraction with
exactly one real instantiation — the textbook shape of speculative generality this codebase's own
`AGENTS.md` conventions counsel against.

The suite-wide `assertNoUnusedStepDefinitions` helper is similarly scoped to this one warning kind
by name, not by a generic "assert no warnings of kind X" parameterization, for the same reason: the
other four warning types are not carried on `FeaturePlan.warnings` at all (`UndeclaredTagWarning`
and `UnknownContainerWarning` live on `FeatureCollection.containerWarnings`/adapter-level state,
`ExcludedScenariosNotice`/`StaleRerunManifestKeyWarning` are runtime-computed inside
`describeFeature.ts`'s own emission call, never collected onto the plan at all) — so a generic
suite-wide assertion would need a materially different data source per warning kind, again with no
shared shape to actually be generic over.

## Consequences

**Positive**:

- Answers ADR-EC-019's own open question directly, for the one case it explicitly flagged as
  revisitable, without touching anything else that ADR decided (unmatched/ambiguous steps remain
  hard failures unconditionally, exactly as before).
- Additive and source-compatible: `DescribeFeatureOptions.strict` is a new optional field, every
  existing `describeFeature`/`collectFeature`/`emitFeature` call site compiles unchanged except
  where `emitFeature`'s own (already-internal, non-exported) argument object needed the new
  required `strict: boolean` field threaded through — confirmed via `pnpm typecheck:test` across
  every call site in this repository's own test suite.
- Two independent knobs that compose rather than one that tries to do both jobs: a Feature can
  reach for `strict` mid-authoring on the one Feature they are actively hardening, and reach for
  `assertNoUnusedStepDefinitions` separately once the whole suite should be held to that bar — using
  one never silently changes what the other does.
- `collectFeature`/`FeatureCollection`'s promotion to the public barrel is documented here as
  intentional, giving a future reader a place to find out WHY they became public rather than
  discovering it as an unexplained diff against `index.ts`'s own header comment.

**Negative**:

- A private `Data.TaggedError` (`UnusedStepDefinitionFailure`) is a new, small piece of machinery
  purely to satisfy `@effect/tsgo`'s own lint diagnostic — a reader unfamiliar with ADR-EC-016 might
  wonder why the warning isn't simply thrown as a plain `Error`; this ADR and the inline comment
  beside the class exist so that reader has an answer without archaeology.
- `strict` and `assertNoUnusedStepDefinitions` are two places a consumer must remember exist, rather
  than one — accepted deliberately (see "why both" above) rather than forcing an artificial single
  mechanism onto two genuinely different problems.
- Explicitly NOT extended to the other four warning/notice types in `Errors.ts` (see above) — a
  consumer who wants `UndeclaredTagWarning` or `StaleRerunManifestKeyWarning` promoted to a failure
  has no mechanism for that today. Recorded here as a real, considered scope boundary, not an
  oversight, so a future ADR revisiting THAT question inherits this ADR's own reasoning about why it
  wasn't done here.

**Trade-off accepted**: building one dedicated, testable mechanism for the ONE warning kind that
already has an emission-channel shape to promote, rather than a generic mechanism spanning five
kinds with no shared shape — the generic version would have cost more to design correctly and would
have had, today, exactly one real caller.
