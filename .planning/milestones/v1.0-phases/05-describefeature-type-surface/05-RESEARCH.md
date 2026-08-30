# Phase 5: `describeFeature` Type Surface - Research

**Researched:** 2026-08-29
**Domain:** TypeScript type-level API design for an Effect v4 DSL, plus `@effect/tsgo` compile-gate fixture engineering
**Confidence:** HIGH — every load-bearing claim below was reproduced by running the repo's own `effect-tsgo`-patched compiler (`typescript@7.0.2` + `@effect/tsgo@0.38.0` + `effect@4.0.0-rc.112`) against throwaway fixtures under `packages/vitest/test/_probe/`, which has since been deleted. `git status` is clean.

## Summary

The roadmap self-assessed this phase as "skip research — exact type signatures are documented; risk is disciplined execution." That assessment is **wrong in three specific, load-bearing ways**, and each one would have silently produced a phase that looks complete and enforces nothing. Empirical probing found:

1. **`@ts-expect-error` does NOT suppress `@effect/tsgo` diagnostics.** Success criterion 1 is worded as "a `@ts-expect-error`-based negative type-test file, checked under `tsc --noEmit` in CI." Written naively, that file exits **1**, not 0 — because `TS377004 effect(missingEffectContext)` survives the directive while the plain `TS2345` is consumed by it. A second, stacked directive (`// @effect-diagnostics-next-line missingEffectContext:off`) is required, or the fixture must use the exit-code pattern instead.

2. **`spec/behaviors/01`'s literal BEH-EC-003 signature is vacuous.** It writes the generator branch as `Generator<any, A, any>`. A step requiring an unprovided `Db` against a `World`-only Layer **compiles clean** under it — exit 0. This is Pitfall 4 realized inside the spec's own signature block, and it is the exact trap the phase exists to avoid.

3. **`spec/behaviors/01`'s literal BEH-EC-002 signature erases `shared`.** `{ shared: Layer.Layer<any, any, never>; perScenario: Layer.Layer<R, E, never> }` gives the DSL `R = perScenario`'s output only. A `shared: Database.layer` — ADR-EC-006's own motivating example — is **not reachable from any step**. Verified: the union-argument form rejects a step using the shared service.

Two further findings determine whether the phase's named diagnostics fire at all. **Union member order and overload order are load-bearing**, in *opposite* directions: the step-function union must list the **generator branch first** for `effect(missingEffectContext)` to fire, and `describeFeature`'s overloads must list the **plain-Layer form last** for `effect(missingLayerContext)` to fire and for the error to name the real problem. Get either backwards and you keep a rejection but lose the named Effect diagnostic — meaning ADR-EC-016's gate silently stops covering this phase's fixtures while every test still passes.

**Primary recommendation:** Ship the exact `dsl2`/`dsl3` shape reproduced in Code Examples below — generator-branch-first step union, `Effect.gen.Return` alias, `ROut | Scope.Scope` at the step-registrar boundary, two `describeFeature` overloads with the plain-Layer form last — and build the DSL-01 proof as **two** fixtures: an exit-code fixture (Phase 1's proven pattern, asserts the named diagnostic) plus, optionally, a stacked-directive `@ts-expect-error` fixture. Correct BEH-EC-002 and BEH-EC-003 in the same phase; they are currently wrong in ways that would make the implementation wrong if copied.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Type-test file organization**
- **D-01:** Phase 5's DSL-01 negative-compile proof extends the existing `packages/vitest/test/tsgo-gate/` directory (built in Phase 1 to prove ADR-EC-016's generic tsgo gate) rather than a new, separate location — new fixture file(s) + new isolated `tsconfig.*.json` variant(s), following the exact pattern already established by `satisfied.ts`/`tsconfig.ok.json` and `missing-layer-context.ts`/`tsconfig.json`: one file per case, `include: []` + `files: [single-file]`, `composite: false`, excluded from `tsc -b` and from the root `tsconfig.json` references array. New fixtures test `describeFeature`'s own DSL surface (a step needing a service the Layer argument doesn't provide), not a bare `Layer.merge` misuse like the existing fixtures.
- **D-02:** The positive case (success criterion 2 — a step using `Effect.acquireRelease`, which puts `Scope` in `ROut`, must still compile against a plain Layer) lives in the same `tsgo-gate/` directory alongside the new negative fixture — one more `tsconfig.*.json` + one more `src/*.ts` file, same pattern as the existing positive control.
- **CI wiring:** `scripts/verify-tsgo-gate.sh` gets new assertions for the new fixtures (or a sibling script following its exact assertion style — positive control compiles clean, negative fixture fails with the specific named diagnostic) — implementation detail for the planner/executor, not re-litigated here.

**shared/perScenario Layer legality**
- **D-03:** `describeFeature`'s object-form Layer argument (`{ shared, perScenario }`, per ADR-EC-006) requires `perScenario` even when a Feature has no per-Scenario-fresh state — callers write `perScenario: Layer.empty` rather than omitting the key. One uniform object shape; no "was this key supplied" branching in the type or the DSL internals.
- **D-04:** `shared` and `perScenario` MAY name the same service. `perScenario` wins for a step that depends on it — this is not special-case code, it falls out of using `Layer.provideMerge(perScenario, shared)`'s (or equivalent) normal last-write-wins semantics as-is.

**Step failure trace richness**
- **D-05:** DSL-02's `Effect.fn(stepText)` auto-wrap carries only the bare step text into the span for this phase — matches the roadmap's literal wording ("the step text is observable in a failure's span/trace"). Do NOT add span attributes for the step's resolved `{int}`/`{string}` argument values in this phase; that's a separate, later decision if wanted, not smuggled into DSL-02's scope here.

### Claude's Discretion
- The exact type-level mechanism for deriving `FeatureDsl<R>` from the `layer: Layer<R,E,never> | { shared, perScenario }` union argument (a single conditional/distributive type vs. two function overloads) — affects inference quality and error-message readability, not observable behavior. Choose whichever produces the clearest `tsc` error on the negative fixture.
- Where exactly `Scope.Scope` enters the type (on the per-step function type, on `FeatureDsl`, or both) — `.planning/research/PITFALLS.md` Pitfall 4/5 flag this as the highest-risk decision; get it right by testing against the D-01/D-02 fixtures directly, not by asking the user to pick.
- The exact generator type used internally (hand-rolled `Generator<Effect<any,E,R>,A,any>` vs. `Effect.gen.Return`/`Effect.fn.Return`) — pure implementation detail.
- File/script naming for the new tsgo-gate fixtures and the CI script extension (D-01's "implementation detail" note above).

### Deferred Ideas (OUT OF SCOPE)
- Span attributes carrying a step's resolved `{int}`/`{string}` argument values (richer failure traces) — explicitly deferred from D-05; revisit as its own decision if wanted later, not in Phase 5's DSL-02 scope.
- "Shared within a Rule but not the whole Feature" as a third Layer scope — already ruled out by ADR-EC-006, not re-opened here.

**Research resolution of the two discretion items:** both were resolvable empirically, and are resolved below with reproduced evidence — see *Decision Resolutions*. The planner should treat them as settled, not re-open them.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DSL-01** | `describeFeature` takes a Layer (or `{ shared, perScenario }`); a step whose Effect requires a service the Layer doesn't provide fails to compile (ADR-EC-003), backed by `@effect/tsgo`'s `missingLayerContext`/`missingEffectContext` diagnostics failing the build (ADR-EC-016) | Finding 1 (which diagnostic actually fires — `missingEffectContext`, not `missingLayerContext`), Finding 2 (union order gates whether it fires), Finding 3 (`@ts-expect-error` does not suppress it), Finding 6 (overload order gates `missingLayerContext`), Finding 9 (mutation flip verified). Code Examples §1, §2, §5. |
| **DSL-02** | A step is `(...params) => Effect<A, E, R>`; `Given`/`When`/`Then`/`And`/`But` accept a bare generator function, auto-wrapped with `Effect.fn(stepText)` internally (ADR-EC-001, ADR-EC-005) | Finding 4 (spec's literal generator type is vacuous — must be `Effect.gen.Return<A,E,ROut\|Scope>`), Finding 7 (`Effect.fn(pattern)(fn)` type-checks on the accepted union with no cast), Pitfall 4 (runtime discrimination of generator vs. already-wrapped). Code Examples §1, §4. |
| **DSL-03** | `World` is a typed `Context.Service`; a field is unreachable by a step unless it appears in World's declared type (ADR-EC-002) | Finding 10 (`Context.Service<Self, Shape>()("Key")` compiles under v4 and this repo's strict flags; missing-field access is a plain `TS2339`, **not** an Effect diagnostic — the gate assertion must not grep for `effect(...)` here). Code Examples §3. |
| **DSL-04** | `Background`/`Scenario` are step-definition containers — `Background` receives `{ Given, And }`, `Scenario` receives `{ Given, When, Then, And, But }` (ADR-EC-017) | Finding 11 (both container shapes verified compiling, including nested `Scenario` re-shadowing `Given`); per-instance Registry is a **runtime** unit test, not a type test — see Validation Architecture. Code Examples §1. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `describeFeature` type signature + overload resolution | Type surface (`packages/vitest/src`) | — | Pure type-level; no runtime behavior in this phase |
| `Given`/`When`/`Then`/`And`/`But` registrar types | Type surface | — | The `ROut \| Scope.Scope` boundary is the single point where INV-EC-003 is mechanically enforced |
| `Effect.fn(stepText)` auto-wrap | Runtime registration (`packages/vitest/src`) | Type surface | Types must accept both forms; runtime must discriminate to avoid double-wrapping spans |
| `World` as `Context.Service` | Consumer code (test author's file) | Type surface (fixtures only) | The library ships no `World` — it ships the *constraint* that a World-shaped service is what steps read. Fixtures declare their own. |
| Per-instance scope stack (`Registry`) | Runtime (`packages/vitest/src`) | — | Module-singleton avoidance; verified by a runtime unit test, not `tsc` |
| Compile-gate fixtures + assertions | Build tooling (`test/tsgo-gate/`, `scripts/`) | CI (`.github/workflows/check.yml`) | Exit code, not output text, is the only honest signal (established by Phase 1) |
| Spec corrections (BEH-EC-002, BEH-EC-003) | `spec/` | — | AGENTS.md §1: a code change not reflected in `spec/` in the same commit is incomplete |

## Project Constraints (from AGENTS.md)

There is no `./CLAUDE.md`; `AGENTS.md` is this repo's equivalent and is normative. Directives the planner must honor:

| # | Directive | Source | Impact on Phase 5 |
|---|-----------|--------|-------------------|
| C1 | `spec/` is normative. Changing public behavior means updating the relevant behavior doc, invariant, and the traceability matrix **in the same change**. | AGENTS.md §1 | Findings 4 and 5 require correcting BEH-EC-002/BEH-EC-003 — this is **in scope and mandatory**, not optional cleanup. Also INV-EC-003's wording (Pitfall 6). |
| C2 | ` ```typescript ` fences are runnable examples that must import what they use; ` ```ts ` fences are signature listings, not compiled. | AGENTS.md §2 | The corrected BEH-EC-002/003 signature blocks stay ` ```ts `. The worked examples stay ` ```typescript ` and must still be valid against the new signature. |
| C3 | Submodule namespace imports: `import * as Context from "effect/Context"`, etc. | AGENTS.md §3 | Every new `src/` and fixture file. Also enforced by the tsgo plugin's `namespaceImportPackages` setting in `tsconfig.base.json`. |
| C4 | **Say only what is true.** Don't write a behavior as if enforced when the mechanism doesn't exist. | AGENTS.md §4 | After Phase 5, BEH-EC-002/003's "Pre-implementation" banner in `spec/behaviors/01` must be updated — `@effect-cucumber/vitest` will exist. |
| C5 | Tests use `@effect/vitest`: `it.effect`, `it.layer`, `TestClock`. Every behavior in `spec/behaviors/` gets tests. | AGENTS.md §5 | DSL-04's per-instance-Registry proof is a runtime test in `packages/vitest/test/`. |
| C6 | IDs are permanent, contiguous, never renumbered or reused. Withdrawn items keep their number. | AGENTS.md §6 | If a spec correction warrants a new ADR, allocate the next free number (ADR-EC-026); do not amend by renumbering. |

## Decision Resolutions

Both `Claude's Discretion` items were resolvable by direct experiment. Resolved:

| Discretion item | Resolution | Evidence |
|-----------------|-----------|----------|
| Conditional/distributive type **vs.** two overloads for `FeatureDsl<R>` | **Two overloads**, with the **plain-Layer overload declared LAST**. | The union-argument form (BEH-EC-002 literal) fails outright — it cannot thread `shared`'s output into the dsl (Finding 5). Overloads work and produce the correct `FeatureDsl<RShared \| RScenario>`. Overload *order* then determines error quality and whether `effect(missingLayerContext)` fires (Finding 6). |
| Where `Scope.Scope` enters the type | **On the step registrar's function-parameter type only** — `ROut \| Scope.Scope` inside `StepRegistrar<ROut>`. **Not** on `FeatureDsl`, not on the `Layer` argument. | `FeatureDsl<ROut>` stays clean (`ROut` is exactly the Layer's output, which is what the user reasons about). Verified: `Effect.acquireRelease` steps compile against a plain `Layer<World>` while an unprovided `Db` is still rejected (Finding 8). Putting `Scope` on `FeatureDsl` would leak `Scope` into the user-visible type parameter for no benefit. |

## Standard Stack

No new packages. Everything Phase 5 needs is already installed and declared.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `effect` | `4.0.0-rc.112` (installed, verified) | `Effect`, `Layer`, `Context`, `Scope`, `Effect.gen.Return`, `Effect.fn` | Already a peer + dev dependency of `packages/vitest`; catalog-pinned. [VERIFIED: `packages/vitest/node_modules/effect/package.json`] |
| `typescript` | `7.0.2` (installed, verified) | `tsc --noEmit` gate | Patched by `effect-tsgo patch` via the root `prepare` script. [VERIFIED: `node_modules/typescript/package.json`] |
| `@effect/tsgo` | `0.38.0` (installed, verified) | `missingLayerContext` / `missingEffectContext` / `floatingEffect` diagnostics | ADR-EC-016. Registers as plugin name `@effect/language-service`. [VERIFIED: `node_modules/@effect/tsgo/package.json`] |
| `@effect-cucumber/gherkin` | `workspace:^` | `ParsedFeature`'s **types** only | Project reference already wired in `packages/vitest/tsconfig.json`. [VERIFIED: read the file] |
| `@effect/vitest` | `4.0.0-rc.112` | Runtime tests for DSL-04's per-instance Registry | Already a peer + dev dependency. Not needed for the type surface itself. |

**Installation:** none required. `packages/vitest/package.json` needs **no manifest change** for this phase. [VERIFIED: read the manifest — `effect`, `@effect/vitest`, `vitest` are already peer+dev; `@effect-cucumber/gherkin` is already a dependency]

### Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** Every dependency it uses is already present in the lockfile and was verified on disk by direct `package.json` read, not by registry lookup. `slopcheck` was not run because there is nothing to check.

## Findings

Each finding below has a reproduction. All were run with `node node_modules/typescript/bin/tsc -p <isolated tsconfig>` from the repo root, so the `@effect/language-service` plugin from `tsconfig.base.json` was active exactly as it is in CI.

---

### Finding 1 — The DSL-01 negative case fires `missingEffectContext`, **not** `missingLayerContext` [VERIFIED: reproduced]

The existing `scripts/verify-tsgo-gate.sh` assertion 4 greps for `effect(missingLayerContext)`. That is correct for Phase 1's fixture (a mis-annotated `Layer.merge`). It is **wrong** for Phase 5's fixture.

A step whose Effect requires an unprovided service produces:

```
error TS377004: This Effect requires a service that is missing from the expected
Effect context: `Db`. effect(missingEffectContext)
```

`missingLayerContext` (`TS377034`) fires on the *Layer argument* — when the Layer passed to `describeFeature` has an unsatisfied `RIn` (Finding 6), not when a step's `R` exceeds the Layer's `ROut`.

**Consequence for the planner:** the two new gate assertions must grep for **different** diagnostic names. Copying assertion 4 verbatim and only swapping the config path produces an assertion that fails for the wrong reason and would be "fixed" by weakening the grep.

| Fixture | Failure mode | Diagnostic to assert |
|---------|-------------|---------------------|
| Step needs an unprovided service | `TS2345` + `TS377004` | `effect(missingEffectContext)` |
| Layer argument has unsatisfied `RIn` | `TS2769` + `TS377034` | `effect(missingLayerContext)` |
| World field not in declared type | `TS2339` only | **none** — assert exit ≠ 0 and grep `TS2339`, do not grep `effect(` |

---

### Finding 2 — Union member ORDER decides whether the Effect diagnostic fires at all [VERIFIED: reproduced, 4 permutations]

`Given` must accept both a bare generator (ADR-EC-005) and an already-`Effect.fn`-wrapped function, so its parameter is a union of two function types. Which branch is listed first changes the outcome:

| Step-parameter shape | Rejects unprovided service? | `effect(missingEffectContext)` fires? | Error readable? |
|---|---|---|---|
| `((...p) => Effect<A,E,R\|Scope>) \| ((...p) => Generator<...>)` — **fn first** | ✅ | ❌ **no** | ❌ "Generator is missing toJSON, [NodeInspectSymbol], [TypeId], pipe" |
| `((...p) => Effect.gen.Return<A,E,R\|Scope>) \| ((...p) => Effect<A,E,R\|Scope>)` — **gen first** | ✅ | ✅ **yes** | ✅ ends in `Type 'Db' is not assignable to type 'Scope \| World'` |
| generator-only (`Effect.gen.Return`) | ✅ | ✅ yes | ✅ yes | 
| fn-only | ✅ | n/a | n/a |

Isolated across four permutations: the deciding factor is **member order**, not the `Effect.gen.Return` alias (both hand-rolled `Generator<Effect<any,E,R>,A,any>` and `Effect.gen.Return` behave identically). TypeScript reports the *first* union member it fails against; when that is the `Effect`-returning branch, the mismatch is "a Generator is not an Effect" — a shape error the tsgo plugin has no reason to interpret as a context problem.

**This is the single most dangerous finding in this phase.** `spec/behaviors/01`'s BEH-EC-003 writes the union fn-first. Copying it verbatim keeps the rejection (so every test still passes) but **silently drops ADR-EC-016's diagnostic from the DSL-01 fixture**, which is exactly the "gate decays into a no-op while CI stays green" failure this repo's tooling exists to prevent.

---

### Finding 3 — `@ts-expect-error` does NOT suppress `@effect/tsgo` diagnostics [VERIFIED: reproduced twice]

Success criterion 1 is worded around `@ts-expect-error`. Written naively it does not work.

```ts
describeFeature(feature, World.layer, ({ Given }) => {
  // @ts-expect-error step requires Db, which World.layer does not provide
  Given("needs Db", function*() { yield* Db })
})
```
→ **exit 1**: `error TS377004: ... effect(missingEffectContext)`

The directive consumed the `TS2345` but not the `TS377004`. Confirmed independently against `floatingEffect`: `// @ts-expect-error` above a floating `Effect.sync(() => 1)` still exits 1 with `TS377001`.

**Two working resolutions, both verified:**

**(A) Stacked directives — makes the `@ts-expect-error` idiom work.** `@effect/tsgo` has its own suppression directive. Order matters: the `@effect-diagnostics-next-line` comment must be the line **immediately above the code**; `@ts-expect-error` goes above it (TypeScript skips intervening comment lines when resolving "next line", the plugin does not).

```ts
// @ts-expect-error step requires Db, which World.layer does not provide
// @effect-diagnostics-next-line missingEffectContext:off
Given("needs Db", function*() { yield* Db })
```
→ **exit 0** ✅ (verified)

Reversing the two comment lines yields `warning TS377000: @effect-diagnostics directive has no effect` **plus** the unsuppressed `TS377004`. A file-level `// @effect-diagnostics missingEffectContext:off` also works but disables the diagnostic for the whole file, which is strictly worse for a fixture whose job is to be precise.

**(B) Exit-code fixture — Phase 1's existing pattern.** No directives; assert `tsc` exits non-zero *and* the output names the specific diagnostic. This is what `verify-tsgo-gate.sh` already does and is **strictly stronger** than (A): (A) proves *some* error occurred on that line; (B) proves *which*.

**Recommendation:** make (B) the primary DSL-01 proof, because it is the only one that keeps ADR-EC-016's diagnostic under assertion. If the roadmap's `@ts-expect-error` wording is to be honored literally, add (A) as a *second* fixture — but note that (A) alone would let a regression that changes `TS377004` into a mere `TS2345` pass unnoticed.

---

### Finding 4 — BEH-EC-003's literal signature is VACUOUS [VERIFIED: reproduced, exit 0]

`spec/behaviors/01-steps-and-world.md` writes:

```ts
export const Given: <Params extends unknown[], A, E, R>(
  pattern: string,
  fn: StepFn<Params, A, E, R> | ((...params: Params) => Generator<any, A, any>)
) => void
```

Note `Generator<any, A, any>` — **the yield type is `any`**. Reproduced against that exact shape: a step doing `yield* Db` against a `World`-only Layer **compiles clean, exit 0**. INV-EC-003 is decorative under the spec's own published signature.

This is `.planning/research/PITFALLS.md` Pitfall 3/4 ("a vacuous generic `R` constraint compiles fine and rejects nothing") — found not as a hypothetical but *in the spec text the implementer is told to follow*. The spec is a booby trap here.

Additional problems in the same block: `R` is a free type parameter of `Given` rather than being bound to the ambient Layer's `ROut` (so it would infer per-call and constrain nothing), and `Params extends unknown[]` should be `ReadonlyArray<any>` to accept the generator's inferred parameter tuple cleanly.

**Required correction (in-phase, per AGENTS.md §1):** BEH-EC-003's signature block must become the `StepRegistrar<ROut>` shape in Code Examples §1.

---

### Finding 5 — BEH-EC-002's literal signature erases `shared` [VERIFIED: reproduced]

`spec/behaviors/01` writes:

```ts
export const describeFeature: <R, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<R, E, never> | { shared: Layer.Layer<any, any, never>; perScenario: Layer.Layer<R, E, never> },
  define: (dsl: FeatureDsl<R>) => void
) => void
```

`shared` is typed `Layer.Layer<any, any, never>` — its output type is thrown away, and `R` binds to `perScenario` alone. Reproduced:

```
describeFeature(feature, { shared: Db.layer, perScenario: World.layer }, ({ Given }) => {
  Given("uses shared", function*() { yield* (yield* Db).clear })   // ❌ TS2345 — Db not in scope
})
```

ADR-EC-006's own motivating example is `shared: Database.layer` with steps that use `Database`. Under the spec's literal signature that example does not compile. The union form cannot be repaired by widening `shared`'s type parameter either — a union in an inference position gives TypeScript no way to bind two independent output types and thread their union into `define`.

**The overload form fixes it and was verified working** for all four cases (plain Layer, object form using `shared`, object form using `perScenario`, object form using both). See Code Examples §1.

---

### Finding 6 — Overload ORDER decides `missingLayerContext` and error quality [VERIFIED: reproduced, both orderings]

TypeScript reports overload failures as *"No overload matches this call. **The last overload** gave the following error."* So the overload you want diagnostics from must be declared **last**.

Passing a `Layer<World, never, Db>` (unsatisfied `RIn`) to `describeFeature`:

| Overload order | Reported error | `effect(missingLayerContext)`? |
|---|---|---|
| plain-Layer **first**, object **last** | `Type 'Layer<World, never, Db>' is missing the following properties from type '{ shared; perScenario }'` — names the wrong problem entirely | ❌ no |
| object **first**, plain-Layer **last** | `Argument of type 'Layer<World, never, Db>' is not assignable to parameter of type 'Layer<World, never, never>'. Type 'Db' is not assignable to type 'never'` | ✅ **`TS377034 effect(missingLayerContext)`** naming `Db` |

**Declare the object-form overload first and the plain-Layer overload last.** This is counter-intuitive (the plain form is the common case and reads naturally first) and is the opposite ordering rule from Finding 2's union — which is precisely why it needs to be written down rather than left to intuition.

Missing the required `perScenario` key (D-03) is correctly rejected under both orderings with a clear message: `Property 'perScenario' is missing in type '{ shared: Layer<Db> }' but required in type '{ shared; perScenario }'`. ✅

---

### Finding 7 — The internal `Effect.fn` auto-wrap type-checks with no cast, but must discriminate at runtime [VERIFIED: types; MEDIUM on runtime]

```ts
export const register = <Params extends ReadonlyArray<any>, A, E, R>(
  pattern: string,
  fn: ((...p: Params) => Effect.gen.Return<A, E, R>) | ((...p: Params) => Effect.Effect<A, E, R>)
): ((...p: Params) => Effect.Effect<A, E, R>) => Effect.fn(pattern)(fn)
```
→ compiles clean, **no cast needed** (verified). `Effect.fn`'s v4 overloads accept both branches.

**But** ADR-EC-005 says an already-`Effect.fn`-wrapped function is "accepted directly, **unchanged**." Re-wrapping it with `Effect.fn(pattern)` would nest a second span inside the author's own — the step text would appear twice in the trace, breaking D-05's observability claim in a subtle way. Types cannot distinguish the two branches at runtime.

**Runtime discriminator (use this):**
```ts
const isGeneratorFn = (f: Function): boolean =>
  Object.prototype.toString.call(f) === "[object GeneratorFunction]"
```
Wrap only when `isGeneratorFn(fn)`; pass through otherwise. `[MEDIUM confidence]` — the discriminator is standard JS and reliable, but the *double-span* consequence was reasoned about, not reproduced (it needs the Phase 6 runner to observe a real span). Recommend a Phase 5 unit test asserting `register(pattern, alreadyWrapped) === alreadyWrapped` (identity), which is checkable now without a runner.

---

### Finding 8 — `Scope.Scope` belongs on the step registrar, and `ROut | Scope.Scope` is correct [VERIFIED: reproduced]

Confirms Pitfall 5 and resolves the discretion item. With `fn: (...p) => Effect.gen.Return<A, E, ROut | Scope.Scope>`:

- `yield* Effect.acquireRelease(Effect.succeed(1), () => Effect.void)` against a plain `Layer<World>` → **compiles** ✅ (D-02 / success criterion 2)
- `yield* Db` against the same Layer → **rejected** with `effect(missingEffectContext)` ✅

`FeatureDsl<ROut>` stays free of `Scope` — the user-facing type parameter is exactly the Layer's output. `Scope` enters only at the step-function boundary, where the runner will actually provide it.

**Variance context:** Effect v4 declares `Effect<out A, out E = never, out R = never>` (R **covariant**) but `Layer<in ROut, out E = never, out RIn = never>` (ROut **contravariant**). [VERIFIED: read `effect/dist/Effect.d.ts:80` and `effect/dist/Layer.d.ts:44`] The asymmetry is correct and is what makes the check work in the intended direction, but it is the exact variance hazard ADR-EC-016 was written to backstop. Do not add explicit variance annotations to `FeatureDsl`/`StepRegistrar` — the inferred variance is right, and annotating would risk pinning it wrong.

---

### Finding 9 — The mutation-flip requirement works cleanly [VERIFIED: reproduced]

Success criterion 1 requires "removing a service from an ambient Layer flips a previously-passing case to failing." Verified with two otherwise-identical fixtures:

| Ambient Layer | Step | Result |
|---|---|---|
| `Layer.merge(World.layer, Db.layer)` → `Layer<World \| Db>` | `yield* (yield* Db).clear` | **exit 0** ✅ |
| `Layer.merge(World.layer, Layer.empty)` → `Layer<World>` | *same step, unchanged* | **exit 1**, `TS377004 effect(missingEffectContext)` naming `Db` ✅ |

`Layer.empty` is `Layer<never>` [VERIFIED: `Layer.d.ts:948`], so D-03's `perScenario: Layer.empty` gives `FeatureDsl<RShared | never>` = `FeatureDsl<RShared>` — verified compiling with `shared`'s service reachable.

**How to automate the flip:** the honest mechanism is a *pair* of committed fixtures (one satisfied, one deliberately starved), not a script that edits a file. The starved fixture's non-zero exit *is* the flip assertion, and it can never silently decay because the satisfied fixture is asserted to exit 0 in the same script run. A `sed`-the-file-and-recompile approach adds moving parts and a mutable working tree for no extra guarantee.

---

### Finding 10 — `Context.Service` under v4 + this repo's strict flags [VERIFIED: reproduced]

`Context.Service<Self, Shape>()("Key")` compiles cleanly under `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `erasableSyntaxOnly`, matching the pattern already used throughout `packages/gherkin/src`. The `static readonly layer = Layer.effect(this, ...)` idiom from ADR-EC-002 works verbatim, but **annotate it explicitly** (`static readonly layer: Layer.Layer<World> = ...`) — without the annotation, `composite: true` in `tsconfig.base.json` will demand it anyway ("has or is using private name" / declaration-emit errors) for anything exported.

DSL-03's negative case (reading a field absent from World's declared type) produces a plain **`TS2339`**, not an Effect diagnostic. The gate assertion for it must check exit code + `TS2339`, and must **not** grep for `effect(`.

---

### Finding 11 — Container dsl shapes verified [VERIFIED: reproduced]

Both ADR-EC-017 shapes compile as specified, including a nested `Scenario` whose destructured `Given` shadows the outer one:

```ts
Background(({ Given, And }) => { ... })                       // {Given, And} only ✅
Scenario("name", ({ Given, When, Then, And, But }) => { ... }) // full set ✅
```

`Background`'s dsl correctly does **not** expose `When`/`Then` — reaching for them is `TS2339`. The closure-capture form (ADR-EC-017's still-valid alternative) also compiles, since the outer dsl's registrars are the same `StepRegistrar<ROut>` type.

DSL-04's second half — "two `Registry` instances constructed in one process share no state" — is **not a type-level property** and cannot be proven by any fixture in `tsgo-gate/`. It needs a runtime unit test. See Validation Architecture.

---

### Finding 12 — Comment prose beginning with `@ts-` is parsed as a real directive [VERIFIED: reproduced]

```ts
// @ts-ignore-nothing-this-is-prose
export const broken: number = "not a number"
```
→ **exit 0**. The error was suppressed.

TypeScript matches the directive by prefix, so a comment that merely *starts with* `@ts-ignore` or `@ts-expect-error` — including explanatory prose in a heavily-commented type-test file — silently becomes a live directive. This bit during probing: a header comment reading `// @ts-expect-error fixture can exit 0?` produced a spurious `TS2578: Unused '@ts-expect-error' directive` pointing at the prose line.

**Rule for the fixtures:** never begin a comment line with `@ts-`. Write "a `@ts-expect-error` fixture" (backticked, not line-initial) or reword.

---

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────┐
   .feature (Phase 2)│  ParsedFeature  (types only, no runtime) │
                     └────────────────────┬────────────────────┘
                                          │
  test author's file                      ▼
  ─────────────────────      ┌──────────────────────────────┐
  World.layer  ──────────────▶  describeFeature(f, L, def)  │
  { shared, perScenario } ───▶  ── OVERLOAD RESOLUTION ──   │
                             │  object-form   (declared 1st)│
                             │  plain-Layer   (declared 2nd)│──┐
                             └──────────────┬───────────────┘  │ ROut binds here.
                                            │                  │ Wrong order ⇒ no
                                            ▼                  │ missingLayerContext
                             ┌──────────────────────────────┐  │ (Finding 6)
                             │      FeatureDsl<ROut>        │◀─┘
                             │  Background / Scenario /     │
                             │  Given When Then And But     │
                             └──────────────┬───────────────┘
                                            │ ROut ∪ Scope.Scope
                                            ▼
                             ┌──────────────────────────────┐
                             │   StepRegistrar<ROut>        │
                             │   union member order:        │
                             │     1. gen.Return  ◀── first │──┐ Wrong order ⇒ no
                             │     2. Effect                │  │ missingEffectContext
                             └──────────────┬───────────────┘  │ (Finding 2)
                                            │                  │
                        ┌───────────────────┴──────────────┐   │
                        │ runtime: isGeneratorFn(fn) ?     │   │
                        │   Effect.fn(stepText)(fn)        │   │
                        │   : fn  (pass through unchanged) │   │
                        └───────────────────┬──────────────┘   │
                                            ▼                  │
                             ┌──────────────────────────────┐  │
                             │  Registry (per-instance      │  │
                             │  scope stack, NOT a module   │  │
                             │  singleton)                  │  │
                             └──────────────────────────────┘  │
                                                               │
   ══════════════ COMPILE-TIME PROOF (parallel path) ══════════╪═════════
                                                               ▼
   packages/vitest/test/tsgo-gate/                    tsc --noEmit
     src/<satisfied>.ts        + tsconfig.X.json  ──▶  exit 0   (assert)
     src/<starved>.ts          + tsconfig.Y.json  ──▶  exit≠0 + effect(missingEffectContext)
     src/<scoped-ok>.ts        + tsconfig.Z.json  ──▶  exit 0   (assert)
     src/<world-field>.ts      + tsconfig.W.json  ──▶  exit≠0 + TS2339 (NO effect grep)
                                     │
                                     ▼
                     scripts/verify-tsgo-gate.sh  ──▶  CI job "Types and tsgo gate"
```

### Recommended Structure

```
packages/vitest/
├── src/
│   ├── index.ts              # re-exports only (replaces the placeholder)
│   ├── Dsl.ts                # FeatureDsl / ScenarioDsl / BackgroundDsl / StepRegistrar types
│   ├── describeFeature.ts    # the two overloads + impl signature
│   ├── Registry.ts           # per-instance scope stack (NOT a module singleton)
│   └── Step.ts               # register(): isGeneratorFn discrimination + Effect.fn wrap
└── test/
    ├── tsgo-gate/
    │   ├── tsconfig.json              # ⚠ currently `include: ["src"]` — see Pitfall 1
    │   ├── tsconfig.ok.json           # existing
    │   ├── tsconfig.floating.json     # existing
    │   ├── tsconfig.<new>.json        # one per new fixture
    │   └── src/
    │       ├── satisfied.ts               # existing
    │       ├── missing-layer-context.ts   # existing
    │       ├── floating-effect.ts         # existing
    │       └── <new fixtures>.ts          # one file per case
    └── Registry.test.ts       # DSL-04 runtime: two instances share no state
```

### Pattern: one file, one case, one tsconfig

Established by Phase 1 and locked by D-01. Each fixture gets `{ "extends": "./tsconfig.json", "include": [], "files": ["src/<one>.ts"] }`. This is what makes a per-fixture exit code a *specific* assertion rather than a mixed signal.

### Anti-Patterns to Avoid

- **Grepping compiler output instead of checking the exit code.** `verify-tsgo-gate.sh`'s own header explains why: with `ignoreEffectErrorsInTscExitCode: true`, output is byte-identical and only the exit code differs. Any new assertion must check exit code *and* diagnostic name, never name alone.
- **Reusing assertion 4's `missingLayerContext` grep for the step fixture.** Wrong diagnostic (Finding 1).
- **Declaring the plain-Layer overload first** because it reads better (Finding 6).
- **Copying BEH-EC-003's union order** (Finding 2) or its `Generator<any, A, any>` (Finding 4).
- **A module-level `let currentScope` / exported mutable registry.** DSL-04 explicitly forbids it; PITFALLS Pitfall 14 documents the whole ecosystem's scar tissue from `export default new SupportCodeLibraryBuilder()`.
- **Beginning a comment line with `@ts-`** (Finding 12).
- **Adding `any` to make a fixture compile.** PITFALLS Pitfall 6: one `any` in a step body disables the whole guarantee. If a fixture needs `any` to pass, the type is wrong, not the fixture.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Generator type for a step body | `Generator<Effect<any,E,R>,A,any>` written out | `Effect.gen.Return<A, E, ROut \| Scope.Scope>` | Effect v4 ships it; behaviourally identical (verified) but tracks upstream if the shape changes. `YieldWrap` — the v3 idiom — **does not exist in v4** and silently degrades to `any` (PITFALLS Pitfall 4). |
| Named span around a step | `Effect.gen` + `Effect.withSpan(stepText)` | `Effect.fn(stepText)(genFn)` | ADR-EC-005. Output shape is already `(...p) => Effect<A,E,R>`. |
| Suppressing a tsgo diagnostic in a fixture | Deleting the plugin from a fixture tsconfig; setting `ignoreEffectErrorsInTscExitCode: true` locally | `// @effect-diagnostics-next-line <rule>:off` | Surgical, one line, one rule. Disabling the plugin for a fixture defeats the fixture's purpose. |
| Proving "removing a service flips it" | A script that mutates a file and recompiles | A committed pair of fixtures (satisfied / starved) | No mutable working tree, no cleanup path, and the flip is asserted every CI run instead of once. |
| Detecting a generator function at runtime | `fn.toString().startsWith("function*")` | `Object.prototype.toString.call(fn) === "[object GeneratorFunction]"` | Survives minification and arrow/async variants. |
| `ParsedFeature` shape | Re-declaring it in `packages/vitest` | `import type` from `@effect-cucumber/gherkin` | Project reference is already wired; duplicating it creates two structurally-distinct types across the boundary. |

**Key insight:** every "hand-roll" temptation in this phase is a type that *compiles* while enforcing nothing. There is no loud failure mode. The fixtures are the only thing standing between a correct implementation and a decorative one — which is why success criterion 1 puts them first.

## Common Pitfalls

### Pitfall 1: `tsgo-gate/tsconfig.json` has `include: ["src"]` — new fixtures leak into the existing assertion

`NEG_CONFIG` in `verify-tsgo-gate.sh` points at `packages/vitest/test/tsgo-gate/tsconfig.json`, which is `include: ["src"]` — it compiles **every** file in `src/`, unlike `tsconfig.ok.json` / `tsconfig.floating.json` which use `files: [one]`.

**What goes wrong:** adding Phase 5's fixtures to `src/` puts them inside assertion 4's compilation. A new *positive* fixture there gets its diagnostics mixed into `NEG_OUTPUT`; a new *negative* one means assertion 4's `missingLayerContext` grep could be satisfied by the wrong file after a future edit. The assertion stops being specific without ever failing.

**How to avoid:** convert `tsconfig.json` to the same isolated shape as its siblings — add `"files": ["src/missing-layer-context.ts"]` and `"include": []` — and give every new fixture its own config. Do this **before** adding fixtures, as its own task. `bash scripts/verify-tsgo-gate.sh` currently passes all four assertions (verified today), so this refactor has a known-green baseline to preserve.

### Pitfall 2: `typecheck:test` only covers `packages/gherkin`

`"typecheck:test": "tsc --noEmit -p packages/gherkin/tsconfig.test.json"` — single project, hardcoded path. `packages/vitest/test/` is currently type-checked by **nothing** (`tsc -b` only sees `include: ["src"]`; vitest transpiles without checking). A `Registry.test.ts` added for DSL-04 would have its type errors invisible to CI.

**How to avoid:** add `packages/vitest/tsconfig.test.json` (copy `packages/gherkin/tsconfig.test.json`, including its `rootDir`/`types`/`moduleDetection` overrides and the comments explaining each — they are all load-bearing) and extend the `typecheck:test` script to run both. Note its `exclude` must skip `test/tsgo-gate/` or the deliberately-failing fixtures will break `typecheck:test`.

### Pitfall 3: `exactOptionalPropertyTypes: true` floods generator diagnostics with irrelevant advice

Every generator-assignability failure in this repo emits four nested lines of *"with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties"* before reaching the real cause. Verified: the useful line (`Type 'Db' is not assignable to type 'Scope | World'`) is the **eighth** line of the TS2345 chain.

**Consequence:** do not judge error quality by the first line, and do not "fix" this by relaxing `exactOptionalPropertyTypes`. It is why the `effect(missingEffectContext)` one-liner matters so much — it is the only human-readable summary, and Finding 2's ordering is what makes it appear.

### Pitfall 4: double-wrapping an already-`Effect.fn`-wrapped step

See Finding 7. Types accept it silently; the observable damage is a nested span with the step text twice. Guard with `isGeneratorFn` and assert identity pass-through in a unit test.

### Pitfall 5 (inherited, PITFALLS #6): one `any` disables the guarantee

`Effect<any,any,any>` and bare `any` are assignable to everything — a step body containing either compiles against any Layer. Not fixable in the DSL's types. PITFALLS assigns the INV-EC-003 wording amendment to this phase (P4): INV-EC-003 must read as holding *"for step bodies free of `any`."* Include that spec edit here.

### Pitfall 6 (inherited, PITFALLS #2): keep `describeFeature` and its define callback 100% synchronous

Not a Phase 5 runtime concern (no `it.effect` emission yet), but the **type** must not admit an async define callback, or Phase 6 inherits a signature that permits silently-zero tests. Declare `define: (dsl: FeatureDsl<ROut>) => void` — `void`, never `void | Promise<void>`.

## Code Examples

### §1 — The recommended type surface (verified compiling; negative cases verified rejecting)

```ts
// packages/vitest/src/Dsl.ts
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type { ParsedFeature } from "@effect-cucumber/gherkin"

export interface StepRegistrar<ROut> {
  <Params extends ReadonlyArray<any>, A, E>(
    pattern: string,
    fn:
      // ORDER IS LOAD-BEARING (Finding 2): the generator branch MUST be first,
      // or effect(missingEffectContext) does not fire on the negative fixture.
      | ((...p: Params) => Effect.gen.Return<A, E, ROut | Scope.Scope>)
      | ((...p: Params) => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}

export interface ScenarioDsl<ROut> {
  readonly Given: StepRegistrar<ROut>
  readonly When: StepRegistrar<ROut>
  readonly Then: StepRegistrar<ROut>
  readonly And: StepRegistrar<ROut>
  readonly But: StepRegistrar<ROut>
}

// ADR-EC-017: real Gherkin grammar permits only Given/And in a Background.
export interface BackgroundDsl<ROut> {
  readonly Given: StepRegistrar<ROut>
  readonly And: StepRegistrar<ROut>
}

export interface FeatureDsl<ROut> extends ScenarioDsl<ROut> {
  readonly Background: (define: (dsl: BackgroundDsl<ROut>) => void) => void
  readonly Scenario: (name: string, define: (dsl: ScenarioDsl<ROut>) => void) => void
}

// ORDER IS LOAD-BEARING (Finding 6): TypeScript reports "the LAST overload gave
// the following error", so the plain-Layer form goes last — that is what makes
// effect(missingLayerContext) fire and the message name the real problem.
export declare function describeFeature<RShared, RScenario, E1, E2>(
  feature: ParsedFeature,
  layer: {
    readonly shared: Layer.Layer<RShared, E1, never>
    readonly perScenario: Layer.Layer<RScenario, E2, never>   // D-03: required, use Layer.empty
  },
  define: (dsl: FeatureDsl<RShared | RScenario>) => void
): void
export declare function describeFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void
): void
```

### §2 — Negative fixture, exit-code form (recommended primary DSL-01 proof)

```ts
// packages/vitest/test/tsgo-gate/src/step-missing-service.ts
// MUST NOT COMPILE. Asserted by scripts/verify-tsgo-gate.sh:
//   exit != 0  AND  output contains "effect(missingEffectContext)"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { describeFeature } from "@effect-cucumber/vitest"
import type { ParsedFeature } from "@effect-cucumber/gherkin"

class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer: Layer.Layer<World> = Layer.effect(
    this,
    Effect.gen(function*() { return World.of({ apples: yield* Ref.make(0) }) })
  )
}
class Db extends Context.Service<Db, { readonly clear: Effect.Effect<void> }>()("Db") {
  static readonly layer: Layer.Layer<Db> = Layer.succeed(Db, Db.of({ clear: Effect.void }))
}

declare const feature: ParsedFeature

describeFeature(feature, World.layer, ({ Given }) => {
  // Db is not provided by World.layer. This is the whole project's core value.
  Given("needs Db", function*() {
    yield* (yield* Db).clear
  })
})
```

Reproduced output:
```
error TS2345: Argument of type '() => Generator<...Db>, void, any>' is not assignable to
  parameter of type '(() => Return<void, never, Scope | World>) | (() => Effect<...>)'.
  ... Type 'Db' is not assignable to type 'Scope | World'.
error TS377004: This Effect requires a service that is missing from the expected Effect
  context: `Db`. effect(missingEffectContext)
exit 1
```

### §3 — DSL-03 negative fixture (World field absent from the declared type)

```ts
// MUST NOT COMPILE. Assert: exit != 0 AND output contains "TS2339".
// Do NOT grep for "effect(" here — this is a plain TypeScript error (Finding 10).
describeFeature(feature, World.layer, ({ Given }) => {
  Given("reads an undeclared field", function*() {
    const world = yield* World
    // @ts-nothing — see Finding 12: never begin a comment with @ts-
    void world.oranges   // TS2339: Property 'oranges' does not exist on type ...
  })
})
```

### §4 — Positive fixture (D-02 / success criterion 2 — all verified exit 0)

```ts
// packages/vitest/test/tsgo-gate/src/step-satisfied.ts
// MUST COMPILE CLEAN. Assert exit == 0.
describeFeature(feature, World.layer, ({ Background, Given, Scenario, Then, When }) => {
  Given("I have {int} apples", function*(n: number) {
    yield* Ref.set((yield* World).apples, n)
  })

  // Scope enters ROut via acquireRelease — must still compile against a PLAIN Layer.
  When("a scoped step", function*() {
    yield* Effect.acquireRelease(Effect.succeed(1), () => Effect.void)
  })

  // ADR-EC-005: an already-Effect.fn-wrapped function is accepted unchanged.
  Then("already wrapped", Effect.fn("already wrapped")(function*(n: number) {
    yield* Ref.set((yield* World).apples, n)
  }))

  Background(({ Given: G, And }) => {
    G("bg given", function*() { yield* World })
    And("bg and", function*() { yield* World })
  })

  Scenario("nested", ({ Given: G }) => {
    G("nested step", function*() { yield* World })
  })
})

// Object form: BOTH shared and perScenario services reachable (Finding 5).
describeFeature(feature, { shared: Db.layer, perScenario: World.layer }, ({ Given }) => {
  Given("both", function*() {
    yield* (yield* Db).clear
    yield* Ref.set((yield* World).apples, 1)
  })
})

// D-03: Layer.empty is a legal perScenario; Layer<never> unions away cleanly.
describeFeature(feature, { shared: Db.layer, perScenario: Layer.empty }, ({ Given }) => {
  Given("shared only", function*() { yield* (yield* Db).clear })
})
```

### §5 — Optional `@ts-expect-error` fixture (stacked directives — verified exit 0)

```ts
// Compiles clean ONLY because both errors are suppressed. If the DSL type is
// ever loosened, TS2578 "Unused '@ts-expect-error' directive" fires.
// Weaker than §2: proves an error occurred, not WHICH. Use as a supplement.
describeFeature(feature, World.layer, ({ Given }) => {
  // @ts-expect-error step requires Db, which World.layer does not provide
  // @effect-diagnostics-next-line missingEffectContext:off
  Given("needs Db", function*() {
    yield* (yield* Db).clear
  })
})
```
Directive order matters: `@effect-diagnostics-next-line` must be the line **immediately above the code**. Reversed, it emits `warning TS377000: @effect-diagnostics directive has no effect` and the diagnostic survives.

### §6 — New gate assertions (mirroring `verify-tsgo-gate.sh`'s existing style)

```bash
# Assertion 5: the DSL positive control compiles clean.
POS_OUTPUT="$($TSC -p "$STEP_OK_CONFIG" 2>&1)" && POS_EXIT=0 || POS_EXIT=$?
if [[ "$POS_EXIT" -ne 0 ]]; then
  echo "$POS_OUTPUT"
  fail "the DSL positive control failed to compile — a scoped step (Effect.acquireRelease) or an already-Effect.fn-wrapped step was wrongly rejected. The fixture is broken, or Scope.Scope left the step type."
fi
echo "✓ DSL positive control compiles clean (scoped + wrapped steps accepted)"

# Assertion 6: THE DSL-01 GUARANTEE. A step needing an unprovided service is rejected BY NAME.
STEP_OUTPUT="$($TSC -p "$STEP_NEG_CONFIG" 2>&1)" && STEP_EXIT=0 || STEP_EXIT=$?
if [[ "$STEP_EXIT" -eq 0 ]]; then
  echo "$STEP_OUTPUT"
  fail "a step requiring an unprovided service COMPILED — INV-EC-003 is decorative. Check whether the step-parameter generic degraded to \`any\` (PITFALLS Pitfall 4)."
fi
# NOTE: missingEffectContext, NOT missingLayerContext (RESEARCH Finding 1).
if ! grep -q "effect(missingEffectContext)" <<<"$STEP_OUTPUT"; then
  echo "$STEP_OUTPUT"
  fail "the step was rejected, but not by effect(missingEffectContext) — the tsgo diagnostic stopped covering the DSL. Most likely cause: the StepRegistrar union was reordered so the Effect-returning branch is listed first (RESEARCH Finding 2)."
fi
echo "✓ a step requiring an unprovided service is rejected by name: effect(missingEffectContext)"
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|---|---|---|---|
| `Eff extends YieldWrap<Effect<any,any,R>>` (v3 DSL idiom) | Effects are yielded directly; `Effect.gen.Return<A,E,R>` | Effect v4 | `YieldWrap` **does not exist in v4**. Copying the v3 idiom silently degrades the constraint to `any` and rejects nothing (PITFALLS Pitfall 4, `[VERIFIED]` there). |
| `effect/GlobalValue` for cross-copy singletons | Removed | Effect v4 | Duplicate-`effect` failures are now silent and late rather than a clean type error (PITFALLS Pitfall 17). Not a Phase 5 concern, but the reason `duplicatePackage` is on. |
| `@effect/language-service` as a plain TS plugin | `@effect/tsgo` (TypeScript-Go superset), plugin still *named* `@effect/language-service` | 2026 | Already wired (ADR-EC-016). The naming holdover is real, not a typo. |
| Grepping `tsc` output to prove a gate | Asserting the **exit code** of a file whose only defect is an Effect diagnostic | Phase 1 of this project | Output is byte-identical whether or not the gate is enforced. Documented in `verify-tsgo-gate.sh`'s header; new assertions must respect it. |

**Deprecated / do not use in this phase:**
- `YieldWrap` (v3 only, absent in v4)
- `Effect.gen(function*(){})` for a step body — reserved for inline, unnamed, parameterless Effects (ADR-EC-005)
- The union-argument `describeFeature` signature in BEH-EC-002 (Finding 5)
- The `Generator<any, A, any>` step parameter in BEH-EC-003 (Finding 4)

## Runtime State Inventory

Not applicable — Phase 5 is a greenfield type surface plus test fixtures. No renames, no migrations, no stored data, no OS-registered state, no secrets, no live service config.

One build-artifact note: `packages/vitest/dist/` currently holds compiled output for the placeholder `index.ts`. Replacing `src/index.ts` makes it stale until the next `tsc -b`. `dist/` is gitignored and `pnpm build` runs first in the CI `types` job, so no action is required — recorded only so it is not mistaken for a problem.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `effect` | The entire type surface | ✓ | 4.0.0-rc.112 | — |
| `typescript` (native, tsgo-patched) | `tsc --noEmit` fixtures | ✓ | 7.0.2 | — |
| `@effect/tsgo` | `missingEffectContext` / `missingLayerContext` | ✓ | 0.38.0 | — |
| `@effect/tsgo-darwin-arm64` (native binary) | plugin execution | ✓ | resolved via `effect-tsgo patch` | — |
| `@effect-cucumber/gherkin` (`ParsedFeature` types) | `describeFeature`'s first parameter | ✓ | workspace, project reference already wired | — |
| `@effect/vitest` | DSL-04 runtime Registry test | ✓ | 4.0.0-rc.112 | — |
| `vitest` | running that test | ✓ | ^4.1.0 | — |
| `bash` | `verify-tsgo-gate.sh` | ✓ | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

Verified end-to-end: `bash scripts/verify-tsgo-gate.sh` passes all four current assertions today (`tsgo gate: ENFORCED`). That is the green baseline Phase 5 must preserve while adding to it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest ^4.1.0` + `@effect/vitest 4.0.0-rc.112` |
| Config file | **none** — no `vitest.config.*` anywhere in the repo (verified). Defaults are in use; `packages/vitest/package.json` declares `"test": "vitest run"`. |
| Type-gate runner | `bash scripts/verify-tsgo-gate.sh` (this phase's primary verification surface) |
| Test typecheck | `pnpm typecheck:test` — currently `packages/gherkin` **only** (see Pitfall 2) |
| Quick run command | `bash scripts/verify-tsgo-gate.sh` |
| Full suite command | `pnpm build && pnpm typecheck:test && pnpm verify:tsgo-gate && pnpm test` |

### Phase Requirements → Test Map
| Req | Behavior | Test type | Automated command | Exists? |
|-----|----------|-----------|-------------------|---------|
| DSL-01 | Step needing unprovided service fails to compile, by name | compile-gate | `bash scripts/verify-tsgo-gate.sh` (new assertion 6) | ❌ Wave 0 |
| DSL-01 | Removing a service from the Layer flips a passing case to failing | compile-gate pair | same script, assertions 5+6 together | ❌ Wave 0 |
| DSL-01 | `Effect.acquireRelease` step compiles against a plain Layer | compile-gate | same script (new assertion 5) | ❌ Wave 0 |
| DSL-01 | Layer argument with unsatisfied `RIn` is rejected | compile-gate | new assertion, greps `effect(missingLayerContext)` | ❌ Wave 0 |
| DSL-02 | Bare generator accepted and auto-wrapped as `Effect.fn(stepText)` | unit | `pnpm --filter @effect-cucumber/vitest test` | ❌ Wave 0 |
| DSL-02 | Already-wrapped fn passed through unchanged (identity) | unit | same | ❌ Wave 0 |
| DSL-02 | Step text observable on the span | unit (`Effect.fn` name assertion) | same | ❌ Wave 0 |
| DSL-03 | World reachable as a typed `Context.Service` | compile-gate (positive) | assertion 5's fixture | ❌ Wave 0 |
| DSL-03 | Undeclared World field is a compile error | compile-gate | new assertion, greps `TS2339` (**not** `effect(`) | ❌ Wave 0 |
| DSL-04 | `Background` gets `{Given, And}`; `Scenario` gets the full set | compile-gate (positive) | assertion 5's fixture | ❌ Wave 0 |
| DSL-04 | Two `Registry` instances share no state | **unit (runtime)** | `pnpm --filter @effect-cucumber/vitest test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bash scripts/verify-tsgo-gate.sh` (seconds; the phase's core assertion)
- **Per wave merge:** `pnpm build && pnpm typecheck:test && pnpm verify:tsgo-gate && pnpm test`
- **Phase gate:** all of the above green, plus `pnpm verify:spec` (traceability, after the BEH-EC-002/003 corrections) and `pnpm lint`

### Wave 0 Gaps
- [ ] Refactor `packages/vitest/test/tsgo-gate/tsconfig.json` to `include: []` + `files: ["src/missing-layer-context.ts"]` — **do this first**, before adding fixtures (Pitfall 1)
- [ ] `packages/vitest/tsconfig.test.json` + extend the `typecheck:test` script to run both projects, excluding `test/tsgo-gate/` (Pitfall 2)
- [ ] `packages/vitest/test/Registry.test.ts` — DSL-04's per-instance proof (no framework install needed; `vitest` + `@effect/vitest` already present)
- [ ] New tsgo-gate fixtures + isolated tsconfigs (one per case, per D-01/D-02)
- [ ] New assertions appended to `scripts/verify-tsgo-gate.sh`

## Security Domain

`security_enforcement` is not set in `.planning/config.json` (treated as enabled). This phase has **no runtime attack surface**: it ships type declarations, compile-time fixtures, and a bash assertion script. No network, no I/O, no user input parsing, no authentication, no cryptography, no persistence.

| ASVS Category | Applies | Standard control |
|---------------|---------|------------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | No runtime input in this phase. Gherkin/`DataTable` decoding is Phase 2/4 (already delivered, `Schema`-based per ADR-EC-008). |
| V6 Cryptography | no | — |
| V14 Configuration | **yes** | Supply-chain: no new packages are installed (see Package Legitimacy Audit). The one relevant control is the existing `duplicatePackage` tsgo diagnostic backstopping ADR-EC-015/021's peer-dependency posture, already enforced. |

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| A weakened gate script silently stops enforcing (assertion decays to a no-op while CI stays green) | Tampering / Repudiation | Assert **exit code plus specific diagnostic name**, never output text alone. This is `verify-tsgo-gate.sh`'s documented "do not weaken this" method note, and Findings 1/2/6 are the phase-specific ways it can decay. |
| A fixture is "fixed" by adding `any` or deleting a directive | Tampering | Positive and negative fixtures asserted in the same script run; PITFALLS Pitfall 6 documented next to INV-EC-003. |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Re-wrapping an already-`Effect.fn`-wrapped step produces a nested/duplicated span | Finding 7, Pitfall 4 | LOW — the identity pass-through is correct regardless (ADR-EC-005 says "unchanged"); only the stated *reason* is unverified. Confirmable in Phase 6 with a real span. |
| A2 | `Object.prototype.toString.call(fn) === "[object GeneratorFunction]"` is the right runtime discriminator | Finding 7, Don't Hand-Roll | LOW — standard JS, but not executed in this session. A one-line unit test settles it. |
| A3 | The BEH-EC-002/003 corrections warrant spec edits rather than a new ADR | Project Constraints C1/C6 | LOW — a judgement call about spec hygiene. If the phase's discussion concludes these are decisions rather than corrections, allocate ADR-EC-026. Either way the edit itself is required. |
| A4 | `packages/vitest/tsconfig.test.json` needs `exclude` for `test/tsgo-gate/` | Pitfall 2, Wave 0 | LOW — inferred from `include: ["src","test"]` in gherkin's equivalent; the deliberately-failing fixtures would otherwise break `typecheck:test`. Cheap to discover at implementation time. |

Everything else in this document is `[VERIFIED]` by reproduction in this session or `[CITED]` from a file read in this repo.

## Open Questions

1. **Should the roadmap's literal "`@ts-expect-error`-based" wording be honored, or superseded?**
   - Known: the stacked-directive form works (exit 0, verified). The exit-code form is strictly stronger and is already the established pattern.
   - Unclear: whether the roadmap author intended `@ts-expect-error` specifically or just "a compile-time negative test."
   - Recommendation: ship the exit-code fixture as the DSL-01 proof, add the `@ts-expect-error` fixture as a supplement, and note in the phase's verification doc why the exit-code form is primary. Both, not either.

2. **Where do the fixtures' `World`/`Db` service declarations live?**
   - Known: each fixture needs them, and D-01 mandates one file per case with `files: [single-file]` — a shared helper file would need adding to each config's `files` array.
   - Recommendation: duplicate the ~12 lines in each fixture. Fixtures are specimens, not production code; a shared helper couples cases together and makes a single edit able to change several assertions at once. The existing `satisfied.ts` / `missing-layer-context.ts` already duplicate their `Dep`/`Svc` declarations — follow that precedent.

3. **Does `Effect.fn(name)` accept a non-generator Effect-returning function at runtime, or only at the type level?**
   - Known: it **type-checks** (Finding 7, verified). Runtime behavior not executed.
   - Recommendation: moot if the `isGeneratorFn` guard is implemented as recommended — the non-generator branch never reaches `Effect.fn`. Worth one unit test to lock the guard in.

## Sources

### Primary (HIGH — reproduced or read in this repo, this session)
- Live compilation probes under `packages/vitest/test/_probe/` (22 fixtures, since deleted; `git status` clean) using `node node_modules/typescript/bin/tsc -p <config>` with the `@effect/language-service` plugin active from `tsconfig.base.json`
- `packages/vitest/node_modules/effect/dist/Effect.d.ts` — `Effect<out A, out E, out R>` (L80), `Variance` (L113), `gen.Return` (L1877), `fn.Return` namespace (L16605)
- `packages/vitest/node_modules/effect/dist/Layer.d.ts` — `Layer<in ROut, out E, out RIn>` (L44), `empty: Layer<never>` (L948)
- `node_modules/@effect/tsgo/README.md` — plugin options block, `@effect-diagnostics` / `@effect-diagnostics-next-line` directives, `overrides` default (`floatingEffect: error` for `src/**/*.ts`)
- `scripts/verify-tsgo-gate.sh` (run today: `tsgo gate: ENFORCED`, all 4 assertions pass)
- `packages/vitest/test/tsgo-gate/{tsconfig.json,tsconfig.ok.json,tsconfig.floating.json,src/*.ts}`
- `tsconfig.base.json`, `tsconfig.json`, `package.json`, `pnpm-workspace.yaml`, `packages/vitest/package.json`, `packages/vitest/tsconfig.json`, `packages/gherkin/tsconfig.test.json`, `.github/workflows/check.yml`
- `spec/decisions/{001,002,003,005,006,016,017,018}.md`, `spec/behaviors/{01,03}.md`
- `AGENTS.md`, `.planning/REQUIREMENTS.md`, `.planning/research/PITFALLS.md` (Pitfalls 1–17 read; 4, 5, 6 are this phase's)
- `.planning/phases/05-describefeature-type-surface/05-CONTEXT.md`

### Secondary (MEDIUM)
- `.planning/research/PITFALLS.md`'s own `[VERIFIED]` claims for Pitfalls 4/5/6 — independently re-reproduced here for the parts Phase 5 depends on (`YieldWrap` absence, `Scope` in `ROut`, `any` leakage), and extended with the ordering findings PITFALLS did not cover

### Tertiary (LOW)
- None. No WebSearch was used; every claim traces to a file in this repo or a compiler run in this session.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new packages; every version read from disk
- Type surface / architecture: **HIGH** — the recommended shape was compiled, and every rejected alternative was compiled and observed failing
- Diagnostic behavior (Findings 1, 2, 3, 6): **HIGH** — reproduced, with permutations isolated
- Spec defects (Findings 4, 5): **HIGH** — the spec's literal signatures were transcribed verbatim and compiled
- Runtime `Effect.fn` double-wrap consequence (Finding 7): **MEDIUM** — types verified, span behavior reasoned
- Pitfalls: **HIGH** for 1–3 and 6 (read from repo files), **MEDIUM** for 4 (see A1)

**Research date:** 2026-08-29
**Valid until:** ~2026-09-28 for the type-surface findings (stable). **~2026-09-05** for the diagnostic-name and directive-syntax findings — `@effect/tsgo` is at `0.38.0` on a fast release train and `effect` is on an rc train; both `missingEffectContext`'s code (`TS377004`) and the `@effect-diagnostics-next-line` syntax are undocumented-in-README implementation details that could move. Re-run `bash scripts/verify-tsgo-gate.sh` after any bump of either package.
