# Spike: can `Rule` expose a narrower/different `RuleDsl<RNarrowed>` than the ambient `ROut`?

> A SPIKE feeding the still-open design decision on GitHub issue
> [#23](https://github.com/leaderiop/effect-cucumber/issues/23), which is itself downstream of the
> closed research ticket [#22](https://github.com/leaderiop/effect-cucumber/issues/22)
> (`research/effect-context-narrowing`). This is a cheap, rough, WORKING prototype meant to raise
> the fidelity of #23's design discussion — it is not a design proposal, not production code, and
> not a PR. Nothing here is wired into `packages/vitest/src/Dsl.ts` or the real runner; every type
> and function the fixtures declare is a local reconstruction for this experiment alone.

## Method

Read the real `packages/vitest/src/Dsl.ts` (`RuleRegistrar<ROut>`, `RuleDsl<ROut>`,
`ScenarioDsl<ROut>`), `packages/vitest/src/describeFeature.ts` and `packages/vitest/src/Collect.ts`
(how a Rule's `extraLayer` is actually merged via `Layer.provideMerge(ambientLayer)(extraLayer)`,
`Collect.ts:226`) before starting, plus #22's own research doc
(`research/effect-context-narrowing`, read via `git show
origin/research/effect-context-narrowing:research/effect-context-narrowing.md`), which had
already established two things empirically:

- No shadow/narrow primitive exists in `Context`/`Layer` for a nested scope to see a different
  shape under an already-provided Tag; the current single-parameter `RuleRegistrar<ROut>` is
  correctly, `strict: true`-soundly rejected if you try to hand it a narrower/unrelated callback.
- The raw `Effect.updateContext` primitive (`node_modules/effect/src/Effect.ts:12004`) IS
  type-sound and can retype `Effect<A,E,R>` to `Effect<A,E,R2>` for an unrelated `R2` — but
  reaching that from the DSL needs a genuinely new type parameter, `RuleRegistrar<ROut,
  RNarrowed = ROut>` or similar; #22 stopped there and left the exact shape to #23.

This spike picks up exactly there: derive a concrete signature, build a WORKING (not just
type-declared) prototype backed by `Effect.updateContext`, and actually run `tsc` against it under
this repo's real `strict: true` / `@effect/tsgo` gate (`node node_modules/typescript/bin/tsc`, the
same compiler `scripts/verify-tsgo-gate.sh` invokes — TypeScript 7.0.2, patched by `effect-tsgo
patch`, against `effect@4.0.0-rc.112`, matching `pnpm-workspace.yaml`'s pin). Also ran the positive
fixture with `tsx` to confirm the mechanism does real work at runtime, not only in the type
checker — the same two-pronged method #22 used.

## The fixtures

Two throwaway files under `packages/vitest/test/tsgo-gate/src/`, `spike-`-prefixed so they read as
obviously-not-production alongside the real gate fixtures in that directory, each with its own
throwaway `tsconfig.*.json` (**not** wired into `scripts/verify-tsgo-gate.sh` — per this spike's
own instructions, the real gate stays untouched; `bash scripts/verify-tsgo-gate.sh` still passes
all 13 of its own assertions unmodified, confirmed below):

- `spike-rule-narrowing-satisfied.ts` / `tsconfig.spike-rule-narrowing-ok.json` — MUST COMPILE
  CLEAN, and is also directly executable with `tsx` for the runtime proof.
- `spike-rule-narrowing-starved.ts` / `tsconfig.spike-rule-narrowing-missing.json` — MUST NOT
  COMPILE, containing two independent defects.

This mirrors the directory's own paired satisfied/starved convention (`rule-satisfied.ts` /
`rule-missing-service.ts`), including the comment noting the duplication across the pair is
deliberate — a shared helper module would need adding to every sibling `tsconfig.*.json`.

Both fixtures declare the same motivating case #23 itself frames: an audit tool whose Rules
produce either a **remediation report** or a **BOM export**, never both. Two disjoint extra
services (`RemediationService`, `BomService`), two disjoint **reshaped** worlds
(`RemediationWorld { report }`, `BomWorld { bom }` — renamed members and fresh `Context.Service`
Tags, not aliases), and a Feature-level ambient `FeatureService` that narrowing is meant to hide.

## 1. The signature — derived, not assumed

Two dead ends came first (recorded because the task asked dead ends not be hidden):

- **A same-shape `updateService`-style overload.** `Layer.updateService`'s real signature
  (`f: (a: A) => A`, quoted in #22's doc) structurally cannot express "return a *different*
  type" — the return type is pinned to the input type. Confirmed by inspection alone: no
  experiment needed, since the signature has no free type parameter to plug a different shape
  into. Ruled out before writing any code.
- **A bare `Context`-transform overload with no DSL-level backing** — i.e. just adding
  `narrow: (ctx: Context.Context<ROut | R2>) => Context.Context<RNarrowed>` as a fourth parameter
  and hoping the DSL registrars "just work" against the result. This does not compose: `RuleDsl`
  is a bundle of *registrar functions* (`Given`/`When`/`Then`/...), not a `Context` value — there
  is nothing for a bare context transform to attach to. It has to operate on the **dsl object**
  itself, wrapping each registrar, which is what made clear the real mechanism has to live one
  level up: a helper that maps `RuleDsl<Wide> -> RuleDsl<Narrow>`, not `Context<Wide> ->
  Context<Narrow>` in isolation.

The signature that actually works, added as a THIRD overload alongside the existing two
(`RuleRegistrar<ROut>`, verbatim from the real `Dsl.ts`, is otherwise unchanged — this is
additive, confirmed by the "CONTROL" cases in the positive fixture, which exercise the existing
two- and three-argument forms unmodified and still compile):

```ts
export interface RuleRegistrar<ROut> {
  (name: string, define: (dsl: RuleDsl<ROut>) => void): void
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: RuleDsl<ROut | R2>) => void): void
  <R2, E2, RNarrowed>(
    name: string,
    extraLayer: Layer.Layer<R2, E2, any>,
    narrow: (dsl: RuleDsl<ROut | R2>) => RuleDsl<RNarrowed>,
    define: (dsl: RuleDsl<RNarrowed>) => void
  ): void
}
```

This matches the shape #23 itself sketched almost exactly — the difference from the ticket's own
draft is cosmetic (`RuleDsl<ROut | R2>` on the `narrow` parameter is literally the SAME type the
existing three-argument overload already hands a Rule, not a new concept). `RNarrowed` is
genuinely free: TypeScript infers it from `narrow`'s *return* type, so it does not need to be a
subtype or supertype of `ROut | R2` — it can be, and in both fixtures IS, completely disjoint.

Critically, `narrow` is not a compiler hook or magic keyword — it is an ordinary value the caller
writes, almost always as `(dsl) => narrowRuleDsl(dsl, project)` (below). Nothing in the interface
itself lets a `RuleDsl<RNarrowed>` conjure itself into existence "for free"; producing a real one
is entirely the caller's job, backed by real code. That is what keeps the signature sound rather
than a laundering trick — see the runtime section.

## 2. The mechanism — `Effect.updateContext`, and which direction it actually runs

The one non-obvious piece, and worth stating precisely because it is easy to get backwards:
`Effect.updateContext`'s real signature is

```ts
<A, E, R, R2>(self: Effect<A, E, R>, f: (context: Context<R2>) => Context<NoInfer<R>>): Effect<A, E, R2>
```

`f` converts a context of the NEW type (`R2` — what will actually be available when the retyped
effect runs) into a context of the OLD type (`R` — what the untouched inner effect actually
needs). So to make a step body written against `RuleDsl<Narrow>` (an `Effect<A, E, Narrow |
Scope>`) runnable later against the REAL ambient environment (`Wide | Scope` — the Rule's actual
`Layer.provideMerge(featureLayer)(extraLayer)` result, exactly what `Collect.ts:226` already
builds), the retyping call is

```ts
Effect.updateContext(narrowTypedEffect, project)
// project: Context<Wide | Scope> -> Context<Narrow | Scope>
```

i.e. `project` is a genuine narrowing/projection function — given the REAL wide context, produce
the narrower one. This is the "PROJECT DOWN" direction, which reads naturally; the potential
confusion is only that `updateContext`'s OWN parameter is named/typed the other way round (`f`
consumes the context matching the effect's NEW public type and produces the context matching its
OLD internal type) — get this backwards and the types simply refuse to compose, which is a safe
failure mode, not a silent one.

The helper both fixtures declare:

```ts
const narrowRuleDsl = <Wide, Narrow>(
  dsl: RuleDsl<Wide>,
  project: (context: Context.Context<Wide | Scope.Scope>) => Context.Context<Narrow | Scope.Scope>
): RuleDsl<Narrow> => {
  const narrowStepRegistrar = (register: StepRegistrar<Wide>): StepRegistrar<Narrow> => (name, fn) =>
    register(name, () => Effect.updateContext(fn(), project))
  return { Given: narrowStepRegistrar(dsl.Given), When: narrowStepRegistrar(dsl.When), Then: narrowStepRegistrar(dsl.Then) }
}
```

`project` for the Remediation Rule reaches into the real wide context for `RemediationService`'s
live value and reshapes it into `RemediationWorld` (renamed member, new Tag) — genuine data
reshaping of a real service, not a fabricated stand-in:

```ts
const projectRemediation = (
  wide: Context.Context<FeatureService | RemediationService | Scope.Scope>
): Context.Context<RemediationWorld | Scope.Scope> => {
  const remediation = Context.get(wide, RemediationService)
  const scope = Context.get(wide, Scope.Scope)
  return Context.make(RemediationWorld, RemediationWorld.of({ report: remediation.remediate }))
    .pipe(Context.add(Scope.Scope, scope))
}
```

`Scope.Scope` is threaded through explicitly on both sides of `project`, preserving `Dsl.ts`'s own
noted invariant that "`Scope.Scope` appears only in a body's required context, never on the dsl or
Layer types" — narrowing does not disturb that.

## 3. Real compiler output

**Positive fixture** (`tsconfig.spike-rule-narrowing-ok.json`, `node node_modules/typescript/bin/tsc
-p ...`): **exit 0, zero diagnostics.** Everything compiles clean: both narrowed Rules
(Remediation seeing only `RemediationWorld`, Bom seeing only `BomWorld`), and the two CONTROL cases
exercising the existing two-/three-argument `Rule(...)` forms unchanged.

**Negative fixture** (`tsconfig.spike-rule-narrowing-missing.json`): **exit 1**, with the correct
diagnostic firing for BOTH defects, each naming exactly the leaked service:

```
spike-rule-narrowing-starved.ts(147,7): error TS377004: This Effect requires a service that is
missing from the expected Effect context: `BomWorld`. effect(missingEffectContext)

spike-rule-narrowing-starved.ts(156,7): error TS377004: This Effect requires a service that is
missing from the expected Effect context: `FeatureService`. effect(missingEffectContext)
```

- Defect 1 (line 147): a step inside the Remediation Rule's narrowed dsl reaches for `BomWorld` —
  a SIBLING Rule's narrowed world, never even declared as a Rule in this file. Rejected.
- Defect 2 (line 156): a step inside the same narrowed dsl reaches for `FeatureService` — the
  Feature-level AMBIENT service narrowing is supposed to hide. This is the case that actually
  matters for #23: it is exactly what the existing `RuleDsl<ROut | R2>` union CANNOT reject, since
  `|` only ever grows what a step may reach for. Rejected, by the same real diagnostic
  (`effect(missingEffectContext)`) the rest of this repo's gate already relies on by name.

One placement note worth recording for whoever wires this for real: when a step body is written
as `() => Effect.gen(function*() {...})` (an arrow returning an already-called `Effect.gen`,
rather than passing a bare generator function straight to the registrar the way the real `Dsl.ts`
fixtures do), the type-mismatch diagnostic is reported on the `Effect.gen(...)` line itself, not
on the registrar call site (`dsl.Given(...)`) the way `rule-satisfied.ts`'s own `@ts-expect-error`
comments are positioned. Chasing this down cost a re-run: an initial version of this fixture put
`@ts-expect-error` above the `dsl.Given(...)` line and got "Unused '@ts-expect-error' directive"
(TS2578) — moving it one level deeper, directly above `Effect.gen(...)`, was what actually caught
it. (The final fixtures here sidestep the question entirely by using the paired
satisfied/starved-file convention instead of inline `@ts-expect-error`, which doesn't need this at
all — but it is worth flagging for whoever writes the eventual real `rule-narrowing-ok.json` /
`-missing.json` fixtures for `Dsl.ts` itself, since those may want inline assertions the way
`rule-satisfied.ts` does.)

**Runtime proof** (`npx tsx packages/vitest/test/tsgo-gate/src/spike-rule-narrowing-satisfied.ts`,
every step run with `Effect.provide` against ONLY its Rule's real merged Layer — never a Layer for
`RemediationWorld`/`BomWorld` directly, since no such Layer exists anywhere in either fixture):

```
[Remediation] produces the remediation report -> "remediation-report"
[Bom] produces the bom export -> "bom-export"
[plain extra layer, no narrowing] sees both the ambient and its own extra service, union-style -> "remediation-report"
[no extra layer at all] sees only the ambient -> "AUDIT-42"
```

`"remediation-report"` and `"bom-export"` are the REAL values `RemediationService.layer` and
`BomService.layer` provide, reached only through `RemediationWorld`/`BomWorld`'s reshaped
`report`/`bom` members — proof `Effect.updateContext` is doing live reshaping of real data at run
time, not merely satisfying the type checker. Also confirmed `bash scripts/verify-tsgo-gate.sh`
still reports `tsgo gate: ENFORCED` with all 13 of its own assertions passing unmodified — this
spike touches nothing the real gate depends on.

## Recommendation

**Viable, with one caveat.**

The type signature works exactly as sketched, is additive (the existing two `RuleRegistrar`
overloads are untouched, confirmed by the CONTROL cases), rejects both the sibling-leak case and —
more importantly — the ambient-Feature-service-leak case that the CURRENT `RuleDsl<ROut | R2>`
union structurally cannot reject. And it isn't a type-only illusion: the retyping is backed by a
real `Effect.updateContext` call that reshapes REAL runtime values, confirmed by actually running
the positive fixture and getting the real service values back out through the narrowed Tags.

The caveat: **`narrow`'s `project` function is hand-written per Rule, by the Rule's author, with
real code that reaches into the wide context and reshapes it.** This spike's `narrowRuleDsl` helper
does the wrapping mechanically, but `project` itself is not free — for the motivating audit-tool
case, whoever declares a Rule that wants a narrower world has to write a real function that knows
how to build `RemediationWorld` (or `BomWorld`) out of what the wide context actually has. That is
a reasonable one-time cost for a library author exposing this as a combinator, but it means "give
me a narrower Rule" is never a single flag or an auto-derived subset the way `Context.pick` is for
a literal subset of an existing shape — it is closer to "give me a reshaping function," which is
strictly more powerful (the audit tool's real use case genuinely reshapes, not just subsets) but
also strictly more work per Rule than #22's negative result on `Context.pick`/`Layer.updateService`
might suggest at first glance. Whether that tradeoff is worth taking as a public DSL feature — one
`narrow` callback per narrowed Rule, versus accepting the current same-`ROut`-union-only shape — is
exactly the decision #23 is for, not something this spike can settle. This spike's only claim is
that the mechanism is real, sound under this repo's actual `strict: true` / `@effect/tsgo` gate,
and additive to the existing signature.

## Files

- `packages/vitest/test/tsgo-gate/src/spike-rule-narrowing-satisfied.ts` — positive fixture,
  also directly runnable with `tsx`.
- `packages/vitest/test/tsgo-gate/src/spike-rule-narrowing-starved.ts` — negative fixture, two
  independent defects.
- `packages/vitest/test/tsgo-gate/tsconfig.spike-rule-narrowing-ok.json` /
  `tsconfig.spike-rule-narrowing-missing.json` — their throwaway tsconfigs, NOT referenced by
  `scripts/verify-tsgo-gate.sh`.
