# ADR-EC-031: Per-Scenario `Random` seeding wraps the composed Scenario Effect with `Random.withSeed`, not a `Layer` joining `testEnv`

> **Status:** Accepted
> **Date:** 2026-09-03
> **Context:** resolves [wayfinder ticket #29](https://github.com/leaderiop/effect-cucumber/issues/29), part of
> [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11)

## Context

`spec/roadmap.md` § Planned locked the goal before this ADR was written: every Scenario gets a
deterministic-but-unique seed automatically, derived from a stable hash of the Scenario's title plus
the Outline row index when one exists, "added to `testEnv`'s `Layer.mergeAll` in `VitestTestApi.ts`
alongside `TestConsole.layer`/`TestClock.layer()`, ambient with zero consumer wiring, the same
treatment those two already get."

**That composition mechanism does not exist for `Random.withSeed`, and the roadmap bullet's own
framing needs correcting rather than followed literally.** Read directly out of the installed
`effect@4.0.0-rc.112` (`node_modules/effect/src/Random.ts`):

```ts
export const withSeed: {
  (seed: string | number): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(self: Effect.Effect<A, E, R>, seed: string | number): Effect.Effect<A, E, R>
} = dual(2, (self, seed) => Effect.provideService(self, Random, ISAAC_CSPRNG(seed)))
```

`Random.withSeed` is a combinator over an already-built `Effect<A, E, R>`, not a `Layer` — it is
`Effect.provideService` under the hood, keyed on `Random` (a `Context.Reference`, read through a
FiberRef, the same mechanism `TestClock`/`TestConsole` use). There is no `Random.layer(seed)` this
rc ships to join `Layer.mergeAll(TestConsole.layer, TestClock.layer())` the way the roadmap bullet
pictured; the seed a `Layer` could carry would in any case be a single, fixed value, while this
requirement's whole point is a DIFFERENT seed per Scenario — which a static `Layer.mergeAll` call in
`VitestTestApi.ts` cannot express at all, since that module never sees a Scenario's title.

The real per-Scenario title (and, for an Outline row, its own disambiguating suffix) is not visible in
`VitestTestApi.ts` either — it is computed in `Runner.ts`'s `emitFeature`, by `titleFor`
(`OutlineTitle.ts`'s `buildScenarioTitles`), which is also exactly where `buildScenarioEffect`
(`ScenarioEffect.ts`) is called to build each Scenario's composed Effect. That is the one place both
halves of the seed — WHICH Scenario, and the Effect to seed — are already in scope together.

## Decision

`Runner.ts` composes the seed at the SAME point it already builds each Scenario's Effect, wrapping the
result of `buildScenarioEffect` with `Random.withSeed`:

```ts
const buildSeededScenarioEffect = (
  scenarioPlan: ScenarioPlan,
  effectiveLayer: ErasedExtraLayer,
  hookSet: HookSet
): Effect.Effect<void, unknown, Scope.Scope> =>
  Random.withSeed(
    buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks: hookSet }),
    scenarioSeed(plan.feature.uri, titleFor(scenarioPlan))
  )
```

`scenarioSeed` (`packages/vitest/src/ScenarioSeed.ts`, a leaf module beside `ScenarioKey.ts`) is:

```ts
export const scenarioSeed = (featureUri: string, emittedTitle: string): string => `${featureUri}\0${emittedTitle}`
```

The Feature's own `uri` and the Scenario's fully emitted title, joined by a NUL byte — the same
separator `ScenarioKey.ts` uses for its own composite key, and for the same reason: neither a real
filesystem uri nor a Scenario title can plausibly contain one, ruling out the concatenation collision
a printable separator could not.

**"A stable hash of the Scenario's title" is satisfied without a separate hashing step.**
`Random.withSeed`'s own implementation already seeds `ISAAC_CSPRNG` — a real cryptographically-flavored
PRNG, not a checksum — directly from the `string | number` it is given; hashing the title again before
handing it to `withSeed` would be redundant work producing an equally-arbitrary-looking seed input.
Handing `withSeed` the concatenated `(uri, title)` string itself IS the "stable hash" the roadmap bullet
asked for — ISAAC's own seeding is exactly that hash function, and it is already applied once
`Random.withSeed` runs.

**"Plus the Outline row index when one exists, so rows never collide" is satisfied by the EMITTED
title, not a separately-threaded row index.** `titleFor` — `OutlineTitle.ts`'s `buildScenarioTitles`,
already the single source of the title `Runner.ts` hands the test framework — already appends
`(col=value, ...)` for an Outline row (BEH-EC-010, D-03) and a trailing `#2`/`#3` for a byte-identical
duplicate title (the same function's own de-duplication). Passing THAT string to `scenarioSeed` gets
row disambiguation, and even byte-identical-title disambiguation the roadmap bullet did not ask for,
for free — no second "row index" parameter needs threading through `Plan.ts`/`ScenarioEffect.ts`
alongside it, and there is exactly one place (`Runner.ts`) that ever needs to know the seed exists.

**Composition order: OUTSIDE `buildScenarioEffect`'s own `Effect.provide(args.layer)`, matching the
existing ambient-default-then-consumer-override shape `testEnv` already has.** `ScenarioEffect.ts`'s
own pipe applies `Effect.provide(args.layer)` as its LAST (outermost) step before returning, so the
Effect `buildSeededScenarioEffect` wraps already has the per-Scenario Layer folded in.
`Random.withSeed`'s `Effect.provideService` then wraps OUTSIDE that. Since `Effect.provide`/
`Effect.provideService` resolve a service by which provide is CLOSEST to the point that reads it, a
consumer's own Layer that happens to provide its own `Random` implementation (a property-based-test
seed a step wants full control over, say) still wins for any step inside it — this plugin's seed is
the ambient DEFAULT, exactly the relationship `testEnv`'s `TestClock`/`TestConsole` already have to a
step's own Layer (`packages/vitest/README.md`'s existing "Both Layer scopes are real" paragraph). No
change to `ScenarioEffect.ts` was needed or made: it remains, as its own header states, free of any
knowledge that a seeding mechanism exists — the wrap happens one level up, in `Runner.ts`, the same
place ADR-EC-018 note 3 already put the shared-path's per-Scenario `TestEnv` provide for the identical
reason.

## Does this collide with `TestClock`'s existing per-Scenario isolation (ADR-EC-018)?

No, and the two guarantees are independent by construction. ADR-EC-018 protects `TestClock`/
`TestConsole` isolation — that one Scenario's `TestClock.adjust` or logged output is never observable
by another — which is a property of `testEnv`, a `Layer` rebuilt (on the plain path) or re-provided (on
the shared path) fresh per Scenario. This decision's `Random.withSeed` wrap touches only the `Random`
service, is applied once per Scenario's composed Effect exactly like `testEnv` already is, and reads
NOTHING from `TestClock`/`TestConsole` nor writes anything either reads. The two are two independent
FiberRef-scoped overrides layered around the same per-Scenario Effect, not two halves of one
mechanism — the shared path's ADR-EC-018 subtlety (an explicit re-provide needed because the
`shared`-Layer route disables `@effect/vitest`'s own automatic per-test `TestEnv`) has no analogue
here, because `Random.withSeed` is applied by `Runner.ts` itself on BOTH paths uniformly, never routed
through the framework's own automatic test-service wiring at all.

## Consequences

**Positive**:

- Every Scenario's `Random` is deterministic and reproducible across runs with zero consumer wiring —
  a step that reaches for `Random.next`/`Random.nextIntBetween`/`Random.shuffle`/etc. gets the same
  sequence on every run, the same way `TestClock`'s simulated time already is.
- Two Outline rows — the exact case the roadmap bullet named — provably draw different sequences,
  because their emitted titles differ (BEH-EC-023's acceptance pair proves this against the real
  runner, not a synthetic value).
- A consumer's own Layer can still override `Random` for a Scenario that genuinely needs to (a
  property-based test wanting `fast-check`'s own generator, say) — the ambient seed is a default, not
  a lock-in.

**Negative**:

- The roadmap bullet's `Layer.mergeAll` framing was wrong for the real API shape, and this ADR
  corrects it rather than the code being forced to fit it — stated plainly per this repository's own
  "say only what is true" convention (`AGENTS.md` §4) rather than silently building something that
  contradicts the roadmap bullet without saying so.
- `scenarioSeed`'s NUL-byte-joined `(uri, title)` string is itself part of the observable contract now:
  a Scenario's random sequence changes if its TITLE changes (a rename) or if the `.feature` file's
  PATH changes (a move) — both are the same kind of instability `ScenarioKey.ts`'s own composite key
  already accepts for a different concern, stated as a real property rather than hidden.

**Trade-off accepted**: correctness over literal adherence to the roadmap bullet's `Layer.mergeAll`
sketch — the sketch could not have known `Random.withSeed`'s real, non-`Layer` shape before this ADR
verified it against the installed dependency, and building around the sketch anyway (forcing a
`Layer`-shaped wrapper around a combinator that isn't one) would have cost real complexity for no
benefit over composing it where the seed's two real inputs already meet.
