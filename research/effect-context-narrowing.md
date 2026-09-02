# Research: does Effect v4's `Context`/`Layer` let a nested scope NARROW or REPLACE an ambient service's shape?

> Resolves GitHub issue [#22](https://github.com/leaderiop/effect-cucumber/issues/22), feeding the
> downstream design-decision ticket [#23](https://github.com/leaderiop/effect-cucumber/issues/23)
> (blocked on this one).
>
> This is pure type-system/runtime research, primary sources only — **not** a design proposal for
> `#23`. It answers "what does Effect v4 actually allow today," nothing about what this repo's DSL
> should do about it.

## Method

Installed the actual pinned package in a throwaway scratch directory outside this repo
(`/tmp/effect-v4-research`, not committed — same approach as the sibling doc below), read the
installed `.ts` source directly (the package ships hand-authored `.ts` as its real source, not
`.d.ts` generated from elsewhere), then wrote real `.ts` files exercising each claim and
type-checked them with `tsc --noEmit` (TypeScript 7.0.2, matching this repo's
`tsconfig.base.json` `strict: true`) against the installed types. Two files were also executed
with `tsx` for runtime confirmation. This repo's own real `packages/vitest/src/Dsl.ts` was read
directly (not `dist/Dsl.d.ts`, which does not exist in this repo — nothing has ever been built;
`packages/vitest/dist/` is empty).

Version checked: `effect@4.0.0-rc.112` (`rc` dist-tag, `npm view effect dist-tags` — matches
`pnpm-workspace.yaml`'s `catalog.effect` pin exactly, and matches the sibling research doc's
finding on `research/effect-vitest-v4-api`).

---

## 1. Does `effect/Context`/`effect/Layer` expose a real "narrow this Tag to a different shape for a nested scope" primitive?

**No.** Read the entire real `Context.ts` (2009 lines) and searched it for `shadow`/`override`/
`narrow` (`node_modules/effect/src/Context.ts`, all hits below are the literal grep results — no
symbol named `shadow`, `override`, or `narrow` exists as an exported function):

- `override` appears only in doc-comment prose, always about `Context.Reference`'s *default
  value* being overridden by a same-shape value (`Context.ts:1968`, `:1987`) — see §3 below.
- `narrow` appears only in one unrelated doc comment about `Predicate` (`Context.ts:776`).
- No `shadow` identifier exists anywhere in the file.

What the file *does* export, relevant to "does a nested scope see something different for an
already-present key":

- **`Context.merge`** (`Context.ts:1745-1820`): "When both contexts contain the same service key,
  the service from `that` overrides the service from `self`." — but this only *replaces the
  runtime VALUE* behind a key; the key's declared `Shape` type parameter cannot change, because
  the value returned is still typed by whichever `Key<Identifier, Shape>` was used to `add`/`get`
  it (see §2 — `Shape` is fixed per `Key`, not per merge operation).
- **`Context.pick`** (`Context.ts:1904-1913`) and **`Context.omit`** (`Context.ts:1946-1954`):
  real, exported functions that return a NEW `Context` containing only (`pick`) or excluding
  (`omit`) specific keys. Their types:
  ```ts
  export const pick = <S extends ReadonlyArray<Key<any, any>>>(...services: S) =>
    <Services>(self: Context<Services>): Context<Services & Service.Identifier<S[number]>> => ...
  export const omit = <S extends ReadonlyArray<Key<any, any>>>(...keys: S) =>
    <Services>(self: Context<Services>): Context<Exclude<Services, Service.Identifier<S[number]>>> => ...
  ```
  `omit`'s return type genuinely narrows the `Services` union type parameter via `Exclude<...>` —
  this is a REAL, type-checked way to make the R-channel SMALLER. But it operates on an already-
  built `Context<Services>` VALUE (a runtime container an author has explicit code to construct
  and thread through), not as a `Layer`-level or DSL-level combinator a nested scope gets for
  free. There is no `Layer.pick`/`Layer.omit` exported from `Layer.ts` (confirmed by grep below).
- **`Context.Reference`** (`Context.ts:1956-2009`): a key with a lazily-computed default, whose
  value CAN be overridden per-scope — but its `Shape` type parameter is a single fixed generic
  (`Reference<Service>`), so "override" here means "supply a different VALUE of the SAME type,"
  never a different shape. This is the real, documented Clock/TestClock/ConfigProvider mechanism
  (`Context.ts:1979-1994`'s own worked example is exactly a logger being swapped for another
  same-shape logger).

`Layer.ts` (grepped for the same terms, `Layer.ts` full file): no `shadow`, no `narrow`, and
`override` appears only inside the SAME `provideMerge` doc-comment prose describing `Context`
semantics, not a distinct Layer primitive. `Layer.ts` has no `pick`/`omit` exports at all:

```
$ grep -n "^export const" Layer.ts | grep -iE "context|pick|omit|update|shadow"
1129:export const succeedContext = ...
1155:export const empty: Layer<never> = succeedContext(Context.empty())
1306:export const syncContext = ...
1479:export const effectContext = ...
3720:export const updateService: ...
```

`Layer.updateService` (`Layer.ts:3720-3739`) is the closest thing to a "narrow" combinator on
`Layer` itself, and it is explicitly SAME-SHAPE only:

```ts
export const updateService: {
  <I, A>(service: Context.Key<I, A>, f: (a: Types.NoInfer<A>) => A):
    <A1, E1, R1>(layer: Layer<A1, E1, R1>) => Layer<A1, E1, I | R1>
  ...
} = ...
```

`f: (a: A) => A` — takes an `A`, returns an `A`. There is no way to plug in a function returning a
DIFFERENT type here; the signature does not admit it.

**Verdict:** No "shadow"/"override"/"narrow" primitive exists in `effect/Context` or
`effect/Layer` for making a nested scope see a DIFFERENT SHAPE under an already-present Tag.
`Context.merge`/`Layer.provideMerge` replace VALUES for a shared key (§4). `Context.pick`/`omit`
narrow the TYPE-LEVEL union of which keys are present, but only as a value-level transform an
author must call explicitly on a `Context`, and `Layer.ts` doesn't expose an equivalent.

---

## 2. Is "a callback receiving `RuleDsl<R3>` for an R3 unrelated to (not a supertype of) the Feature's `ROut`" type-sound today, given `Dsl.ts`'s actual single-parameter shapes?

Read `packages/vitest/src/Dsl.ts` directly (`packages/vitest/dist/Dsl.d.ts` does not exist — the
package has never been built in this checkout). The real shapes:

```ts
// packages/vitest/src/Dsl.ts:78-84
export interface RuleRegistrar<ROut> {
  (name: string, define: (dsl: RuleDsl<ROut>) => void): void
  <R2, E2>(name: string, extraLayer: Layer.Layer<R2, E2, any>, define: (dsl: RuleDsl<ROut | R2>) => void): void
}
```

`R2` is inferred FROM `extraLayer`'s own type parameter, and the callback always receives
`RuleDsl<ROut | R2>` — a plain TypeScript union, which is a supertype of (or equal to) `ROut` by
construction. There is no way, using this exact single-parameter interface, to make the union
SMALLER or swap it for an unrelated type — `|` only ever grows a union.

**Two separate empirical checks**, both against the real `Dsl.ts` shapes, `strict: true`
(matching `tsconfig.base.json`, which sets `strictFunctionTypes` via `strict`):

**(a) Does call-signature bivariance let a narrower/unrelated callback sneak through anyway?**
Interface call signatures (as opposed to arrow-typed properties) are sometimes checked leniently
in TypeScript. Reconstructed `RuleRegistrar`/`RuleDsl` structurally identical to the real
`Dsl.ts`, declared a disjoint `NarrowWorld` service (no shared members with the ambient
`FeatureService`), and tried passing a `(dsl: RuleDsl<NarrowWorld>) => void` callback where
`(dsl: RuleDsl<FeatureService>) => void` is expected:

```
error TS2345: Argument of type '(dsl: RuleDsl<NarrowWorld>) => void' is not assignable to
parameter of type '(dsl: RuleDsl<FeatureService>) => void'.
  Types of parameters 'dsl' and 'dsl' are incompatible.
    Type 'RuleDsl<FeatureService>' is not assignable to type 'RuleDsl<NarrowWorld>'.
      Type 'NarrowWorld' is missing the following properties from type 'FeatureService':
      [FeatureService], feature
```

Rejected, correctly and unambiguously — no bivariance loophole. `strict: true` in
`tsconfig.base.json` (`compilerOptions.strict`, which this repo already has on) is exactly what
closes this; a project without `strictFunctionTypes` might behave differently, but this repo's
own config does not have that exposure.

**(b) Is the underlying primitive Effect's raw types actually offer for this — is it sound at
the `Effect`/`Context` level, separate from `Dsl.ts`'s current shape?** Yes.
`Effect.updateContext` (`node_modules/effect/src/Effect.ts:12004-12094`) has this real signature:

```ts
export const updateContext: {
  <A, E, R, R2>(
    self: Effect<A, E, R>,
    f: (context: Context.Context<R2>) => Context.Context<NoInfer<R>>
  ): Effect<A, E, R2>
} = internal.updateContext
```

`R2` is a FREE type parameter, constrained only by needing to supply `f`, a function able to
*construct* (not necessarily derive from) a `Context<R>`. Wrote and type-checked (zero errors)
AND ran with `tsx` (exit 0, printed the expected line):

```ts
class Config extends Context.Service<Config, { readonly name: string }>()("Config") {}
class NarrowWorld extends Context.Service<NarrowWorld, { readonly widget: () => number }>()("NarrowWorld") {}

const original: Effect.Effect<string, never, Config> = Effect.gen(function* () {
  const config = yield* Config
  return `Hello ${config.name}!`
})

// R goes from Config to NarrowWorld — genuinely unrelated types, no subtype relation either way.
const retyped: Effect.Effect<string, never, NarrowWorld> = original.pipe(
  Effect.updateContext((_ctx: Context.Context<NarrowWorld>) => Context.make(Config, { name: "World" }))
)
```

So the RAW machinery Effect ships absolutely supports "this effect now requires an unrelated
`R2`" — it is a real, `strict`-mode-sound TypeScript pattern using Effect's own `Context`/`Effect`
types, no hack. But it operates on already-BUILT `Effect` VALUES (you call it once you have the
effect in hand), not as something a DSL registrar hands a callback for free.

**Would this need a new type parameter on `RuleRegistrar`/`Rule`?** Yes. Given (a) — the current
single-parameter `RuleRegistrar<ROut>` genuinely, correctly rejects a narrower/unrelated callback
type, not merely by convention but because `strict: true` makes TypeScript check it structurally —
the only way to let a `Rule`'s callback see `RuleDsl<R3>` for an `R3` unrelated to `ROut` is a
distinct type parameter threaded through explicitly, e.g. something shaped like
`RuleRegistrar<ROut, RNarrowed = ROut>` reusing (b)'s `Effect.updateContext`-style machinery
underneath to actually construct the narrower `Context` at runtime. Reusing the existing single
`ROut` parameter cannot express it — this is a design question for `#23`, not answered further
here.

---

## 3. Prior art in the Effect ecosystem for "a nested scope intentionally hiding/replacing part of what an outer scope provides" (vs. the common "nested scope adds more")

Searched `effect/Context`'s own doc comments (already read in full for §1), the official Effect
docs site, and the `Effect-TS/effect` GitHub repo (issues and PRs) for `narrow`, `shadow`,
`override`, `Context.omit`/`Context.pick` usage discussions, and "hide service" framing.

**Found, genuinely relevant:**

- **`Context.Reference`'s documented "override the default value"** (`Context.ts:1966-1994`,
  quoted in §1) is the one place Effect's own doc comments use the word "override" as a named,
  intentional pattern — but it is same-Tag/same-Shape value substitution (Clock/TestClock's real
  mechanism), not shape-narrowing. This is the closest thing to official prior art for "nested
  scope replaces what an outer scope provides," and it is scoped narrowly to `Reference`-style
  keys with a lazy default.
- **This repo's own history is real-world prior art for the SAME-SHAPE case going wrong.**
  `spec/decisions/018-shared-layer-testclock-isolation.md` note 10 (added in commit `4a29b9e`,
  `docs: warn against re-providing TestClock.layer() on top of the ambient one`) documents a
  field-reported bug where a step's own `Effect.provide(TestClock.layer())`, nested under this
  library's own ambient per-Scenario `TestClock`, shadowed it — and under real concurrent
  dispatch + `Effect.timeout`, the nested (shadowing) clock lost races to the real clock, causing
  an indefinite hang. This is exactly "a nested scope replacing what an outer scope provides for
  the same Tag" in practice — undocumented as an *intentional* pattern anywhere, encountered here
  as an unintentional footgun.
- **PR `Effect-TS/effect#6828`, "Use layered storage for Context"** (merged, `4.0` milestone):
  a performance refactor that stores `Context` entries as bounded copy-on-write overlays so
  `Context.add` is O(1). It confirms, at the implementation level, that `Context` storage is
  fundamentally an overlay-by-key mechanism (a newer write for the same key shadows an older one)
  — reinforcing §4's finding about HOW shadowing works internally, but it is not prior art for
  shape-NARROWING; it does not touch `Context.pick`/`omit`/`Reference` semantics.

**Found, nothing:** no GitHub issue or PR in `Effect-TS/effect` (searched via `gh search issues`/
`gh search prs` for `Context.omit`, `narrow context service`, `narrowing requirement`, `hide
service`, `shadow service`) discussing a Tag-shape-narrowing feature request or design, and no
blog post or other Effect-based library surfaced in general web search proposing this pattern by
name. This is a genuine negative result, not an oversight — the ecosystem's documented and
discussed patterns for scoped services are overwhelmingly "add more" (`Layer.provide`/
`provideMerge`, this repo's own `extraLayer` design in ADR-EC-010) or "swap the value behind an
existing Reference" (Clock/TestClock/ConfigProvider), never "narrow or replace the declared shape
of an existing Tag for a sub-scope."

---

## 4. What does `Layer.provideMerge` actually do today when a Rule's `extraLayer` and the Feature's Layer provide DIFFERENT implementations for the SAME `Context.Tag`?

Read the real implementation (not just the doc comment) at `Layer.ts:2797-2804`:

```ts
} = dual(2, (
  self: Layer<any, any, any>,
  that: Layer<any, any, any> | ReadonlyArray<Layer<any, any, any>>
) =>
  provideWith(
    self,
    that,
    (self, that) => Context.merge(that, self)
  ))
```

and its real type signature at `Layer.ts:2703`:

```ts
<RIn2, E2, ROut2, RIn, E, ROut>(self: Layer<ROut2, E2, RIn2>, that: Layer<ROut, E, RIn>):
  Layer<ROut | ROut2, E | E2, RIn | Exclude<RIn2, ROut>>
```

Combined with `Context.merge`'s own documented and implemented semantics ("the service from
`that` overrides the service from `self`" — `Context.ts:1721`, `1755`, `1791`, implementation at
`Context.ts:1816-1820`), and `dual`'s curried convention (`Layer.provideMerge(dependency)(self)`
calls the body with `(self, dependency)` in that argument order): for
`someLayer.pipe(Layer.provideMerge(depLayer))`, the runtime body computes
`Context.merge(depLayer's context, someLayer's context)` — so `someLayer` (the piped-in, "local"
side) wins over `depLayer` (the argument passed to `provideMerge`) for any shared key.

**This repo's own real composition uses exactly this call shape**, confirmed by reading
`packages/vitest/src/Collect.ts` directly:

```ts
// packages/vitest/src/Collect.ts:171
scenarioLayers.set(scenarioKey(ruleId, name), Layer.provideMerge(ambientLayer)(extraLayer))
// packages/vitest/src/Collect.ts:226
const ruleAmbientLayer = extraLayer === null ? featureLayer : Layer.provideMerge(featureLayer)(extraLayer)
```

i.e. `extraLayer` is the piped-in ("local") side and `ambientLayer`/`featureLayer` is the
argument — so per the mechanism above, **`extraLayer`'s own registration wins over the ambient
Feature Layer's for any Tag both provide.**

**Empirically verified** by installing `effect@4.0.0-rc.112` and reproducing this repo's exact
call shape at runtime (`tsx`, not just `tsc`):

```ts
class Greeter extends Context.Service<Greeter, { readonly greet: () => string }>()("Greeter") {}
const ambientLayer = Layer.succeed(Greeter, { greet: () => "ambient" })
const extraLayer = Layer.succeed(Greeter, { greet: () => "extra" })

const composed = Layer.provideMerge(ambientLayer)(extraLayer)   // this repo's real call shape
// Effect.provide(composed) then yield* Greeter, then .greet() => "extra"
```

Output:

```
Layer.provideMerge(ambientLayer)(extraLayer) -> Greeter.greet() = "extra"
RESULT: extraLayer WINS (shadows ambient)
Layer.provideMerge(extraLayer)(ambientLayer) -> Greeter.greet() = "ambient"
```

(the reverse call order was also tested, confirming it's genuinely the piped/"local" argument
that wins, not `extraLayer` specifically by some other rule — argument order is what decides it.)

**Verdict:** Yes — "shadowing" for a Tag whose `Shape` is the SAME on both sides is fully possible
today, already exercised by this repo's real Rule/Scenario composition, and now directly confirmed
against the actual installed `effect@4.0.0-rc.112` runtime. What is NOT possible (per §1/§2) is
the DIFFERENT case: a Tag whose declared SERVICE SHAPE needs to differ between the outer and inner
scope. `Context.merge`/`Layer.provideMerge` operate per-key by Tag identity; the value type behind
a key is fixed by whichever `Key<Identifier, Shape>` reads it, so "shadowing" here can only ever
substitute a same-shape value, never change what shape the key resolves to.

---

## Summary

| # | Question | Answer |
|---|----------|--------|
| 1 | Real "shadow"/"override"/"narrow" primitive in `Context`/`Layer` for a DIFFERENT shape under an existing Tag? | **No.** `Context.merge`/`Layer.provideMerge` only replace same-shape values (§4). `Context.pick`/`omit` narrow which Tags are present (real, type-checked), but only as an explicit value-level transform on a built `Context`, with no `Layer`-level or DSL-level equivalent exposed. `Context.Reference`'s "override" is same-shape only. |
| 2 | Is "callback sees `RuleDsl<R3>` for unrelated `R3`" type-sound under `Dsl.ts`'s current single-parameter shape? | **Not as currently defined** — empirically rejected (`TS2345`) under `strict: true`, no bivariance loophole. **The underlying `Effect.updateContext` primitive DOES support arbitrary R-to-R2 retyping**, type-checked and run successfully — so the pattern is sound at the raw Effect level, but reaching it from the DSL would need a genuinely new type parameter (e.g. `RuleRegistrar<ROut, RNarrowed = ROut>`), not a reuse of the single existing `ROut`. |
| 3 | Ecosystem prior art for "nested scope hides/replaces," vs. "adds more"? | Real but narrow: `Context.Reference`'s documented default-value override (same-shape), and this repo's own `ADR-EC-018` note 10 (`TestClock` re-provide footgun, commit `4a29b9e`) as a lived same-shape-shadowing incident. No prior art found (search of `Effect-TS/effect` issues/PRs and general web) for shape-NARROWING as an intentional, named pattern anywhere in the ecosystem — a genuine negative result. |
| 4 | Does `Layer.provideMerge` already let a Rule's `extraLayer` shadow the Feature Layer for a shared same-shape Tag? | **Yes, confirmed against real source and empirically at runtime.** This repo's actual `Layer.provideMerge(ambientLayer)(extraLayer)` calls (`Collect.ts:171,226`) mean `extraLayer` wins over the ambient Feature Layer for any Tag both provide — "shadowing," not narrowing, is already live in this codebase today for the same-shape case. |

No blocker was found that rules out narrowing outright — `Effect.updateContext` proves the raw
mechanism is real and type-sound — but there is no existing `Context`/`Layer` combinator that
does it for free, and reaching it from `Dsl.ts`'s DSL surface is a genuinely new type-parameter
design, not a reuse of anything that exists today. That design question belongs to `#23`.
