# Phase 10: Layer Scopes (per-Scenario default + `shared`) - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 11 (5 core runtime modules, 3 docs, 1 test file, 1 new script, 1 new type-test)
**Analogs found:** 10 / 11 (one file — the script's fixture — has no clean existing analog; see "No Analog Found")

This is a **modify-in-place phase**, not a greenfield one: every runtime file already exists and
already has the seam Phase 10 wires up. There is no new module to create for the runtime fix itself.
The only genuinely NEW files are `scripts/verify-shared-layer-once.sh` and one `.types.ts` case (and
possibly its fixture). For every MODIFY target, the "closest analog" is overwhelmingly **the file
itself** — its own established conventions, cited by line — plus one or two sibling modules for the
specific sub-pattern being introduced (dual-provisioning branch, `@effect/vitest` `layer()` usage,
`.types.ts` shape).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/vitest/src/describeFeature.ts` | composition-root / controller | request-response (registration) | itself (`normalizeLayer`, `collect`, `vitestTestApi`) | exact — self |
| `packages/vitest/src/TestApi.ts` | interface / seam (middleware-like) | request-response | itself | exact — self |
| `packages/vitest/src/Runner.ts` | emitter / controller | event-driven (emission walk) | itself (`emitFeature`) | exact — self |
| `packages/vitest/src/ScenarioEffect.ts` | service (Effect builder) | transform | itself (`buildScenarioEffect`) | exact — self |
| `packages/vitest/src/index.ts` | barrel / doc | none | itself (doc comment only) | exact — self |
| `packages/vitest/README.md` | doc | none | itself + `spec/decisions/018-shared-layer-testclock-isolation.md`'s code sketch | exact — self |
| `spec/overview.md` (+ possibly `spec/behaviors/03-rules-outlines-and-testclock.md`) | doc | none | itself | exact — self |
| `packages/vitest/test/emission.test.ts` | test (real end-to-end run) | event-driven | itself (existing hook/Rule-composition blocks) | exact — self |
| `scripts/verify-shared-layer-once.sh` (NEW) | test / verification script | batch (CLI subprocess) | `scripts/verify-tags-filter.sh` | exact — same role, same "prove it with a real CLI run" data flow |
| `<new>.types.ts` (NEW, e.g. `packages/vitest/test/SharedLayerConstraint.types.ts`) | test (compile-time only) | transform (type-level) | `packages/gherkin/test/StepArgs.types.ts` | exact — same role, same data flow |
| Fixture Feature/test-file for the script (NEW) | fixture | file-I/O / batch | `packages/vitest/test/emission.test.ts`'s inline `parseFeature(...)` idiom | role-match, no exact precedent (see "No Analog Found") |

## Pattern Assignments

### `packages/vitest/src/describeFeature.ts` (composition root — MODIFY)

**Analog:** itself. This file already contains every seam Phase 10 needs; the work is extending
`LayerArgument`'s handling, not inventing a new shape.

**The type this phase must stop collapsing** (lines 134–136, 392–393):
```typescript
type LayerArgument =
  | Layer.Layer<any, any, never>
  | { readonly shared: Layer.Layer<any, any, never>; readonly perScenario: Layer.Layer<any, any, never> }

const normalizeLayer = (layer: LayerArgument): Layer.Layer<any, any, never> =>
  "perScenario" in layer ? Layer.merge(layer.shared, layer.perScenario) : layer
```
`normalizeLayer` currently ALWAYS collapses both forms into one `Layer.merge` result, which is
exactly the "both built per Scenario" behavior D-04/RUN-03 exists to stop for the `shared` half. The
join point that needs the new branch is `collect()` (line 433 onward), specifically where
`featureLayer = normalizeLayer(layer)` is computed (line 455) and where `FeatureCollection.layer`
(line 191, 709) is populated — the collection currently exposes ONE merged Layer field; carrying the
shared/perScenario split further downstream (into `emitFeature`) is the open architecture question
ARCHITECTURE.md Pattern 4 and CONTEXT.md's "Integration Points" section flag for research/planning to
resolve concretely. `FeatureCollection`'s own doc-comment precedent for adding a field at a join seam
(rather than recomputing downstream) is `Model.ts:193-205`'s `ParsedFeature extends ParsedFeatureCore`
split — cited directly in CONTEXT.md.

**The seam this phase's whole job is to use** (note (e), lines 57–90, factory at 355–379):
```typescript
const vitestTestApi = (featureUri: string): TestApi => ({
  describe,
  effect: (name, self, options) => {
    try {
      it.effect(name, self, { tags: [...options.tags], skip: options.skip })
    } catch (cause) { /* D-08 catch-and-degrade, re-emit untagged */ }
  }
})
```
This is the ONLY module permitted to import a test framework (`import { describe, it } from
"@effect/vitest"`, line 96) and the ONLY place a concrete `TestApi` is constructed
(`pnpm verify:testapi-seam` enforces it). Phase 10 passes a SECOND, different `TestApi` through this
same seam for the `shared` path — the `it` that `@effect/vitest`'s `layer(sharedLayer, {
excludeTestServices: true })(name, (it) => …)` hands its callback (`ARCHITECTURE.md` Pattern 3). That
second `TestApi` must be built here too, following `vitestTestApi`'s own shape (an object literal
satisfying `describe` + `effect`, with the identical D-08 try/catch degrade wrapped around whichever
`it.effect` it closes over) — see `TestApi.ts`'s pattern assignment below for the interface it must
satisfy.

**D-04's `shared: Layer<R, never, never>` type constraint** (Pitfall 27, this phase's own decision
D-04) is a NEW type-level restriction on the plain-Layer-vs-object-form overloads
(`collectFeature`/`describeFeature`, lines 767–850). It narrows the `shared` field's signature in the
object-form overload only — `perScenario` stays as permissive as it is today. This is an overload/type
change, not a runtime branch; `describeFeature.ts` note (a)'s overload-ordering rule (LAST overload is
what TypeScript reports against) applies unchanged and must be re-verified against `pnpm
verify:tsgo-gate` if the constraint changes which overload a call site resolves against.

**Note (d)'s merge-order rule stays true after this phase** (lines 50–55): `Layer.merge(shared,
perScenario)`'s argument order — second wins a collision — must still hold for whichever downstream
consumer resolves the two Layers, even if they are no longer merged into one value inside
`normalizeLayer` itself.

---

### `packages/vitest/src/TestApi.ts` (the injection seam — MODIFY, if at all)

**Analog:** itself — the interface is very likely UNCHANGED in shape (two members: `describe` +
`effect`), because both the module-level `it`/`describe` pair and the `layer(...)`-callback's `it`
already satisfy it structurally (`ARCHITECTURE.md` Pattern 3 states this explicitly: "a Vitest
`MethodsNonLive<R>`... has no `describe` member" is the ONE gap — see the Runner.ts pattern below).

**Full interface, current state** (lines 130–169):
```typescript
export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
}
```

**Load-bearing constraint that must not be violated by whatever Phase 10 adds** (note (a), lines
11–25): "No import from `vitest` or `@effect/vitest` may ever appear in this file — not even an
`import type`." `pnpm verify:testapi-seam` greps this structurally. Any change here must stay
framework-free; the framework-specific `layer(...)` call belongs in `describeFeature.ts` only.

**The gap Runner.ts must resolve, not TestApi.ts**: `@effect/vitest`'s `layer(shared, {
excludeTestServices: true })` callback receives a `Vitest.MethodsNonLive<R>` (confirmed against the
installed `@effect/vitest@4.0.0-rc.112` type declarations — see below), which has an `effect` member
but NO `describe` member. `TestApi.describe` therefore cannot be satisfied directly from inside that
callback for Rule nesting; this is explicitly called out in CONTEXT.md's Integration Points as an open
implementation question left to research/planning ("how the shared-Layer's own describe-opening
behavior nests with Runner.ts's existing describe(feature.name, ...) / per-Rule describe(rule.name,
...) calls").

**Verified `@effect/vitest@4.0.0-rc.112` shapes** (read directly from the installed package's
`dist/index.d.ts`, not assumed):
```typescript
// Vitest.MethodsNonLive<R> — no `describe` member:
interface MethodsNonLive<R = never> extends API {
  readonly effect: Vitest.Tester<R | Scope.Scope>
  readonly flakyTest: <A, E, R2>(self: Effect.Effect<A, E, R2 | Scope.Scope>, timeout?: Duration.Input) => Effect.Effect<A, never, R2>
  readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: { readonly timeout?: Duration.Input }) => { ... }
  readonly prop: ...
}

// The module-level `layer` function this phase's `shared` path calls:
export declare const layer: <R, E>(layer_: Layer.Layer<R, E>, options?: {
  readonly memoMap?: Layer.MemoMap
  readonly timeout?: Duration.Input
  readonly excludeTestServices?: boolean
}) => {
  (f: (it: Vitest.MethodsNonLive<R>) => void): void
  (name: string, f: (it: Vitest.MethodsNonLive<R>) => void): void
}
```
`excludeTestServices` IS present on the module-level `layer(...)` export (not only on `it.layer`),
confirming ADR-EC-018's code sketch is callable exactly as written there.

**`TestEnv` is INTERNAL to `@effect/vitest` and not exported** — verified by reading
`@effect/vitest`'s own `dist/internal/internal.js`:
```javascript
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())
// ...
const withTestEnv = excludeTestServices ? layer_ : Layer.provideMerge(layer_, TestEnv)
```
This means ADR-EC-018's "explicit per-Scenario `TestEnv` provide" cannot import `TestEnv` from
`@effect/vitest` — Phase 10's implementation must construct the equivalent itself from the PUBLIC
modules `effect/testing/TestClock` and `effect/testing/TestConsole`:
```typescript
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())
```
This is a load-bearing, easy-to-miss fact: writing `import { TestEnv } from "@effect/vitest"` will not
compile, and reconstructing it wrong (e.g. omitting `TestClock.layer()`'s parens, which construct a
FRESH clock layer per call) would silently reintroduce cross-Scenario `TestClock` leakage — the exact
defect ADR-EC-018 exists to prevent.

---

### `packages/vitest/src/Runner.ts` (emission walk — MODIFY)

**Analog:** itself — `emitFeature`'s existing three-tier Layer resolution (note (f)) is the pattern to
extend, not replace.

**Current single-Layer assumption that Phase 10 changes** (lines 422–434, signature):
```typescript
export const emitFeature = (
  args: {
    readonly api: TestApi
    readonly plan: FeaturePlan
    readonly layer: Layer.Layer<any, any, never>
    readonly hooks: HookSet
    readonly ruleHooks: ReadonlyMap<string, HookSet>
    readonly ruleLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
    readonly scenarioLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
    readonly tagFilter: TagFilter
    readonly onEmitted?: ((outcome: EmitOutcome) => void) | undefined
  }
): EmitOutcome => { ... }
```
`args.layer` is ONE merged Layer today. Per ARCHITECTURE.md Pattern 4, the shared path needs `api` to
already carry `R = Shared | Scope` (because `layer(shared)`'s `it` was built with the shared services
ambient), and each Scenario's own `buildScenarioEffect` call must then provide ONLY the per-scenario
stack, not re-provide `shared`. Concretely, this is a second "provision strategy" mode alongside the
existing:
```typescript
// existing per-Scenario-only case, lines 516-525 (Feature-level) and 570-585 (Rule-level):
const effectiveLayer = scenarioLayers.get(scenarioKeyFor(scenarioPlan)) ?? layer
api.effect(
  titleFor(scenarioPlan),
  () => buildScenarioEffect({ plan: scenarioPlan, layer: effectiveLayer, hooks }),
  { tags: scenarioPlan.tags, skip }
)
```
The three-tier `?? ruleLayer ?? layer` fallback chain (note (f), lines 128–151) is exactly the
resolution logic to extend for `perScenario`'s own three tiers; do not re-invent a parallel mechanism.

**Nesting gap this phase must resolve** (already flagged above under `TestApi.ts`): `layer(shared,
{excludeTestServices: true})(name, (it) => …)`'s callback only exposes `it.effect`, not `describe`.
`Runner.ts`'s existing `api.describe(rule.name, () => { ... })` nesting (lines 555–587) therefore
cannot be reused verbatim inside that callback for a Rule nested under a `shared` Feature — this is
the single largest open implementation question this phase has (per CONTEXT.md's "Claude's Discretion"
section, explicitly deferred to research/planning).

**Anti-Pattern this whole module exists to make unreachable** (note (a), repeated in
`ARCHITECTURE.md` Anti-Pattern 3):
```typescript
// WRONG — compiles, passes, silently rebuilds "shared" per Scenario:
import { it, layer } from '@effect/vitest'
layer(Database.layer)('Feature', () => {
  it.effect('scenario', () => scenarioEffect)   // ← module-level `it`, not the callback's `it`
})
```
Whatever Phase 10 adds to `Runner.ts`/`describeFeature.ts` must route EVERY emission through whichever
`TestApi` was constructed for that path — never fall back to a module-level `it`/`describe` import
inside a `shared`-Layer branch.

**`emitFeature`'s own no-framework-import rule stays absolute** (note (a), lines 18–35): this file
must still import neither `vitest` nor `@effect/vitest`, not even as a type, not even in a comment
literal (the acceptance grep can't tell a citation from an import).

---

### `packages/vitest/src/ScenarioEffect.ts` (per-Scenario Effect builder — MODIFY)

**Analog:** itself — `buildScenarioEffect`'s single `Effect.provide(args.layer)` call is exactly what
needs to become provision-strategy-aware (ARCHITECTURE.md Pattern 4).

**Current single-provide site** (lines 177–224, the closing `.pipe`):
```typescript
export const buildScenarioEffect = (
  args: {
    readonly plan: ScenarioPlan
    readonly layer: Layer.Layer<any, any, never>
    readonly hooks: HookSet
  }
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function*() { /* Before gate, step loop, ... */ }).pipe(
    Effect.onExit(() => runHookBatch(args.hooks.After)),
    Effect.provide(args.layer)
  )
```
Module's own note (b) (lines 49–63) states PLAINLY: "This phase provides the Feature's single merged
Layer uniformly, with no shared/per-Scenario distinction at runtime... ADR-EC-018's shared path is
Phase 10's entire reason to exist." This is the file's own forward-reference to this phase — the
`args.layer` parameter (or a sibling parameter carrying just the `perScenario` half, with `shared`
already ambient via the `it` the Effect runs under) is where the split most likely lands, but the
exact shape is Claude's Discretion per CONTEXT.md.

**Invariant this file must keep true no matter which shape is chosen** (note (b)): the Layer is
supplied ONCE, around the WHOLE composed Effect, never per step — and it must be built FRESH per
EXECUTION for whichever tier remains per-Scenario (INV-EC-002). For the `shared` tier specifically,
"fresh per execution" is deliberately NOT wanted — that's the entire point of `shared` — so this module
must not accidentally re-provide `shared` here if `Runner.ts`'s `TestApi` already has it ambient
(providing it twice is exactly Anti-Pattern 3's mechanism, one level removed).

---

### `packages/vitest/src/index.ts` (doc comment only — MODIFY)

**Analog:** itself (lines 59–67), the "What is NOT built yet" paragraph.

**Exact text to flip** (D-05):
```
 * What is NOT built yet, with `spec/roadmap.md` as the single authority on build status: the opt-in
 * `shared` Layer built once per Feature, together with the per-Scenario `TestClock` isolation that
 * has to accompany it, is Phase 10 (RUN-03, RUN-04) — the `{ shared, perScenario }` argument form is
 * accepted and type-checked today, but both halves are built per Scenario at runtime.
```
This paragraph should be folded into the "Current state" paragraph above it (lines 24–38) once `shared`
actually builds once — following that paragraph's own present-tense, declarative style rather than
leaving a stale "not built yet" marker. No structural change, no new export.

---

### `packages/vitest/README.md` (status + worked example — MODIFY)

**Analog:** itself. Two spots:

1. **Status line to flip** (lines 104–107):
```markdown
**What is not built yet:** the build-once `shared` Layer with its per-Scenario
`TestClock` isolation (Phase 10) — the `{ shared, perScenario }` argument form is accepted and
type-checked today, but both halves are currently built per Scenario at runtime. See
[`spec/roadmap.md`](../../spec/roadmap.md) for what is built versus what is only specified.
```

2. **The existing per-Scenario/Rule example this phase's new worked example should mirror in style**
   (lines 47–54) — narrative prose plus one inline description of the merge combinator, no fenced code
   block for that particular claim. The NEW worked example (D-05: "a fake counter-based 'expensive
   resource' Layer used with the `{ shared, perScenario }` call form") should instead follow the
   `gherkinTags` example's fenced-code-block style just below it (lines 90–97):
```typescript
import { gherkinTags } from "@effect-cucumber/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { tags: [...gherkinTags("features/**/*.feature"), { name: "@skip" }, { name: "@only" }] }
})
```
   D-05 requires the new example's fixture shape to MIRROR the acceptance test's own fixture — i.e. the
   counter Layer in the new `emission.test.ts` block (see below) is the SOURCE OF TRUTH the README
   example must stay truthful against, not a second independently-written description.

---

### `spec/overview.md` / `spec/behaviors/03-rules-outlines-and-testclock.md` (doc hedge removal — MODIFY)

**Analog:** itself. `grep` found NO explicit "unstated exception" hedge sentence in `spec/overview.md`
verbatim today (its only `TestClock` mention, line 9, is unconditional: "steps get Layer-based
dependency injection, `TestClock`/`TestConsole` for free"). The closest candidate for what D-05 means
is `spec/behaviors/03-rules-outlines-and-testclock.md`'s BEH-EC-012 worked example, which currently
carries:
```typescript
// Pre-implementation reference — not yet compiled against a real API.
```
(line 96, immediately above the `TestClock` worked example, lines 93–99+). If this is not the intended
hedge, re-grep `spec/overview.md` and `spec/roadmap.md` for `TestClock` / `shared` / `carve-out` at
implementation time — the phrase may have moved or already been partially edited since CONTEXT.md was
written. BEH-EC-012's own REQUIREMENT block (lines 82–91) already states the target behavior
unconditionally ("This MUST hold identically whether the Feature uses the default per-Scenario Layer
or an opt-in `shared` Layer") — it is the WORKED EXAMPLE's pre-implementation caveat, not the
requirement text, that most plausibly needs removing.

---

### `packages/vitest/test/emission.test.ts` (real-run proof — MODIFY, two new blocks)

**Analog:** itself — the file's own established idioms for "prove a structural claim with a real
`describeFeature` run and a module-level mutable counter." Three existing precedents to copy from
directly:

**1. The counter-via-service pattern** (line 742 area, "the shared hook log, reached through a service
in the AMBIENT Layer rather than a bare closure") — D-01's build-count counter should be a `Ref` behind
a `Context.Tag`, exactly like the existing `Log`/hook-log services in this file, NOT a bare
module-level `let count = 0` mutated from inside a Layer's own `Layer.effect`/`Layer.scoped`
constructor closure (a bare closure variable would work too, since `Layer.effect`'s body runs at
build time regardless of DI, but the service-based idiom is what this file already does consistently
and keeps the counter inspectable from a step body via `yield*`).

**2. Real `describeFeature` + inline `parseFeature(...)` Feature source** (lines 229–245, 250–282,
288–309): every Feature in this file is a template literal parsed via the real
`@effect-cucumber/gherkin` `parseFeature`, never a hand-built `ParsedFeature`. D-01's new case should
follow this exactly — likely N Scenarios (e.g. 3) under a `shared` Layer counting to 1 build, and the
SAME Scenario count under the default per-Scenario scope counting to N builds, as TWO separate
`describeFeature` blocks (or one Feature run twice with different layer arguments) in this same file.

**3. The Rule + hooks real-run composition block** (`describe("a Rule's Layer and hooks compose with
the Feature's at runtime (08-07)", ...)`, starting line 886) is the direct structural precedent for
D-03's new "Rule + shared" regression test: a Feature-level `shared` counter Layer plus a `Rule`'s own
`extraLayer` counter, asserting the Rule's builds scale with Scenario count while the Feature's `shared`
counter stays pinned at 1. Copy this block's shape (own fixture Feature, own counters, own `describe`
block appended at the end of the file per the file's own documented ordering rule — see its header,
"Phase 9's tag blocks are appended AFTER every block above, and that placement is load-bearing").

**Mutation-testing obligation this file already documents and this phase must extend** (lines
99–129): every new assertion here needs its own recorded mutation proof, following the file's own
"Mutation-tested (every one performed, run, then reverted)" list format — e.g., forcing the
`shared`-branch code to route through the per-Scenario path anyway must be the mutation that turns the
new D-01 count-of-1 assertion red.

**Imports to extend, not replace** (lines 143–150): `../src/describeFeature.ts` directly (never
`../src/index.ts` — `effect/no-import-from-barrel-package` forbids it), `assert`/`describe`/`it` from
`@effect/vitest`, `Ref` from `effect/Ref` already imported for the existing counter/log services.

---

### `scripts/verify-shared-layer-once.sh` (NEW)

**Analog:** `scripts/verify-tags-filter.sh` — same role (verification script), same data flow (real
vitest CLI subprocess, JSON reporter, structured assertions), same rationale class ("prove a claim an
in-process test cannot make"). Copy its skeleton wholesale and adapt the specific claims.

**Structural skeleton to copy verbatim** (full file read; key excerpts):

Header comment shape — state the claims an in-process test CANNOT make, and why:
```bash
#!/usr/bin/env bash
#
# Asserts, FROM OUTSIDE THE TEST PROCESS, that a `shared` Layer is built EXACTLY
# ONCE per Feature — once for the whole suite, and identically once when the
# suite is narrowed with `-t` to a single Scenario.
#
# METHOD NOTE (do not weaken this): [state what test/emission.test.ts's in-process
# counter case (D-01) CAN prove, and why real `-t` CLI filtering is the one thing
# it cannot — an in-process test never re-invokes the CLI with a narrower selection]
#
# Usage: bash scripts/verify-shared-layer-once.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
```

Path constants spelled out in full (never composed from a variable), per its own documented
`title_is_declared` precondition rationale — "so these paths stay greppable for traceability checks":
```bash
TEST_FILE="packages/vitest/test/<fixture-file-name>"   # Claude's naming call
VITEST="node_modules/.bin/vitest"
```

Report-as-structured-data helper, copy verbatim (never grep reporter glyphs — "Glyph output varies
with TTY detection, colour support and reporter choice; a gate keyed to it breaks silently in CI"):
```bash
report_query() {
  local report="$1" mode="$2" title="${3-}"
  REPORT="$report" QUERY_MODE="$mode" QUERY_TITLE="$title" node -e '
    const fs = require("node:fs")
    const report = JSON.parse(fs.readFileSync(process.env.REPORT, "utf8"))
    const results = (report.testResults || []).flatMap((file) => file.assertionResults || [])
    // ... total / passed / failed / status TITLE modes
  '
}
```

Two-run comparison shape to adapt for THIS phase's specific claim (RUN-03 SC#3): run A unfiltered
(whole suite / whole fixture Feature), run B with `--tagsFilter` or `-t` narrowed to ONE Scenario — but
where `verify-tags-filter.sh` compares TEST STATUS between runs, this script compares a BUILD COUNT
observable from outside the process. The counter cannot be read via the JSON reporter directly (it
isn't a test status) — the mechanism most consistent with this project's "prove it by running it, not
by reading source" culture is to have the fixture Feature's OWN Scenario assertions fail if the shared
counter is ever anything other than exactly 1 by the time that Scenario runs (i.e., encode the
build-count claim AS a test assertion inside the fixture, and use the script purely to prove that
assertion holds both unfiltered AND under `-t`). This mirrors `verify-tags-filter.sh`'s own assertion 6
pattern (a specific test's PASS/FAIL status is the external signal), and avoids inventing a
side-channel the JSON reporter has no field for. Confirm this approach against
`.planning/research/ARCHITECTURE.md`/`PITFALLS.md` during planning — it is Claude's Discretion how
exactly the counter surfaces, but reusing the "the test's own status is the external signal" mechanism
avoids adding a NEW verification technique to this repo's toolkit.

`fail()` helper, vacuity controls (non-zero total, at least one passed under the filtered run), and
precondition title-exact-match guard (`title_is_declared`) should all be copied near-verbatim — this
script's own header explicitly frames these as hard-won lessons ("STATE.md's 01-02 entry records a
grep-based gate in this repo that passed and was then proven vacuous by mutation testing").

**package.json wiring, copy the convention exactly** (`package.json` line 24):
```json
"verify:tags-filter": "bash scripts/verify-tags-filter.sh"
```
→ add `"verify:shared-layer-once": "bash scripts/verify-shared-layer-once.sh"` alongside the other five
`verify:*` scripts (lines 18–24 of `package.json`).

---

### `<new>.types.ts` — D-04's `shared: Layer<R, never, never>` constraint (NEW)

**Analog:** `packages/gherkin/test/StepArgs.types.ts` — same role (compile-time-only type assertion
file), same data flow (never collected by vitest, only by `pnpm typecheck:test`).

**File-naming and placement convention to copy** (`StepArgs.types.ts` header, lines 1–27):
```typescript
/**
 * The `.types.ts` suffix is load-bearing. vitest's default include glob is
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, so this file is never collected as a suite... Meanwhile
 * `packages/vitest/tsconfig.test.json` has `include: ["src", "test"]`, so `pnpm typecheck:test`
 * — a required step in `.github/workflows/check.yml`'s `types` job — compiles it on every push.
 */
```
Place this new file at `packages/vitest/test/<Name>.types.ts` (sibling of `describeFeature.test.ts`),
since the constraint is on `describeFeature`'s own overload, not on the gherkin package. A plausible
name: `packages/vitest/test/DescribeFeatureLayer.types.ts` or `SharedLayerConstraint.types.ts` (naming
is Claude's call per CONTEXT.md, following this repo's `<Subject>.types.ts` convention).

**The exact-equality helper and assignment-based positive/negative pattern to copy verbatim** (lines
35–41, and the two failure-mode footguns this shape defends against, documented at lines 14–26):
```typescript
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
declare function equality<A, B>(): Equals<A, B>
const expectTrue = (verdict: true): true => verdict
```
For D-04 specifically, the shape is closer to the file's OWN "negative assertions via
`@ts-expect-error`" section (lines 132–160) than to the positive `equality<>()` assertions — D-04 is a
constraint on an ARGUMENT position (does `describeFeature(feature, { shared: <bad>, perScenario:
<ok> }, define)` fail to compile?), not a type-equality claim about a derived type. Model it on:
```typescript
declare const failingLayer: Layer.Layer<SomeService, SomeError, never>   // E is not `never`
declare const okLayer: Layer.Layer<SomeService, never, never>

// @ts-expect-error D-04: `shared` must be Layer<R, never, never> — a failable shared Layer is rejected
describeFeature(someFeature, { shared: failingLayer, perScenario: Layer.empty }, (dsl) => { /* ... */ })

// positive control: a Layer<R, never, never> is accepted in the `shared` position
describeFeature(someFeature, { shared: okLayer, perScenario: Layer.empty }, (dsl) => { /* ... */ })
```
**Both directions are required**, per `StepArgs.types.ts`'s own stated non-vacuity argument (note (a)
and (b) in its header): the `@ts-expect-error` catches "the constraint stopped being enforced"; the
positive control catches "the constraint became so strict it also rejects the legitimate case." Without
the positive control, a change that made `shared` reject EVERY Layer (including valid ones) would leave
this file green.

**Also verify `perScenario` stays UNCONSTRAINED** — D-04's whole argument (CONTEXT.md, "Error-channel
constraint scope") is that `perScenario` must NOT get this same treatment. A third case, a `perScenario`
carrying a failable Layer with NO `@ts-expect-error`, is what proves the asymmetry is real and not an
oversight:
```typescript
// perScenario is intentionally NOT constrained — a failable per-Scenario Layer is legitimate
// (it fails that Scenario, not the whole beforeAll) and must still compile.
describeFeature(someFeature, { shared: okLayer, perScenario: failingLayer }, (dsl) => { /* ... */ })
```

---

## Shared Patterns

### The `TestApi` seam (Pattern 3, ARCHITECTURE.md ~line 203) applies to every runtime file touched
**Source:** `packages/vitest/src/TestApi.ts` + `packages/vitest/src/describeFeature.ts` note (e)
**Apply to:** `describeFeature.ts`, `TestApi.ts`, `Runner.ts`
No import of `vitest`/`@effect/vitest` — not even `import type` — may appear in `TestApi.ts` or
`Runner.ts`. `pnpm verify:testapi-seam` enforces this structurally. Only `describeFeature.ts` may
import a test framework, and it is where BOTH `TestApi` implementations (module-level pair, and the
`layer(...)`-callback's `it`) must be constructed.

### Dual Layer-provision strategy (Pattern 4, ARCHITECTURE.md ~line 224)
**Source:** `packages/vitest/src/ScenarioEffect.ts` note (b), `spec/decisions/018-shared-layer-testclock-isolation.md`
**Apply to:** `ScenarioEffect.ts`, `Runner.ts`, `describeFeature.ts`
No shared Layer: `scenarioEffect.pipe(Effect.provide(perScenarioStack))`. With a shared Layer: the
ambient `it` already carries `Shared`, so only `perScenarioStack` is provided, leaving `Shared`
unprovided for the ambient `it.layer(...)` context to satisfy. Make this an explicit parameter of
whichever builder composes it, never an implicit consequence of which branch called in.

### `excludeTestServices: true` + manual `TestEnv` reconstruction (ADR-EC-018)
**Source:** `spec/decisions/018-shared-layer-testclock-isolation.md`, verified against
`@effect/vitest@4.0.0-rc.112`'s `dist/internal/internal.js`
**Apply to:** wherever the `shared`-path `layer(...)` call is made (most likely `describeFeature.ts`)
```typescript
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { layer } from "@effect/vitest"

const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

layer(sharedLayer, { excludeTestServices: true })((it) => {
  it.effect(scenarioName, () =>
    scenarioStepsEffect.pipe(Effect.provide(testEnv)))   // fresh TestEnv per Scenario, not memoized
})
```
`TestEnv` is NOT exported by `@effect/vitest` — it must be reconstructed from the two public
`effect/testing/*` modules exactly as shown, not imported.

### Real-CLI-run verification scripts (Phase 9 lineage)
**Source:** `scripts/verify-tags-filter.sh` (also `verify-tsgo-gate.sh`, `verify-testapi-seam.sh`)
**Apply to:** `scripts/verify-shared-layer-once.sh`
Structured JSON-reporter parsing via `node -e`, never glyph-grepping terminal output; every title/path
this gate depends on is asserted to exist BEFORE any run, by exact suffix match, so a rename fails
loudly rather than turning a later assertion vacuously true; a vacuity control (non-zero result count)
on every run; `set -euo pipefail`; paths spelled out in full for traceability grep.

### Mutation-testing every new gate/assertion before considering it done
**Source:** `packages/vitest/test/emission.test.ts` header (lines 99–129), `STATE.md` phase entries
03-01 through 09
**Apply to:** every new assertion in `emission.test.ts`, the new `.types.ts` file, and the new script
Each new assertion needs a recorded mutation proof: perform the mutation that should defeat it, confirm
it goes red, then revert. This is not optional stylistic advice in this repo — it is the established,
repeated bar for "done."

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Fixture Feature/test-file backing `verify-shared-layer-once.sh` | fixture | file-I/O / batch | No prior script in this repo drives a STANDALONE fixture `.feature` file through the real vitest CLI for the `packages/vitest` package — `verify-tags-filter.sh` reuses `packages/vitest/test/emission.test.ts` itself (a full test file with many unrelated blocks) as its target, rather than a small dedicated fixture. Whether Phase 10's script should (a) add a new `describe` block to `emission.test.ts` and target that file exactly as `verify-tags-filter.sh` does, or (b) introduce a small dedicated fixture test file, is genuinely open — CONTEXT.md marks the script's fixture naming as "Claude's call." Recommendation for planning: prefer (a), reusing `emission.test.ts`, since it avoids inventing a second CLI-target convention and both D-01's in-process case and D-02's CLI-run case can then share one fixture Feature/Layer definition (satisfying D-05's "mirror the acceptance test's own fixture shape" requirement for the README example too). |

## Metadata

**Analog search scope:** `packages/vitest/src/*.ts`, `packages/vitest/test/*.ts`,
`packages/gherkin/test/*.types.ts`, `scripts/*.sh`, `packages/vitest/README.md`, `spec/overview.md`,
`spec/behaviors/03-rules-outlines-and-testclock.md`, `spec/decisions/018-*.md`, installed
`@effect/vitest@4.0.0-rc.112` and `effect@4.0.0-rc.112` package type declarations and compiled
internals (`dist/internal/internal.js`) for ground-truth verification of `layer()`, `MethodsNonLive`,
and `TestEnv`.
**Files scanned:** 11 target files read in full or in targeted ranges, plus 4 supporting reads
(`package.json` verify-script list, `@effect/vitest` `dist/index.d.ts` and `dist/internal/internal.js`,
`spec/behaviors/03-rules-outlines-and-testclock.md`).
**Pattern extraction date:** 2026-08-30
