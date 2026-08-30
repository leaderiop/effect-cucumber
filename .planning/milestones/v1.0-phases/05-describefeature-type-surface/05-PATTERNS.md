# Phase 5: `describeFeature` Type Surface - Pattern Map

**Mapped:** 2026-08-29
**Files analyzed:** 19 new/modified files
**Analogs found:** 19 / 19 (12 exact, 7 role-match)

Every file this phase touches has a precedent in this repo. There is no
"invent it from RESEARCH.md" file in Phase 5 — which is fortunate, because the
two riskiest artifacts (the isolated compile-gate fixture and the gate script
assertion) have byte-level templates already committed and passing CI today.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/vitest/src/Dsl.ts` (new) | model (types-only module) | transform (type-level) | `packages/gherkin/src/StepArgs.ts` | exact |
| `packages/vitest/src/describeFeature.ts` (new) | controller (public API entry, overloaded) | request-response (registration) | `packages/gherkin/src/StepMatcher.ts` `createStepMatcher` | role-match |
| `packages/vitest/src/Registry.ts` (new) | store (per-instance closure state) | event-driven (append-only accumulation) | `packages/gherkin/src/ParameterTypes.ts` `createParameterTypeStore` | exact |
| `packages/vitest/src/Step.ts` (new) | utility (`register` + `Effect.fn` wrap) | transform | `packages/gherkin/src/StepMatcher.ts:274-302` | role-match |
| `packages/vitest/src/index.ts` (modify) | config (barrel) | re-export | `packages/gherkin/src/index.ts` | exact |
| `packages/vitest/test/tsgo-gate/src/step-satisfied.ts` (new) | test (compile-gate positive) | compile-time | `test/tsgo-gate/src/satisfied.ts` | exact |
| `packages/vitest/test/tsgo-gate/src/step-missing-service.ts` (new) | test (compile-gate negative) | compile-time | `test/tsgo-gate/src/missing-layer-context.ts` | exact |
| `packages/vitest/test/tsgo-gate/src/world-undeclared-field.ts` (new) | test (compile-gate negative, plain TS) | compile-time | `test/tsgo-gate/src/missing-layer-context.ts` | exact |
| `packages/vitest/test/tsgo-gate/src/layer-missing-rin.ts` (new) | test (compile-gate negative, Layer arg) | compile-time | `test/tsgo-gate/src/missing-layer-context.ts` | exact |
| `packages/vitest/test/tsgo-gate/src/step-expect-error.ts` (new, optional) | test (compile-gate, suppressed) | compile-time | `packages/gherkin/test/StepArgs.types.ts` negatives block | role-match |
| `packages/vitest/test/tsgo-gate/tsconfig.<case>.json` × N (new) | config | — | `test/tsgo-gate/tsconfig.ok.json` | exact |
| `packages/vitest/test/tsgo-gate/tsconfig.json` (modify — Pitfall 1) | config | — | `test/tsgo-gate/tsconfig.ok.json` | exact |
| `packages/vitest/tsconfig.test.json` (new) | config | — | `packages/gherkin/tsconfig.test.json` | exact |
| `packages/vitest/test/Registry.test.ts` (new) | test (runtime unit) | event-driven state isolation | `packages/gherkin/test/ParameterTypeLifecycle.test.ts` | exact |
| `packages/vitest/test/Step.test.ts` (new) | test (runtime unit) | transform | `packages/gherkin/test/ParameterTypeLifecycle.test.ts` | role-match |
| `packages/vitest/test/Dsl.types.ts` (new, optional) | test (compile-time type test) | type-level | `packages/gherkin/test/StepArgs.types.ts` | exact |
| `scripts/verify-tsgo-gate.sh` (modify) | script (build tooling) | batch assertion | itself, assertions 1 and 4 | exact |
| `spec/behaviors/01-steps-and-world.md` (modify) | config (normative doc) | — | its own BEH-EC-002/003 blocks | exact |
| `spec/invariants.md` (modify — INV-EC-003 wording) | config (normative doc) | — | its own INV-EC-003 block | exact |
| `package.json` (modify — `typecheck:test`) | config | — | existing `typecheck:test` line | exact |

**Not modified:** `.github/workflows/check.yml` — `pnpm typecheck:test` and
`pnpm verify:tsgo-gate` are already required steps in the `types` job
(`.github/workflows/check.yml:55,59`). Extending the script and the npm script
picks up CI coverage with no workflow edit.

**Not modified:** `packages/vitest/package.json` — `effect`, `@effect/vitest`,
`vitest` are already peer+dev, `@effect-cucumber/gherkin` is already a
dependency, and `exports["."]` already points at `./src/index.ts`.

---

## Pattern Assignments

### `packages/vitest/src/Dsl.ts` (model, type-level)

**Analog:** `packages/gherkin/src/StepArgs.ts` — the repo's only other
types-only module: no `const`, no function, zero runtime emit.

**Module doc-comment pattern** (`StepArgs.ts:1-42`) — the established shape is a
long header stating *what is not visible from the code*, with lettered notes
for each non-obvious constraint, and an explicit "do not simplify this"
instruction where a plausible refactor would break it:

```typescript
/**
 * The type-level counterpart of cucumber-expression argument coercion.
 * ...
 * Three things about this module that are not visible from the code.
 *
 * (a) Every entry of `BuiltInParameterTypeMap` was VERIFIED by executing ...
 *
 * (c) The recursion below walks BRACE PAIRS, not characters. A per-character
 *     formulation ... exhausts TypeScript's instantiation depth (`TS2589`) ...
 *     Do not "simplify" it into a character walk.
 *
 * This module contains types only: no `const`, no function, no runtime value at all.
 */
```

Phase 5's two load-bearing orderings (RESEARCH Findings 2 and 6) are exactly
this kind of invisible constraint — write them as lettered notes in this
header, not only as inline comments.

**Per-member doc pattern** (`StepArgs.ts:51-58`) — one `/** ... */` per
interface member, stating the verified fact and, where counterintuitive, why:

```typescript
export interface BuiltInParameterTypeMap {
  /** `{int}` — MATCH-01 names this one by ID. Verified `number`. Does not match `5.5`. */
  readonly int: number
  /** `{float}` — MATCH-01 names this one by ID. Verified `number`, and it also matches integer text (`"v 5"` yields `5`). */
  readonly float: number
```

Apply to `ScenarioDsl` / `BackgroundDsl` / `FeatureDsl` members — in particular
`BackgroundDsl` needs the ADR-EC-017 note on why `When`/`Then` are absent.

**`readonly` on every interface member** — `StepArgs.ts:51-83` and
`StepMatcher.ts:262-272` both mark every property `readonly`. `StepMatcher.ts:262-272`
is the closest structural analog for `FeatureDsl` (an interface whose members
are functions):

```typescript
/** A closed set of step patterns, matchable against a step text. */
export interface StepMatcher<D> {
  /** The entries this matcher was built with, in registration order. */
  readonly entries: ReadonlyArray<StepPatternEntry<D>>
  /**
   * Every entry whose pattern matches `text`, in registration order.
   * ...
   */
  readonly match: (text: string) => ReadonlyArray<StepMatch<D>>
}
```

**Type-only imports** — `.oxlintrc.json:19` enforces
`typescript/consistent-type-imports` with `fixStyle: "inline-type-imports"`, and
`:20` enforces `no-import-type-side-effects`. `Dsl.ts` imports only types, so
every import must be `import type * as X from "effect/X"` (RESEARCH §1 already
writes it this way).

**Reuse `StepArgs<P>` for step parameters** — `StepArgs.ts:100-131` was built
for this phase and says so (`StepArgs.ts:5-7`: *"Phase 5's `Given`/`When`/`Then`
signatures thread it into the step body"*). The `Params extends
ReadonlyArray<any>` form in RESEARCH §1 is the fallback; if the pattern is a
string literal, `StepArgs<P>` is the already-built, already-tested typed form.
`StepArgs.ts:127` names the exact usage shape:

```typescript
type TwoArgumentStepBody = (...args: StepArgs<"I have {int} cukes and {word} left">) => void
```

---

### `packages/vitest/src/describeFeature.ts` (controller, request-response)

**Analog:** `packages/gherkin/src/StepMatcher.ts:274-302` — the repo's pattern
for a public factory that takes a config object and returns a closed surface.

**Factory signature pattern** (`StepMatcher.ts:274-282`):

```typescript
/**
 * Build a matcher over `entries`, compiling every pattern against `registry` on first use.
 *
 * Compiles nothing eagerly — note (c) of the module doc comment.
 */
export const createStepMatcher = <D>(
  args: { registry: ParameterTypeRegistry; entries: ReadonlyArray<StepPatternEntry<D>> }
): StepMatcher<D> => {
  const { entries, registry } = args
```

**Deviation required:** `describeFeature` must be a `function` declaration, not
an arrow const, because RESEARCH Finding 6 requires two *overloads* with the
plain-Layer form declared LAST. Arrow consts cannot carry overload signatures.
This is the one place Phase 5 legitimately departs from the repo's
arrow-const-export habit — say so in the doc comment so a future reader does
not "fix" it.

**Return-value pattern** (`StepMatcher.ts:301`) — build the dsl object literal
and return it directly; no class, no builder:

```typescript
  return { entries, match }
}
```

**Doc-comment cross-reference pattern** (`ParameterTypes.ts:400-411`) — link
the governing ADR by relative path from the source file, and instruct the
reader to read it before editing:

```typescript
/**
 * The `ParameterTypeStore` shape delivered as an ambient `Effect` dependency, ...
 * [ADR-EC-023](../../../spec/decisions/023-parametertypestore-becomes-an-ambient-context-service.md)
 * is the decision record — read it before changing anything here, especially the reasoning
 * behind there being NO internal default baked into `parseFeature`/`loadFeature` themselves.
 */
```

Use for `describeFeature`'s overload-order comment: link
`../../../spec/decisions/003-describefeature-takes-a-layer.md` and
`../../../spec/decisions/016-effect-tsgo-diagnostics-are-a-build-gate.md`.

---

### `packages/vitest/src/Registry.ts` (store, event-driven)

**Analog:** `packages/gherkin/src/ParameterTypes.ts:202-270` —
`createParameterTypeStore`. This is a near-perfect match: a factory returning a
closure over a private mutable array, explicitly designed to *not* be a module
singleton, for the same reason DSL-04 forbids one.

**Factory-over-closure pattern** (`ParameterTypes.ts:202-226`):

```typescript
/**
 * A new, empty store sharing no state with any other store — including
 * `defaultParameterTypeStore`.
 *
 * An append-only collection of custom parameter type definitions, plus the replay that turns
 * them into a registry. There is no `remove` and no `clear`, on purpose: a definition that could
 * be withdrawn would reintroduce exactly the cross-call state (a) exists to eliminate. A caller
 * wanting a different set of definitions creates a different store.
 */
export const createParameterTypeStore = () => {
  const records: Array<ParameterTypeDefinition<unknown>> = []

  const define = <T>(definition: ParameterTypeDefinition<T>): void => {
    const { name } = definition
```

Copy verbatim in structure: `createRegistry = () => { const stack: Array<...> = []; ...; return { push, pop, current } }`.

**Shape-type derivation pattern** (`ParameterTypes.ts:211-213`) — the public
shape type is derived from the factory, never hand-written, so the two cannot
drift:

> *"The returned shape — `ParameterTypeStoreShape`, defined right below as
> `ReturnType<typeof createParameterTypeStore>` rather than a hand-written
> interface, so the two can never drift apart"*

Apply: `export type RegistryShape = ReturnType<typeof createRegistry>`.

**Inline "why this choice, not the obvious one" comments**
(`ParameterTypes.ts:243-245`, `:228-230`):

```typescript
    // FIRST, and this ordering matters: it is what rejects the anonymous empty-string name too,
    // and what guarantees the built-in message wins over the duplicate one for a name that is
    // both.

    // Searches `records` directly rather than a parallel name->site map: the store never holds
    // more than a handful of definitions, and a second structure kept in sync by hand is a second
    // place for `define` and this check to silently drift apart.
```

---

### `packages/vitest/src/Step.ts` (utility, transform)

**Analog:** `packages/gherkin/src/StepMatcher.ts:279-302` for the export shape;
no exact analog exists for the `isGeneratorFn` runtime discriminator (it is new
behavior). RESEARCH Finding 7 supplies the implementation; this repo supplies
the *style*.

**Exported arrow-const with explicit return type** — used uniformly across
`packages/gherkin/src`:

```typescript
export const createStepMatcher = <D>(
  args: { registry: ParameterTypeRegistry; entries: ReadonlyArray<StepPatternEntry<D>> }
): StepMatcher<D> => {
```

`ParameterTypes.ts:398` shows the one-liner form with an explicit annotation:

```typescript
export const buildParameterTypeRegistry = (): ParameterTypeRegistry => defaultParameterTypeStore.buildRegistry()
```

**Explicit return-type annotations are not optional here** — `tsconfig.base.json`
sets `composite: true` for package projects, and RESEARCH Finding 10 records
that declaration emit demands explicit annotations on anything exported
(`static readonly layer: Layer.Layer<World> = ...`, not the inferred form).

**Local helper placement** — helpers live at module scope above their use, with
their own doc comment (`ParameterTypes.ts` `describeName`/`locationOf`/`fail`,
`StepMatcher.ts:172` `compileExpression`). Put `isGeneratorFn` there, not inside
`register`.

---

### `packages/vitest/src/index.ts` (config, barrel — MODIFY)

**Analog:** `packages/gherkin/src/index.ts` — the repo's one existing barrel.

**Header pattern** (`gherkin/src/index.ts:1-57`) — a long module doc comment that
explains what the package *does* as prose, then states the export policy and
what is deliberately NOT exported:

```typescript
/**
 * Public entry point for `@effect-cucumber/gherkin`.
 * ...
 * This is a single barrel and there is no subpath export. A subpath has to be added to BOTH
 * `exports` and `publishConfig.exports` in `package.json` or it resolves locally and 404s for
 * consumers, so one entry point is the shape that cannot drift.
 *
 * `Parser`, `Pickles`, `Correlate`, `Source` and `Validate` are deliberately NOT exported. They
 * are pipeline stages with no standalone contract; the package's own tests import them by
 * relative path.
 */
```

**Grouped re-export pattern with per-group doc comments**
(`gherkin/src/index.ts:59-99`) — value exports and type exports are separate
statements, `.ts` extension is explicit, and each group carries a short
rationale:

```typescript
export { loadFeature, parseFeature } from "./loadFeature.ts"

export { LoadFeatureError } from "./Errors.ts"
export type { LoadFeatureErrorReason, LoadFeatureWarning, LoadFeatureWarningReason } from "./Errors.ts"

/** Step matching: compile patterns against a registry and find EVERY entry matching a step text. */
export { compileExpression, createStepMatcher } from "./StepMatcher.ts"
export type { StepMatch, StepMatcher, StepPatternEntry } from "./StepMatcher.ts"
```

**Retire the placeholder deliberately.** The current
`packages/vitest/src/index.ts:1-13` re-exports `Gherkin.packageName` purely to
exercise the project reference, and `packages/gherkin/src/index.ts:139-148`
documents that contract from the other side:

```typescript
/**
 * Internal build-graph exports, not public API.
 *
 * `packages/vitest/src/index.ts` reads `Gherkin.packageName` and `Gherkin.PackageName` so that
 * the cross-package project reference is exercised by `tsc -b`. Removing either one fails the
 * CI `types` job. Phase 5 owns that file and will retire both when it lands a real surface.
 */
export const packageName = "@effect-cucumber/gherkin" as const
export type PackageName = typeof packageName
```

Phase 5 must either keep the reference exercised via the real `ParsedFeature`
type import (it will be) **and** update this comment block in
`packages/gherkin/src/index.ts`, or leave both exports in place. Do not silently
orphan the comment — AGENTS.md §4.

---

### `packages/vitest/test/tsgo-gate/src/*.ts` (test, compile-gate fixtures)

**Analogs:** `test/tsgo-gate/src/satisfied.ts` (positive),
`test/tsgo-gate/src/missing-layer-context.ts` (negative). Both are 13 lines.
D-01 locks this template.

**Positive-fixture pattern** (`satisfied.ts`, complete file):

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

class Dep extends Context.Service<Dep, { readonly n: number }>()("Dep") {}
class Svc extends Context.Service<Svc, { readonly m: number }>()("Svc") {}

const depLayer = Layer.succeed(Dep, { n: 1 })
const svcLayer = Layer.effect(Svc, Effect.map(Dep, (d) => ({ m: d.n })))

export const merged: Layer.Layer<Svc> = Layer.provide(svcLayer, depLayer)

export const run: Effect.Effect<number, never, Svc> = Effect.map(Svc, (s) => s.m)
```

Note: no module doc comment, no header ceremony, submodule namespace imports,
inline service declarations, exported top-level bindings (so nothing is
unused-and-elided). Every new fixture copies this shape.

**Negative-fixture pattern** (`missing-layer-context.ts`, complete file) — the
*only* addition over the positive fixture is a comment block above the offending
line explaining what the mistake is and why catching it is the product:

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

class Dep extends Context.Service<Dep, { readonly n: number }>()("Dep") {}
class Svc extends Context.Service<Svc, { readonly m: number }>()("Svc") {}

const svcLayer = Layer.effect(Svc, Effect.map(Dep, (d) => ({ m: d.n })))

// `svcLayer` is `Layer<Svc, never, Dep>` — `Dep` is unprovided. Annotating it
// as `Layer<Svc>` is exactly the mistake this project must catch at authoring
// time: a Scenario whose ambient Layer does not provide what a step needs.
export const merged: Layer.Layer<Svc> = Layer.merge(svcLayer, Layer.empty)
```

**Add one line the existing fixtures lack:** a header stating the asserted
outcome, so a reader knows which assertion owns the file. RESEARCH §2 models it:

```typescript
// MUST NOT COMPILE. Asserted by scripts/verify-tsgo-gate.sh:
//   exit != 0  AND  output contains "effect(missingEffectContext)"
```

**Service-declaration duplication is the precedent, not a smell.** `satisfied.ts:5-6`
and `missing-layer-context.ts:5-6` declare identical `Dep`/`Svc` classes rather
than sharing a helper. RESEARCH Open Question 2 reaches the same conclusion for
`World`/`Db`. Follow it — `files: [single-file]` makes a shared helper require
editing every config.

**Fixtures are lint-exempt but not format-exempt.** `.oxlintrc.json:13` lists
`packages/vitest/test/tsgo-gate` under `ignorePatterns`, so `oxlint` never sees
them — but `pnpm lint` is `oxlint -f unix && dprint check`, and `dprint.json`
does not exclude the directory. New fixtures must still be `dprint fmt`-clean.

**Never begin a comment line with `@ts-`** (RESEARCH Finding 12) — TypeScript
matches directives by prefix, so prose starting with `@ts-` becomes a live
directive. Write "a `@ts-expect-error` fixture", backticked and not
line-initial.

---

### `packages/vitest/test/tsgo-gate/tsconfig.<case>.json` (config)

**Analog:** `test/tsgo-gate/tsconfig.ok.json` (complete file, 5 lines):

```json
{
  "extends": "./tsconfig.json",
  "include": [],
  "files": ["src/satisfied.ts"]
}
```

`tsconfig.floating.json` is byte-identical but for the `files` entry. One
config per fixture, no other keys.

**Parent config** (`test/tsgo-gate/tsconfig.json`, complete file) — carries the
`composite: false` / `noEmit: true` isolation that keeps these out of `tsc -b`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "incremental": false,
    "noEmit": true
  },
  "include": ["src"]
}
```

**MODIFY this file first (RESEARCH Pitfall 1).** `"include": ["src"]` means
`NEG_CONFIG` compiles *every* file in `src/`, so new fixtures leak into
assertion 4. Change to `"include": []` + `"files": ["src/missing-layer-context.ts"]`
— matching its two siblings — as its own task, **before** adding any fixture.
`bash scripts/verify-tsgo-gate.sh` passes all four assertions today; that is the
known-green baseline the refactor must preserve.

**Do not add any new config to the root `tsconfig.json` `references` array**
(`tsconfig.json:1-7` lists only `packages/gherkin` and `packages/vitest`).

---

### `packages/vitest/tsconfig.test.json` (config, new)

**Analog:** `packages/gherkin/tsconfig.test.json` (complete file). Every comment
in it is load-bearing and explains an override that would otherwise look like
cruft — copy the comments, not just the keys:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // Check-but-do-not-emit, and stay outside the solution build: `tsc -b`
    // covers packages/gherkin/tsconfig.json's `include: ["src"]` only, so
    // test files are transpiled-not-checked by vitest. This config is run
    // explicitly by `pnpm typecheck:test`, never by `tsc -b`, and is NOT in
    // the root tsconfig.json `references` array.
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "incremental": false,
    "noEmit": true,
    // The base sets `${configDir}/src`, which would reject every file under test/.
    "rootDir": "${configDir}",
    // The base sets `types: []`; the test files use node:fs, node:url,
    // import.meta.url and URL.
    "types": ["node"],
    // The base sets "force", which makes EVERY file a module ...
    "moduleDetection": "auto"
  },
  // src is included too, so the tests type-check against the real source rather
  // than against emitted declarations.
  "include": ["src", "test"]
}
```

**Two required deviations for `packages/vitest`:**
1. Add `"exclude": ["test/tsgo-gate"]` — the deliberately-failing fixtures would
   otherwise break `typecheck:test` (RESEARCH Pitfall 2 / Assumption A4).
2. `"types": ["node"]` only if the vitest tests actually reach for node globals;
   `packages/vitest/tsconfig.json:1-6` currently sets no `types` override,
   unlike `packages/gherkin/tsconfig.json:3-5`.

**Paired script change** (`package.json:16`, current single-project form):

```json
    "typecheck:test": "tsc --noEmit -p packages/gherkin/tsconfig.test.json",
```

Extend to run both projects. Keep it as one `scripts` entry — CI calls
`pnpm typecheck:test` by name at `.github/workflows/check.yml:55`.

---

### `packages/vitest/test/Registry.test.ts` (test, runtime unit)

**Analog:** `packages/gherkin/test/ParameterTypeLifecycle.test.ts` — same
proposition in a different package: *state built per call shares nothing across
calls, and reference inequality is the only assertion that catches a memoized
regression.*

**Header pattern** (`ParameterTypeLifecycle.test.ts:1-27`) — names the criterion
being proven, states why this file exists rather than the unit tests around it,
and documents the import rule:

```typescript
/**
 * MATCH-02 (roadmap success criterion 2) end to end, through the REAL `loadFeature`.
 * ...
 * ## Imports
 *
 * `../src/*.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package` runs
 * with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`.
 */
```

This rule is live — `.oxlintrc.json:26-34` sets
`effect/no-import-from-barrel-package` with `checkRelativeIndexImports: true`.
`packages/vitest/test/*.test.ts` must import `../src/Registry.ts`, never
`../src/index.ts`.

**Import block** (`ParameterTypeLifecycle.test.ts:28-38`) — namespace imports for
`effect/*`, named import from `vitest`, explicit `.ts` extensions on relative
imports, inline `type` modifier:

```typescript
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import { createParameterTypeStore, ParameterTypeStore, type ParameterTypeStoreShape } from "../src/ParameterTypes.ts"
```

**The load-bearing assertion pattern** (`ParameterTypeLifecycle.test.ts:139-147`) —
this is the exact test DSL-04 needs, one package over:

```typescript
  it("hands the two calls two DIFFERENT registry objects", async () => {
    const storeLayer = ParameterTypeStore.layerOf(storeWithMoney())
    const featureA = await load(fixtureA, storeLayer)
    const featureB = await load(fixtureB, storeLayer)

    // Reference inequality, and nothing weaker. A memoized registry passes every other assertion
    // in this file; this is the only one it fails.
    expect(featureA.parameterTypes).not.toBe(featureB.parameterTypes)
  })
```

For DSL-04: build two `Registry` instances, mutate one, and assert both
`expect(a).not.toBe(b)` **and** that the mutation is invisible in the other.
Reference inequality alone does not prove state isolation for a closure that
reads a module-level array.

**`describe` title pattern** — full-sentence propositions, not identifiers:
`describe("a custom parameter type defined once resolves in two separate loadFeature calls", ...)`,
`describe("the default store path", ...)`. `.oxlintrc.json:25` enables
`vitest/no-identical-title` at error level.

**For `Step.test.ts`** the same analog applies, with one extra note: RESEARCH
Finding 7 wants `register(pattern, alreadyWrapped) === alreadyWrapped` asserted
as *identity*, which in this repo's idiom is `expect(...).toBe(...)` with a
comment saying why a weaker check would pass a broken implementation — exactly
the comment style at `:144-145` above.

---

### `packages/vitest/test/Dsl.types.ts` (test, compile-time type test — optional)

**Analog:** `packages/gherkin/test/StepArgs.types.ts` — the repo's existing
compile-time type-test file, and the precedent for the `@ts-expect-error`
negative idiom the roadmap's success criterion 1 asks for.

**The `.types.ts` suffix is load-bearing** (`StepArgs.types.ts:1-12`):

```typescript
/**
 * The MATCH-01 type test: ... asserted at COMPILE TIME, which is the only place the claim exists.
 *
 * The `.types.ts` suffix is load-bearing. vitest's default include glob is
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, so this file is never collected as a suite — renaming it
 * to `StepArgs.test.ts` would make `pnpm test` fail with "No test suite found". Meanwhile
 * `packages/gherkin/tsconfig.test.json` has `include: ["src", "test"]`, so `pnpm typecheck:test`
 * — a required step in `.github/workflows/check.yml`'s `types` job since plan 01-06 — compiles
 * it on every push.
 */
```

**Exact-equality helper** (`StepArgs.types.ts:35-41`) — copy verbatim; the
comment explains why assignability would be vacuous:

```typescript
/**
 * Exact type equality. The two conditional types are only mutually assignable when `A` and `B`
 * are identical to the checker, which is stricter than `A extends B && B extends A` — the latter
 * cannot tell `unknown` from `unknown | string`, and treats `any` as equal to everything.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

declare function equality<A, B>(): Equals<A, B>

const expectTrue = (verdict: true): true => verdict
```

**One named const per assertion, so a failure names itself**
(`StepArgs.types.ts:47-48`):

```typescript
/** MATCH-01: `{int}` coerces to `number`. */
export const intIsNumber = expectTrue(equality<StepArgs<"I have {int} cukes">, [number]>())
```

**Negatives block** (`StepArgs.types.ts:132-145`) — `declare const` above,
one-line `@ts-expect-error` with a plain-English reason:

```typescript
//
// Negative assertions. `@ts-expect-error` fails the build when the expected error stops
// occurring, which is what makes the positives above non-vacuous.
//

declare const intArguments: StepArgs<"I have {int} cukes">

// @ts-expect-error {int} resolves to number, never to string
export const intIsNotString: [string] = intArguments
```

**Critical divergence for Phase 5:** this idiom works for `StepArgs` because
those are plain `TS2xxx` errors. RESEARCH Finding 3 proves `@ts-expect-error`
does **not** suppress `@effect/tsgo` diagnostics — a `describeFeature` negative
written this way exits 1 on `TS377004`. If a `.types.ts` file is used for the
DSL, it must either avoid Effect-diagnostic-producing assertions or stack
`// @effect-diagnostics-next-line missingEffectContext:off` as the line
*immediately above* the code. The exit-code fixture in `tsgo-gate/` remains the
primary DSL-01 proof.

**Anti-vacuity note** (`StepArgs.types.ts:25-26`) — quote this into whatever
Phase 5 writes:

> *"Nothing in this file may be widened with a type assertion: one such escape
> hatch anywhere makes the surrounding equality assertion prove nothing."*

---

### `scripts/verify-tsgo-gate.sh` (script — MODIFY)

**Analog:** itself. Assertions 1 and 4 are the exact templates for the new
positive and negative assertions.

**Config-constant block** (`verify-tsgo-gate.sh:25-32`) — paths spelled out in
full, with the reason:

```bash
# Spelled out in full rather than composed from a $FIXTURE variable, so these
# paths are greppable for traceability checks.
NEG_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.json"
OK_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.ok.json"
FLOATING_CONFIG="packages/vitest/test/tsgo-gate/tsconfig.floating.json"

# Use the repo-local, effect-tsgo-patched compiler, never a global `tsc`.
TSC="node node_modules/typescript/bin/tsc"
```

Add new `*_CONFIG` constants the same way, and add each to the existence loop at
`:43-45`:

```bash
for f in "$NEG_CONFIG" "$OK_CONFIG" "$FLOATING_CONFIG"; do
  [[ -f "$f" ]] || fail "missing fixture config $f — the gate fixture is absent, so nothing was verified."
done
```

**Positive-assertion template** (`verify-tsgo-gate.sh:47-57`) — banner comment
stating what the assertion discriminates, capture-with-exit-code idiom, echo the
output before failing, `✓` line on success:

```bash
# ---------------------------------------------------------------------------
# Assertion 1: the positive control compiles clean.
# Discriminates a working gate from one that simply always fails.
# ---------------------------------------------------------------------------
OK_OUTPUT="$($TSC -p "$OK_CONFIG" 2>&1)" && OK_EXIT=0 || OK_EXIT=$?

if [[ "$OK_EXIT" -ne 0 ]]; then
  echo "$OK_OUTPUT"
  fail "positive control failed to compile — the gate fixture is broken, not the gate."
fi
echo "✓ positive control (satisfied.ts) compiles clean"
```

**Negative-assertion template** (`verify-tsgo-gate.sh:101-117`) — exit code
first, *then* the named diagnostic. Both checks, never one:

```bash
# ---------------------------------------------------------------------------
# Assertion 4: the Layer-context guarantee specifically.
# This is the diagnostic the whole project depends on: a Layer with an
# unhandled requirement must be rejected at authoring time.
# ---------------------------------------------------------------------------
NEG_OUTPUT="$($TSC -p "$NEG_CONFIG" 2>&1)" && NEG_EXIT=0 || NEG_EXIT=$?

if [[ "$NEG_EXIT" -eq 0 ]]; then
  echo "$NEG_OUTPUT"
  fail "the negative fixture compiled successfully — a Layer with an unprovided requirement was accepted."
fi

if ! grep -q "effect(missingLayerContext)" <<<"$NEG_OUTPUT"; then
  echo "$NEG_OUTPUT"
  fail "build failed, but not for the Layer-context reason — check whether the diagnostic was renamed or downgraded."
fi
echo "✓ an unprovided Layer requirement is rejected by name: effect(missingLayerContext)"
```

**Failure-message style** — every `fail` string names (a) what was observed,
(b) what it means, (c) the most likely cause and where to look. RESEARCH §6
already drafts Phase 5's in this voice; keep it.

**Do NOT copy the `missingLayerContext` grep into the step fixture's assertion.**
RESEARCH Finding 1: a step needing an unprovided service fires
`effect(missingEffectContext)` (`TS377004`), not `missingLayerContext`
(`TS377034`). The `world-undeclared-field` fixture fires plain `TS2339` and must
**not** be grepped for `effect(` at all.

**Method-note header** (`verify-tsgo-gate.sh:10-16`) — the script already
carries a "do not weaken this" block. Extend it, do not replace it:

```bash
# METHOD NOTE (do not weaken this):
#   Grepping compiler output for `effect(...)` does NOT prove the gate. With
#   `ignoreEffectErrorsInTscExitCode: true`, tsc still PRINTS every Effect
#   diagnostic verbatim and exits 0. Output is byte-identical either way. The
#   only signal that distinguishes an enforced gate from advisory commentary
#   is the EXIT CODE of a file whose sole defect is an Effect diagnostic.
```

---

### `spec/behaviors/01-steps-and-world.md` (config, normative doc — MODIFY)

**Analog:** the file's own BEH-EC-002 block (`:66-84`), which is what the
corrections replace:

```markdown
## BEH-EC-002: `describeFeature` takes a Layer

> **Invariant:** [INV-EC-003](../invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides)
> **See:** [ADR-EC-003](../decisions/003-describefeature-takes-a-layer.md)

```ts
export const describeFeature: <R, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<R, E, never> | { shared: Layer.Layer<any, any, never>; perScenario: Layer.Layer<R, E, never> },
  define: (dsl: FeatureDsl<R>) => void
) => void
```

```
REQUIREMENT: A step defined inside `define` whose Effect requires an `R` not
             provided by `layer` MUST fail to compile. It MUST NOT be
             possible for such a step to reach runtime and fail with a
             "service not found" error instead.
```
```

**Structure to preserve exactly:** `##` heading with the behavior ID, a
blockquote of `> **Invariant:**` / `> **See:**` relative links, a ` ```ts `
signature fence, then an unfenced-language ` ``` ` block containing the
`REQUIREMENT:` prose with hanging indentation. AGENTS.md §2 makes the fence
language load-bearing: ` ```ts ` is a non-compiled signature listing — keep the
corrected signatures in ` ```ts `, and any worked example in ` ```typescript `.

**BEH-EC-003's block** (`:86-98`) is the second correction site — replace
`StepFn<Params extends unknown[], A, E, R>` +
`((...params: Params) => Generator<any, A, any>)` with the `StepRegistrar<ROut>`
shape (RESEARCH Findings 2 and 4), generator branch first.

**BEH-EC-004** (`:106-119`) is DSL-03's home and needs no signature change — but
per AGENTS.md §4 its status prose must stop saying "planned" once the surface
exists.

**INV-EC-003 wording** (`spec/invariants.md:50-62`) — current text:

```markdown
## INV-EC-003: A step's Effect can only use services the ambient Layer provides

A `Given`/`When`/`Then` written inside a `Rule` or `Scenario` that requires a
service not present in that scope's Layer fails to compile — it is never a
runtime "service not found."

**Source (planned)**: TypeScript's structural checking of a step's
`Effect<A, E, R>` against the `R` the enclosing `describeFeature`/`Rule`/
`Scenario` Layer parameter actually provides, backed by a second, type-aware
enforcement mechanism: `@effect/tsgo`'s `missingLayerContext`/
`missingEffectContext` diagnostics, wired to fail the build (see
[ADR-EC-016](decisions/016-effect-tsgo-language-service-plugin.md)) rather
than relying on structural typing alone.
```

Two edits: amend the claim to hold *"for step bodies free of `any`"*
(RESEARCH Pitfall 5 / PITFALLS #6), and drop `(planned)` from `**Source
(planned)**` now that the mechanism exists.

**Traceability:** `pnpm verify:spec` (`spec/scripts/verify-traceability.sh`,
wired at `.github/workflows/check.yml:102`) checks index.yaml ↔ disk, every
invariant and decision traced, and no broken relative links. Any new ADR
(RESEARCH C6 suggests ADR-EC-026 if the spec corrections are judged decisions)
must be added to `spec/behaviors/index.yaml` / `spec/traceability.md` in the
same change, or that job fails.

---

## Shared Patterns

### Submodule namespace imports
**Source:** `AGENTS.md:50-58`, `packages/vitest/test/tsgo-gate/src/satisfied.ts:1-3`
**Apply to:** every new `src/` and fixture file
```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
```
Also mechanically enforced by the tsgo plugin's `namespaceImportPackages`
setting in `tsconfig.base.json` and by `effect/no-import-from-barrel-package`
(`.oxlintrc.json:26-34`).

### Type-only imports carry the `type` modifier
**Source:** `.oxlintrc.json:19-20`, `packages/gherkin/test/ParameterTypeLifecycle.test.ts:36-37`
**Apply to:** every file importing a type
```typescript
import type { ParameterTypeRegistry } from "../src/Model.ts"
import { createParameterTypeStore, ParameterTypeStore, type ParameterTypeStoreShape } from "../src/ParameterTypes.ts"
```
`consistent-type-imports` is configured with `fixStyle: "inline-type-imports"`,
so a mixed value/type import uses the inline `type` modifier rather than a
second statement.

### Relative imports carry the explicit `.ts` extension, never `.js`
**Source:** `packages/gherkin/src/index.ts:59-137`, `.oxlintrc.json:35`
(`effect/no-js-extension-imports`)
**Apply to:** every relative import in `src/` and `test/`
```typescript
export { loadFeature, parseFeature } from "./loadFeature.ts"
```

### Never import a barrel by relative path
**Source:** `packages/gherkin/test/ParameterTypeLifecycle.test.ts:22-27`, `.oxlintrc.json:33`
**Apply to:** every file under `packages/vitest/test/` that is not a tsgo-gate
fixture
> *"`../src/*.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package`
> runs with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative
> value-import whose basename is `index.*`."*

The tsgo-gate fixtures are the exception — they should import
`@effect-cucumber/vitest` by package name (self-reference resolves through
`packages/vitest/package.json`'s `exports["."]` → `./src/index.ts`), which is
also what a real consumer writes.

### `Context.Service` construction
**Source:** `packages/gherkin/src/ParameterTypes.ts:412-425`, `packages/vitest/test/tsgo-gate/src/satisfied.ts:5-6`
**Apply to:** every `World`/`Db` declaration in a fixture (ADR-EC-002)
```typescript
export class ParameterTypeStore
  extends Context.Service<ParameterTypeStore, ParameterTypeStoreShape>()("@effect-cucumber/gherkin/ParameterTypeStore")
{
  /** Wrap any `ParameterTypeStoreShape` ... as a provide-able Layer. */
  static readonly layerOf = (store: ParameterTypeStoreShape): Layer.Layer<ParameterTypeStore> =>
    Layer.succeed(ParameterTypeStore, ParameterTypeStore.of(store))

  static readonly Default: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.layerOf(defaultParameterTypeStore)
}
```
Note the **explicit `Layer.Layer<T>` annotation on every static** — RESEARCH
Finding 10 records that `composite: true` demands it for anything exported. The
short fixture form (`satisfied.ts:5-6`) drops the body entirely when no static
layer is needed:
```typescript
class Dep extends Context.Service<Dep, { readonly n: number }>()("Dep") {}
```

### Comment style: state the invisible constraint, name the plausible wrong fix
**Source:** `packages/gherkin/src/StepArgs.ts:31-34`, `packages/gherkin/src/ParameterTypes.ts:243-245`,
`packages/gherkin/tsconfig.test.json:20-23`, `scripts/verify-tsgo-gate.sh:10-16`
**Apply to:** every ordering constraint, every override, every assertion in this phase
```
// The base sets "force", which makes EVERY file a module — that would turn
// test/feature-raw.d.ts's `declare module "*.feature?raw"` into a module
// AUGMENTATION of a non-existent module ... Do not "clean up" this override.
```
This repo consistently pairs a constraint with the specific refactor that would
break it. Phase 5's two ordering rules (step-union generator-branch-first,
plain-Layer-overload-last) are precisely this genre and must be commented this
way — RESEARCH Finding 2 calls a silent reorder "the single most dangerous
finding in this phase."

### Verification-script gate structure
**Source:** `scripts/verify-tsgo-gate.sh` (whole file), `package.json:18-22`,
`.github/workflows/check.yml:56-59`
**Apply to:** any new or extended gate script
`set -euo pipefail` → `ROOT_DIR`/`cd` → spelled-out config constants → `fail()`
helper → existence loop → numbered assertion blocks with banner comments →
final `echo "tsgo gate: ENFORCED"`. Registered as a `verify:*` entry in the root
`package.json` `scripts`, invoked by name from `.github/workflows/check.yml`.

---

## No Analog Found

None. Every file has at least a role-match analog in this repo.

Two *sub-patterns* within otherwise-analogous files are genuinely new and must
come from RESEARCH rather than from an existing file:

| Sub-pattern | Home file | Source |
|-------------|-----------|--------|
| Function-declaration **overloads** with the plain-Layer form declared last | `packages/vitest/src/describeFeature.ts` | RESEARCH Finding 6 + Code Examples §1. No existing file in this repo uses TypeScript overloads; every export is an arrow const. |
| `isGeneratorFn` runtime discrimination before `Effect.fn` wrapping | `packages/vitest/src/Step.ts` | RESEARCH Finding 7 + "Don't Hand-Roll". No precedent — nothing in `packages/gherkin` wraps a user-supplied function. |
| Stacked `@ts-expect-error` + `@effect-diagnostics-next-line` suppression | `test/tsgo-gate/src/step-expect-error.ts` (optional fixture) | RESEARCH Finding 3(A). `StepArgs.types.ts` uses bare `@ts-expect-error`, which is insufficient against Effect diagnostics. |

## Metadata

**Analog search scope:** `packages/vitest/`, `packages/gherkin/src/`,
`packages/gherkin/test/`, `scripts/`, `spec/behaviors/`, `spec/invariants.md`,
`.github/workflows/`, root config files
**Files scanned:** 24 read in full or by targeted range
**Pattern extraction date:** 2026-08-29
