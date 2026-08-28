# Pitfalls Research

**Domain:** Effect-native Gherkin/Cucumber test runner for vitest (`effect-cucumber`)
**Researched:** 2026-08-28
**Confidence:** HIGH for everything marked [VERIFIED] — those were reproduced by running the real installed `@cucumber/gherkin@42.0.1`, `@cucumber/cucumber-expressions@20.1.0`, `effect@4.0.0-rc.112`, `@effect/vitest@4.0.0-rc.112` and `vitest@4.1.11` in this repo, or by `tsc`-checking a probe file against them. Pitfalls 17–20 additionally draw on a delegated web pass against the npm registry, Effect's changelog/changesets, and downstream breakage reports. MEDIUM/LOW is called out inline.

## How to read this

Every pitfall below is specific to the **exact** combination this project has locked in. Generic testing advice has been stripped. Each `[VERIFIED]` claim has a reproduction you can turn into a regression test; the reproduction is stated concretely enough to paste into a phase plan.

Phase names used in the mapping (derived from `spec/roadmap.md` § Blocking first release):

| # | Phase topic |
|---|---|
| P0 | Workspace/toolchain + **dependency & version policy** (carries 5 pitfalls, one of which blocks P1's first line of code) |
| P1 | `@effect-cucumber/gherkin` — `loadFeature` (parse + compile + AST↔Pickle correlation) |
| P2 | `@effect-cucumber/gherkin` — step matching (cucumber-expressions wrapper, `ParameterTypeRegistry` lifecycle) |
| P3 | `@effect-cucumber/gherkin` — `DataTable`/doc-string wrapper + Schema decoding |
| P4 | `@effect-cucumber/vitest` — `describeFeature` **type surface** (Layer ↔ step `R` checking) |
| P5 | `@effect-cucumber/vitest` — scenario-Effect builder + `it.effect` emission |
| P6 | Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`) |
| P7 | `Rule` / `Scenario Outline` / Rule-scoped extra Layers |
| P8 | Tags (`@skip`/`@only`, and — see Pitfall 32 — vitest v4's native tag system) |
| P9 | `shared` Layer via `@effect/vitest`'s `layer(...)` |
| P10 | Dogfooding acceptance suite + doc-example compile check |

---

## Critical Pitfalls

Mistakes that cause rewrites, silent wrong results, or break the project's stated Core Value.

- **1–15 are behavioral** — they make tests lie. Several produce a *green* test that ran nothing, which for a BDD tool is the worst possible failure.
- **16–20 are packaging/versioning** — they break the published library for users in ways your own pnpm workspace will never reproduce. Pitfall 16 is a live defect in this repo today.

---

### Pitfall 1: `layer(...)`'s shared `TestClock` never resets between Scenarios [VERIFIED]

**What goes wrong:**
`@effect/vitest`'s `layer(L)(...)` builds `Layer.provideMerge(L, TestEnv)` **exactly once** and caches it (`internal.js`: `Layer.buildWithMemoMap(withTestEnv, memoMap, scope).pipe(Effect.orDie, Effect.cached, Effect.runSync)`), where `TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())`. The plain top-level `it.effect` instead does `flow(Effect.scoped, Effect.provide(TestEnv))` **per test**.

Consequence: inside a `shared`-Layer Feature (ADR-EC-006), `TestClock` is one shared, monotonically-advancing clock and `TestConsole` one accumulating buffer for **every Scenario in that Feature**. A Scenario that does `TestClock.adjust("1 hour")` moves the clock for every Scenario that runs after it. Scenario execution order becomes semantically load-bearing, and a suite that passes when run whole fails when run with `-t`, and vice versa.

Reproduced:

```
plain it.effect  → t1 adjusts 1h, t1 sees 3600000 ; t2 sees 0        ✅ fresh
layer(DbLayer)   → t1 adjusts 1h, t1 sees 3600000 ; t2 sees 3600000  ❌ leaked
```

This contradicts `PROJECT.md`'s requirement *"TestClock composes transparently — a step reading `Clock` sees `@effect/vitest`'s simulated clock with zero test-specific code"*. That requirement holds **only** for the default per-Scenario path.

**Why it happens:**
ADR-EC-006 correctly decided to delegate to `layer(...)` rather than reimplement build-once bookkeeping, and got build-once memoization and teardown for free. What it did not notice is that `layer(...)` bundles the *test services* into the same memoized build. The design assumed test services are orthogonal to the user's Layer; in `@effect/vitest`'s implementation they are not.

**How to avoid: [FIX VERIFIED]**
Pass `excludeTestServices: true` to `layer(...)` for the `shared` Layer and provide `TestEnv` yourself, per-Scenario, inside each generated `it.effect` body:

```ts
const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())
layer(sharedLayer, { excludeTestServices: true })(featureName, (it) => {
  it.effect(scenarioName, () => scenarioEffect.pipe(Effect.provide(perScenarioLayer), Effect.provide(TestEnv)))
})
```

Reproduced — this restores per-Scenario test services **without** losing build-once sharing:

```
[db build]                      ← printed ONCE (shared Layer still memoized)
s1 adjusts 1h → s1 now = 3600000, db = 1
                s2 now = 0,       db = 1     ✅ fresh clock, shared Db
```

If for some reason this route is abandoned, the fallback is to **document the leak loudly** in `describeFeature`'s `shared` option and add it to `spec/invariants.md` as a carve-out to INV-EC-002.

**Warning signs / concrete test:**
Write an acceptance `.feature` with two Scenarios under one `shared` Layer; Scenario 1 advances the TestClock, Scenario 2 asserts `Clock.currentTimeMillis === 0`. That test failing is the pitfall. Add it *before* the `shared` implementation lands.

**Phase to address:** P9 (shared Layer). Must be resolved before P10's acceptance suite claims TestClock transparency.

---

### Pitfall 2: Registering `it.effect` asynchronously silently produces ZERO tests [VERIFIED]

**What goes wrong:**
vitest v4's collector (`@vitest/runner`) keeps **one global mutable `collectorContext.currentSuite`**, set before `await fn()` in `runWithSuite` and restored after. `@effect/vitest`'s 1-argument `layer(L)(cb)` form is worse: it calls `cb(makeIt(V.it))` **synchronously and never awaits**, then immediately diffs `getCurrentSuite().tasks` to find the block's tests.

Reproduced: `layer(DbLayer)(async (it) => { await new Promise(r => setTimeout(r, 5)); it.effect("...", ...) })` produced **no test, no error, no warning** — the test simply did not exist in the output, and the Layer was never built.

For `effect-cucumber` this bites the moment `loadFeature` is async and `describeFeature` awaits it, or the define callback is `async`, or anything registers via `.then()`/`queueMicrotask`. A microtask-only deferral happened to work in one probe (the `await fn()` tick kept `currentSuite` set) — that is **luck, not a contract**.

**Why it happens:**
Reading a `.feature` file is I/O, so the natural API is `async function loadFeature(path)`. Test-runner collection, however, is a synchronous-registration protocol. The two are fundamentally at odds and nothing warns you.

**How to avoid:**
Make the feature source available **synchronously at module evaluation time** and keep `describeFeature` and its define callback 100% synchronous.

The best mechanism, [VERIFIED] working in vitest 4.1.11 with zero config:

```ts
import featureSrc from "./checkout.feature?raw"   // Vite's ?raw suffix, arbitrary extension
describeFeature(loadFeature(featureSrc, "checkout.feature"), World.layer, (dsl) => { ... })
```

`?raw` gives a `string` synchronously **and** registers the `.feature` file in Vite's module graph — which also fixes Pitfall 3. If a path-based API is also offered, back it with `fs.readFileSync`, never `fs/promises`. If `loadFeature` returns an `Effect`, its runner must be `Effect.runSync` (a `runPromise` at module top level reintroduces the async gap in the `layer()` 1-arg path).

**Warning signs:**
A Feature file whose Scenarios silently do not appear in vitest output (test count lower than Scenario count, no error). Add a P10 acceptance assertion that the emitted test count equals the compiled Pickle count.

**Phase to address:** P1 (decide `loadFeature`'s sync/async signature — this is an API-shape decision, cheapest now, near-impossible to reverse later), enforced in P5.

---

### Pitfall 3: Editing a `.feature` file does not re-run tests in watch mode

**What goes wrong:**
If `loadFeature` reads the `.feature` file with `fs.readFileSync`, the file is invisible to Vite's module graph. In `vitest watch`, editing a `.feature` file changes nothing — the developer edits Gherkin, sees stale results, and concludes the library is broken.

**Why it happens:**
vitest invalidates by module graph, not by filesystem. Node's `fs` bypasses it entirely.

**How to avoid:**
Same fix as Pitfall 2 — the `?raw` import. [VERIFIED]: with `import src from "./x.feature?raw"`, adding a Scenario to `x.feature` during `vitest watch` produced `RERUN x.feature x1` and the new Scenario appeared as a new test in the same session. With `readFileSync` it would not have.

The alternatives are all worse. `watchTriggerPatterns` (vitest ≥ 3.2) is purpose-built but **root-config only** — unusable inside `projects`. `forceRerunTriggers` has two open bugs (vitest [#10835](https://github.com/vitest-dev/vitest/issues/10835), [#11054](https://github.com/vitest-dev/vitest/issues/11054)): picomatch runs with `dot: false` against absolute paths, so **any** dot-prefixed path segment anywhere in the tree (`.worktrees/`, `.pnpm/`) silently disables it. A vitest maintainer's own recommendation for this exact problem is the `?raw` import. If a path-based API must exist anyway, ship the `vitest.config.ts` snippet *and* its caveats.

**Warning signs:**
Manual check during P10: run `vitest watch`, add a Scenario to a fixture `.feature`, confirm a rerun with the new test.

**Phase to address:** P1 (API shape), documented in P10.

---

### Pitfall 4: A step body typed as a bare generator can silently defeat the whole compile-time `R` check [VERIFIED]

**What goes wrong:**
ADR-EC-003 + INV-EC-003 are the project's entire reason to exist: *"a step that needs a service the ambient Layer doesn't provide is a type error at authoring time."* ADR-EC-005 says `Given`/`When`/`Then` accept a **bare generator**. Getting the generator's type right is the difference between the guarantee holding and it being decorative — and a wrong-but-plausible signature typechecks fine and rejects nothing.

Verified with `tsc` against `effect@4.0.0-rc.112`:

| Step-parameter signature | Rejects a step needing an unprovided service? |
|---|---|
| `(...a: any[]) => Effect.Effect<A, E, ROut>` | ✅ yes |
| `(...a: any[]) => Generator<Effect.Effect<any, E, ROut>, A, any>` | ✅ yes, **and** `const w = yield* World` still infers correctly |
| `Eff extends YieldWrap<Effect<any,any,ROut>>` (the Effect **v3** idiom) | ❌ **no** — `YieldWrap` does not exist in v4's `effect/Utils`; the constraint silently degrades to `any` and every step is accepted |

**Effect v4 removed `YieldWrap`.** `Effect.gen`'s v4 signature is `<Eff extends Effect<any, any, any>, AEff>(f: () => Generator<Eff, AEff, never>)` — effects are yielded directly. Copying the v3 DSL idiom from an existing library or from training data produces a signature that compiles and enforces nothing.

Effect v4 also exports the helper `Effect.gen.Return<A, E, R> = Generator<Effect<any, E, R>, A, any>` and `Effect.fn.Return<...>` — use those rather than hand-rolling.

**Why it happens:**
A vacuous generic constraint is invisible: everything typechecks, all tests pass, and the failure only shows up as a runtime "service not found" months later — the exact failure mode ADR-EC-003 exists to eliminate.

**How to avoid:**
Ship a **negative type test** in P4, before any runtime code. Use `@ts-expect-error` (which errors if the line *does* compile — so it is a real assertion, not a comment):

```ts
describeFeature(f, World.layer, ({ Given }) => {
  Given("ok",  function* () { yield* World })
  // @ts-expect-error step requires Db, which World.layer does not provide
  Given("bad", function* () { yield* Db })
})
```

Run this file under `tsc --noEmit` in CI. If someone later loosens the DSL type, the `@ts-expect-error` becomes "Unused '@ts-expect-error' directive" and CI fails. This is the single highest-leverage artifact in the project.

**Warning signs:**
`tsc` reporting *"Unused '@ts-expect-error' directive"* on the negative-type-test file.

**Phase to address:** P4, as its **first** task — the type-test file precedes the implementation.

---

### Pitfall 5: `ROut` must include `Scope.Scope` or every scoped step is a type error [VERIFIED]

**What goes wrong:**
`@effect/vitest` types its tester as `Vitest.Tester<R | Scope.Scope>` and applies `Effect.scoped` per test — so a step **may** legitimately require `Scope`. But if the DSL declares the step parameter as `Generator<Effect<any, E, ROut>, A, any>` with `ROut` = only the Layer's output, a step doing `yield* Effect.acquireRelease(...)` fails to compile:

```
Type 'Effect<number, never, Scope>' is not assignable to type 'Effect<any, never, World>'.
  Type 'Scope' is missing the following properties from type 'World': Service, [ServiceTypeId], key
```

The step is perfectly valid at runtime. The library's own type is what rejects it.

**Why it happens:**
`Scope` is provided by the runner, not by the user's Layer, so it never appears in `ROut` derived from the Layer argument.

**How to avoid:**
Declare the step parameter as `... Effect<any, E, ROut | Scope.Scope> ...` everywhere `ROut` appears in a step/hook position. [VERIFIED] this makes `Effect.acquireRelease` steps compile while still rejecting an unprovided service. Cover it in the P4 type-test file with a *positive* case (a scoped step must compile) alongside the negative case.

**Warning signs:**
A user reports "I can't use `Effect.acquireRelease` in a step" — by then the DSL type is public API.

**Phase to address:** P4.

---

### Pitfall 6: One `any` anywhere in a step body silently disables the `R` guarantee [VERIFIED]

**What goes wrong:**
Even with a correct DSL signature, `Effect<any, any, any>` and plain `any` are assignable to everything. Both of these compile clean against a `World`-only Layer:

```ts
declare const untypedHelper: any
Given("leak", function* () { yield* untypedHelper })              // accepted
declare const looseHelper: Effect.Effect<any, any, any>
Given("leak", function* () { yield* looseHelper })                // accepted
```

INV-EC-003 is therefore only as strong as the weakest type in a step body. A user with one `as any` cast, or one dependency shipping `Effect<any,any,any>`, gets a runtime "service not found" while believing the compiler checked it.

**Why it happens:**
Nothing about it is visible. This is structural typing working as designed.

**How to avoid:**
This cannot be fixed in the DSL's types. Fix it in *documentation and lint*: recommend `@typescript-eslint/no-unsafe-*` + `noImplicitAny` for step modules, and state the limitation explicitly next to INV-EC-003 (which currently reads as an unconditional guarantee). Say what is true — INV-EC-003 holds "for step bodies free of `any`."

**Warning signs:**
A runtime `service not found` in a suite that typechecks. When triaging, grep the step module for `any` first.

**Phase to address:** P4 (amend the INV-EC-003 wording), P10 (lint recommendation in docs).

---

### Pitfall 7: `compile()` silently drops Scenario Outlines with an empty Examples table [VERIFIED]

**What goes wrong:**
`compile()` does `scenario.examples.filter((e) => e.tableHeader)` and then iterates `examples.tableBody`. So:

- `Examples:` with **no rows at all** (not even a header) → filtered out → **zero pickles**
- `Examples:` with a header row but **no body rows** → the `forEach` body never runs → **zero pickles**

Reproduced: a Feature with 4 scenario-shaped AST nodes produced only **3** pickles; the `Scenario Outline: no rows` node had **no pickle at all**. No error. No warning.

If `loadFeature` builds its DSL tree from `GherkinDocument` and attaches correlated pickles, that Scenario Outline yields a `describe` block containing zero tests — a Gherkin author's typo becomes a **silently unrun test**, the worst possible outcome for a BDD tool.

**Why it happens:**
`compile()` is designed to produce runnable pickles, not to report authoring errors. `cucumber-js` layers its own validation on top; a naive wrapper does not.

**How to avoid:**
`loadFeature` must **reconcile both directions**. After correlating, compute the set of AST Scenario node ids and the set of `pickle.astNodeIds[0]` values, and **fail loudly** on any AST Scenario with no pickle:

```ts
const covered = new Set(pickles.map(p => p.astNodeIds[0]))
const orphans = astScenarios.filter(s => !covered.has(s.id))
// -> a typed LoadFeatureError naming the Scenario and its .feature line
```

**The same silent-zero / silent-wrong family, from `compile.ts` and two open upstream bugs** (independently corroborated):

| input | `compile()` result |
|---|---|
| `Examples:` with no header row | 0 pickles, silently |
| `Examples:` with a header but no body rows | 0 pickles, silently |
| `gherkinDocument.feature == null` (empty file, comments only) | 0 pickles, silently |
| a `Rule:` containing no Scenarios | 0 pickles, silently |
| plain `Scenario:` **with** an `Examples:` table | compiled **as an Outline** — silently multiplies into N tests. `compile()` branches on `examples.length === 0`, never on the keyword |
| Examples row missing its trailing `\|` (`\| a \| b`) | last column silently **dropped**; its `<b>` stays un-interpolated — [cucumber/gherkin#22](https://github.com/cucumber/gherkin/issues/22), open |
| duplicate Examples header columns (`\| a \| a \|`) | first wins, no error — [cucumber/gherkin#28](https://github.com/cucumber/gherkin/issues/28), open |

Note the last two are **acknowledged open bugs upstream**, not things that will be fixed for you.

There is also a vitest-side consequence: a Feature that produces zero tests must not emit an empty `describe`, or vitest reports a red `No test found in suite <name>` — a failure that names the wrong problem. Fail at `loadFeature` with a message naming the `.feature` file instead.

**Warning signs / concrete test:**
A P1 unit test whose fixture contains every row of the table above. `loadFeature` must produce a `LoadFeatureError` for each — never silence, never an empty `describe`.

**Phase to address:** P1, with a P7 regression test once Outlines are wired.

---

### Pitfall 8: A Scenario with zero steps compiles to a vacuously-passing green test [VERIFIED]

**What goes wrong:**
`compileScenario` guards with `if (scenario.steps.length !== 0)` before pushing Background steps. A Scenario with **no steps** therefore yields a Pickle with `steps: []` — and, notably, **its Background steps are dropped too**.

Reproduced: `Scenario: empty scenario` produced `{"name":"empty scenario","steps":[]}` while every sibling Scenario got the Background step. Under ADR-EC-004 that becomes `it.effect("empty scenario", () => Effect.gen(function* () {}))` — a test that runs nothing and reports **green**.

**Why it happens:**
An empty Scenario is a legal `GherkinDocument`, and an empty `Effect.gen` is a legal, successful Effect. Two independently reasonable behaviors compose into a lie.

**How to avoid:**
Treat a zero-step Pickle as a `LoadFeatureError` in P1 (matching how `cucumber-js` treats it as a problem rather than a pass), or at minimum emit `it.effect.skip`/`todo` so it reports as *not run* rather than *passed*. Do **not** emit a passing test.

**Warning signs:**
A P1 unit test asserting that a zero-step Scenario does not produce a runnable, passing test.

**Phase to address:** P1 (detect), P5 (emit skip/todo if that route is chosen).

---

### Pitfall 9: `astNodeIds` is one-to-**many**; a `Map<id, Pickle>` silently loses Examples rows [VERIFIED]

**What goes wrong:**
`compileScenario` sets `astNodeIds: [scenario.id]`; `compileScenarioOutline` sets `astNodeIds: [scenario.id, valuesRow.id]` — **once per Examples row**. Every row of one Outline shares the same `astNodeIds[0]`.

Reproduced: `outline a` and `outline b` both carry `ast: ["9", ...]`. A `new Map(pickles.map(p => [p.astNodeIds[0], p]))` keeps only the **last** row — an Outline with 5 rows silently runs 1 test.

**How to avoid:**
Correlate as `Map<astNodeId, Pickle[]>`, preserving `compile()`'s emission order (Examples-block order, then row order). Assert `pickles.length === sum(expected per scenario)` in P1.

Use the canonical cucumber-js idiom, which `playwright-bdd` independently converged on:
- **`astNodeIds[0]`** → the defining AST node (the `Scenario`/`Scenario Outline`) — use for structure, keyword, and Rule membership.
- **`astNodeIds.at(-1)`** → the *concrete* node (the Examples table **row** for an Outline) — use for the reported line number and for per-row identity. `pickle.location` already holds this resolved location, so you rarely need the lookup for lines.
- cucumber-js writes `ids.map(id => map[id]).filter(x => x != null)[0]` defensively, because `astNodeIds` legitimately contains ids absent from any given map. Copy that.
- `playwright-bdd` drives its `describe` tree **from the AST**, looking up each Outline row's pickle by the **Examples-row id**, not the Scenario id. That is the shape to mirror for ADR-EC-014's correlation.

**Warning signs / concrete test:**
P1 fixture: one Outline with 3 rows → `loadFeature` must yield exactly 3 scenario entries with distinct interpolated names.

**Phase to address:** P1, exercised by P7.

---

### Pitfall 10: `IdGenerator.incrementing()` collides across `.feature` files [VERIFIED]

**What goes wrong:**
`compile(doc, uri, newId)` and `new AstBuilder(newId)` both take an id generator. If `loadFeature` constructs a **fresh** `IdGenerator.incrementing()` per file, node ids restart at `"1"` in every file.

Reproduced: two different Features parsed with two fresh `incrementing()` generators both gave their Scenario the id `"1"`. Any cross-file cache, correlation map, or dedup keyed by node id is then corrupt — Feature B's Scenario overwrites Feature A's.

Also [VERIFIED]: a `Parser` instance **is** safely reusable across files (`parse()` calls `builder.reset()` and `tokenMatcher.reset()`; two sequential parses with one shared generator gave ids `1` and `3`).

**How to avoid:**
Use `IdGenerator.uuid()`, or one process-wide `incrementing()` instance shared by both the `AstBuilder` and `compile()`. Never key any map by a node id without also keying by `uri`.

**Warning signs / concrete test:**
P1 test: load two different Features in one process, assert the union of their Scenario node ids has no duplicates.

**Phase to address:** P1.

---

### Pitfall 11: Background step text is **not** interpolated inside a Scenario Outline [VERIFIED]

**What goes wrong:**
`compileScenarioOutline` pushes Background steps via `pickleStep(step, [], null, ...)` — **empty** `variableCells`. So a `<placeholder>` in a Background step stays a literal `<placeholder>` in every Outline pickle.

Reproduced: `Background: Given bg with <name> placeholder` produced pickle steps `"bg with <name> placeholder"` for **both** the `name=a` and `name=b` rows.

The user's mental model ("Background is just more steps, and Outlines substitute placeholders") is wrong here, and the failure is a confusing *undefined step* — `bg with <name> placeholder` matches no registered pattern — pointing at the wrong place.

**Why it happens:**
ADR-EC-014 correctly says "compile() substitutes placeholders", which is true for Scenario steps and Scenario names but not for Background steps. The exception is invisible from the ADR.

**How to avoid — one check covers four bugs:**
In P1, flag **any** un-interpolated `<...>` remaining in **any** pickle step's text as a `LoadFeatureError`. That single check catches: this Background-in-Outline gap, a `<typo>` in a placeholder name, the dropped-trailing-pipe column, and the duplicate-header column (all in Pitfall 7's table). Gherkin will never do this for you — its maintainer's position is that the parser *cannot* tell a substitution pattern from accidental Gherkin text.

Also correct `spec/behaviors/03-rules-outlines-and-testclock.md` and ADR-EC-014's Consequences to state this exception explicitly, since ADR-EC-014 currently reads as though `compile()` substitutes everywhere.

**Warning signs / concrete test:**
P1 fixture with `<x>` in a Background step under a Feature that has an Outline → must error, not produce an undefined-step failure.

**Phase to address:** P1 (detect), P7 (regression), plus a spec correction to ADR-EC-014.

---

### Pitfall 12: `Pickle.steps` gives you no way to tell a Background step from a Scenario step [VERIFIED]

**What goes wrong:**
`compile()` stacks Feature Background → Rule Background → Scenario steps in one flat `Pickle.steps` array with **no marker**. Reproduced for `Scenario: in rule`: `["bg with <name> placeholder", "rule bg", "r step"]` — indistinguishable by shape.

ADR-EC-004 accepted "no distinguished Background-failure category," which is fine. But three other things do need the distinction:
- `BeforeStep`/`AfterStep` hooks (P6) — should they fire for Background steps?
- Error messages — "Scenario failed at step 1" is unhelpful when step 1 is a Feature Background step defined in a different part of the file.
- ADR-EC-006's negative consequence ("a Background running against a `shared` Layer must reset shared state itself") can't be enforced or even warned about without knowing which steps are Background.

This is permanent upstream, not an oversight. cucumber-js closed [#2388](https://github.com/cucumber/cucumber-js/issues/2388) as WONTFIX — *"the background steps are folded into the scenario… Changing this seems like a breaking change"* — and Gherkin's own [#11](https://github.com/cucumber/gherkin/issues/11) has been open since the design was made. cucumber-js's own `getGherkinStepMap` helper **also loses the distinction**, flattening Background and Scenario steps into one record.

**How to avoid:**
Recover it during P1 correlation: each `PickleStep.astNodeIds[0]` is the **source `Step` node id**, so build an explicit `Set<backgroundStepId>` while walking the `GherkinDocument` and tag every step in `loadFeature`'s output as `origin: "feature-background" | "rule-background" | "scenario"`. Cheap at correlation time, expensive to retrofit into the runner later.

Do **not** rely on the tempting shortcut: in an *Outline* pickle, Background steps have `astNodeIds.length === 1` while Scenario steps have `length === 2` (they carry the Examples-row id) — but in a *plain* Scenario pickle both are length 1, so the heuristic gives no signal exactly half the time.

**Warning signs:**
P6 planning discovers it has no way to answer "is this a Background step?" and either guesses or reimplements Background stacking — which ADR-EC-014 explicitly forbids.

**Phase to address:** P1 (produce the tag), consumed in P5/P6.

---

### Pitfall 13: `new CucumberExpression(...)` throws at CONSTRUCTION for an unregistered `{customType}` [VERIFIED]

**What goes wrong:**
`CucumberExpression`'s constructor eagerly parses and resolves parameter types against the registry. Reproduced:

```
new CucumberExpression('I pay {money}', registry)
  → UndefinedParameterTypeError: This Cucumber Expression has a problem at column 7
```

Not at `.match()` time — at `new`. If the DSL compiles a `CucumberExpression` eagerly inside `Given(...)` (i.e. at describe-collection time), then **module evaluation order becomes load-bearing**: any custom parameter type registered later — in a `beforeAll`, in a module imported after the steps module, or in the user's `vitest.config` setup file — throws a collection-time error that aborts the whole test file, with a message that names a column number and not the step or the file.

Additionally [VERIFIED]: a `CucumberExpression` **snapshots** its resolved parameter types at construction. Registering a type afterwards does not affect an already-constructed expression, so a memoized expression cache silently serves stale bindings.

**How to avoid:**
1. Compile lazily — construct the `CucumberExpression` on first `match()`, memoized per `(registry, pattern)` pair, never per-pattern-only.
2. Catch `UndefinedParameterTypeError` at the DSL boundary and re-throw a `StepPatternError` naming the pattern, the Feature file, and the fix ("register `{money}` before `describeFeature` runs").
3. Document that custom parameter types must be registered at module scope, before the steps module's `describeFeature` call — and give a `defineParameterTypes([...])` entry point that runs at import time.

**Warning signs / concrete test:**
P2 test: construct the DSL with a `{money}` pattern and *no* registration → assert a `StepPatternError` naming `money`, not a raw `UndefinedParameterTypeError`.

**Phase to address:** P2.

---

### Pitfall 14: `ParameterTypeRegistry.defineParameterType` throws on a duplicate name — including built-ins [VERIFIED]

**What goes wrong:**
`new ParameterTypeRegistry()` is **not empty**: its constructor calls `defineDefaultParameterTypes` and pre-registers 11 built-ins — `int, float, word, string, "" (anonymous), double, bigdecimal, byte, short, long, biginteger`. `defineParameterType` then throws `CucumberExpressionError: There is already a parameter type with name X` on any collision. Reproduced for a user-defined `money` registered twice, and for a user trying to override the built-in `int`.

This collides head-on with ADR-EC-007's correction, which assumes **"one registry per `loadFeature` call/process"** while also assuming custom types are registered "up front (mirroring `@amiceli/vitest-cucumber`'s own top-level call pattern)". Those two halves are incompatible:

- **Registry per `loadFeature` call** + top-level `defineParameterType(...)` → the top-level call runs **once** per ESM module evaluation and lands in whichever registry existed then. Feature files loaded afterwards get fresh registries **without** the custom type → Pitfall 13's construction-time throw.
- **Process-global registry** + a registration function called from `describeFeature` → the **second** Feature file in the same worker throws "already a parameter type with name X".

vitest's isolation setting decides which of these you hit, so the bug is *configuration-dependent and non-deterministic across environments* — passes locally with `isolate: true`, fails in CI with `pool: 'threads', isolate: false`, or vice versa. (MEDIUM confidence on the exact isolate interaction; HIGH on the duplicate-throw and the built-in pre-population, both reproduced.)

**How to avoid:**
Pick **one** model and make it total. Recommended, and consistent with the rest of this project's design:

- **Custom parameter types are data, not a side effect.** `defineParameterType` does not mutate a hidden global; it appends to an exported, immutable-ish array of `ParameterType` descriptors.
- `loadFeature` (or `describeFeature`) builds a **fresh `ParameterTypeRegistry` per call**, replaying that array into it. Fresh registry per call means duplicate-name throws can never happen across features, and Pitfall 13's ordering trap is gone because registration always precedes construction.
- Guard registration with `registry.lookupByTypeName(name)` and raise a `DuplicateParameterTypeError` naming both definition sites — never let the raw cucumber error surface.
- Explicitly reject any of the 11 built-in names at *definition* time (not at replay time), so the error points at the user's `defineParameterType` call.

**This is the single most-reported failure in this whole library category.** The closest analogue to what this project is building — `cypress-cucumber-preprocessor`, which also feeds Gherkin into a foreign runner with per-spec bundling — has at least three separate issues for exactly this: [#298](https://github.com/badeball/cypress-cucumber-preprocessor/issues/298) (two spec files importing a shared module that calls `defineParameterType`; the user's workaround was literally a `#pragma once` boolean guard), [#364](https://github.com/badeball/cypress-cucumber-preprocessor/issues/364) (*"if I redefine the custom parameter type in multiple files the test errors with `There is already a parameter type with name {parameter_name}`"*), and [#549](https://github.com/badeball/cypress-cucumber-preprocessor/issues/549). The root cause in cucumber-js is `export default new SupportCodeLibraryBuilder()` — a module-level singleton, whose cost cucumber-js documents at length in its own installation guide (it explicitly analogises it to React's duplicate-React "invalid hook call" problem).

**This is one place where Effect genuinely buys something the whole ecosystem lacks:** make the `ParameterTypeRegistry` a value in a `Layer`, not a module singleton, and the entire failure class disappears by construction.

One more idiom worth copying from cucumber-js: `buildStepDefinitions` **catches** `UndefinedParameterTypeError` and collects `undefinedParameterTypeName`s for a single consolidated report rather than throwing on the first one.

**Warning signs / concrete test:**
P2 tests: (a) two `describeFeature` calls in one module, both using the same custom type → both must work; (b) two definitions of `money` → a `DuplicateParameterTypeError` naming both; (c) defining `int` → a clear "cannot override built-in" error; (d) an **empty** `.feature` file → a named error, not a crash (`cypress-cucumber-preprocessor#298` reports `Cannot read property 'name' of undefined` for exactly this).

**Phase to address:** P2 — and this needs a **spec amendment to ADR-EC-007's correction**, which currently states a lifecycle that cannot be implemented as written.

---

### Pitfall 15: Step ambiguity is entirely the library's problem, and the default (first match wins) is silently wrong [VERIFIED]

**What goes wrong:**
`cucumber-expressions` does **not** detect two *step patterns* both matching one step text. `AmbiguousParameterTypeError` only fires for `RegularExpression` parameter-type lookup, never for `CucumberExpression`. Reproduced:

```
'I have {int} apples'  .match('I have 5 apples') → [5]     (number)
'I have {word} apples' .match('I have 5 apples') → ["5"]   (string)
```

Both match. If the runner takes the first registration, the step's argument type depends on **DSL registration order** — the value is `5` or `"5"` depending on which `Given` was written first. A refactor that reorders step definitions silently changes test semantics. `cucumber-js` treats this as a hard "Multiple step definitions match" error.

Symmetrically, **no** match is the other half: `'v {int}'.match('v 5.5')` returns `null` [VERIFIED]. An undefined step must fail loudly; a runner that skips unmatched steps produces a green test that asserted nothing — the same class of lie as Pitfall 8.

**How to avoid:**
In P2, match against **all** registered patterns, not the first:
- 0 matches → `UndefinedStepError` (step text, Feature file + line, and — a genuine differentiator — a suggested `Given("...", ...)` snippet, which `CucumberExpressionGenerator` in the same package can generate for you).
- \>1 match → `AmbiguousStepError` listing every matching pattern.
- exactly 1 → run it.

Both must be **failures of the Scenario's Effect**, not thrown exceptions, so they land in the error channel (ADR-EC-001) — and ideally raised at collection time, not run time, since they are static properties of the feature+steps pair.

**How cucumber-js actually does it** (worth matching, since users' expectations come from there): matching happens at assemble time but the **verdict is deferred to run time** — 0 matches → status `UNDEFINED` plus an auto-generated snippet suggestion; >1 → status `AMBIGUOUS` with a `"Multiple step definitions match:"` table of pattern + source location; subsequent steps become `SKIPPED`; the run continues and the *process* exits non-zero at the end. Under ADR-EC-004 (one `it.effect` per Scenario) the natural translation is: fail the Scenario's Effect at the offending step, which gives fail-fast for free via INV-EC-001.

**Copy one specific bug fix rather than rediscovering it:** cucumber-js [PR #2836](https://github.com/cucumber/cucumber-js/pull/2836) (shipped 13.0.0, 2026-06) — *"When a test case has been explicitly skipped, mark subsequent pickle steps as skipped rather than evaluating for step definition matches."* Check `@skip` **before** resolving step definitions, or an explicitly-skipped Scenario reports spurious UNDEFINED/AMBIGUOUS errors. Directly relevant to P8.

**Warning signs / concrete test:**
P2 tests for the `{int}`/`{word}` ambiguity above and for an unmatched step. Both must error. Plus a P8 test: a `@skip`-tagged Scenario with a deliberately unmatched step must report *skipped*, not *undefined*.

**Phase to address:** P2, with the skip-ordering rule enforced in P8.

---

### Pitfall 16: `@cucumber/messages` is not declared, so `IdGenerator` will not resolve [VERIFIED — live bug in this repo]

**What goes wrong:**
`compile(doc, uri, newId)` and `new AstBuilder(newId)` both require an `IdGenerator.NewId`. **`@cucumber/gherkin` does not re-export `IdGenerator`** — it lives in `@cucumber/messages`, which gherkin declares as a *regular* dependency pinned `">=34.0.0 <35"`.

`packages/gherkin/package.json` currently declares only:

```json
"dependencies": { "@cucumber/gherkin": "^42.0.1", "@cucumber/cucumber-expressions": "^20.1.0" }
```

and `packages/gherkin/node_modules/@cucumber/` contains only `gherkin` and `cucumber-expressions`. Under pnpm's strict, non-hoisting `node_modules`, `import { IdGenerator } from "@cucumber/messages"` from `packages/gherkin/src` **will not resolve**. I hit exactly this while probing:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@cucumber/messages'
```

This is not a future risk — it is a present defect that will stop the very first line of `loadFeature` from compiling or running.

**Why it happens:**
npm's flat hoisting would have made this work by accident. pnpm's isolated layout — which this repo uses — correctly refuses to resolve an undeclared transitive dependency. The failure therefore appears only once someone writes the import, not at install time.

**How to avoid:**
Add it explicitly, **matching gherkin's own range** so the two cannot diverge into separate instances (`Pickle`, `GherkinDocument`, and every message type would then be structurally distinct across the boundary):

```json
"dependencies": {
  "@cucumber/gherkin": "^42.0.1",
  "@cucumber/messages": ">=34.0.0 <35",
  "@cucumber/cucumber-expressions": "^20.1.0"
}
```

Every `@cucumber/messages` **type** (`Pickle`, `GherkinDocument`, `PickleStep`, `Location`) that appears in `@effect-cucumber/gherkin`'s public API is also part of that API surface — plan to either re-export the ones consumers need or wrap them in this library's own types, so a consumer is not forced to add `@cucumber/messages` to their own `package.json`.

**Warning signs / concrete test:**
The first `import { IdGenerator } from "@cucumber/messages"` fails to resolve. A P0 check that `tsc -b` plus a trivial `node -e "import(...)"` smoke test both pass from inside `packages/gherkin` catches it immediately.

**Phase to address:** **P0** — it blocks P1's first line of code.

---

### Pitfall 17: `effect` declared as a `dependency` instead of a `peerDependency` — and in v4 the resulting duplicate is **silent** [VERIFIED in this repo + reproduced against the registry]

**What goes wrong:**
Both `packages/gherkin/package.json` and `packages/vitest/package.json` currently declare `"effect": "4.0.0-rc.112"` — an **exact pin** in `dependencies`. `@effect/vitest` is likewise a plain `dependency` of `packages/vitest`.

Every one of the **30 first-party `@effect/*` packages** on the v4 line does the opposite, without exception:

```jsonc
// @effect/vitest, @effect/platform-node, @effect/sql-pg, @effect/ai-openai,
// @effect/opentelemetry ... all identical in shape
"peerDependencies": { "effect": "^4.0.0-rc.112" },   // caret range, no `dependencies` entry at all
"devDependencies":  { "effect": "4.0.0-rc.112" }     // exact, for local builds only
```

Reproduced with this repo's own pnpm 10.26.1 (a library on rc.111, an app on rc.112):

| library declares | result |
|---|---|
| exact pin in `dependencies` | **two copies** of `effect` installed, **silently, no warning** |
| `peerDependencies: "^4.0.0-rc.112"` | **one shared copy**; npm warns loudly on a real mismatch |

**Why v4 makes this worse than v3.** Effect v3 shipped `effect/GlobalValue`, whose whole purpose was to let duplicate copies share singletons. **v4 removed that module** (`unpkg.com/effect@4.0.0-rc.112/dist/GlobalValue.js` → 404; the v3 path → 200). Meanwhile v4 identifies its types with **string literals** (`"~effect/Effect"`, `"~effect/Layer"` — 240 of them) and `Symbol.for` rather than module-local symbols. Net effect: **brand checks pass across duplicate copies**, so you get no clean type error and no clean runtime guard — instead you get two independent runtimes silently disagreeing, surfacing much later as a wrong `Context` lookup, a mis-classified `Cause`, or a `TypeError: X is not a function`. I revised this entry: an earlier draft said duplicates produce an obvious "Effect is not assignable to Effect" type error. That is the *v3* failure mode. **In v4 the failure is quiet and late, which is strictly worse.**

Documented downstream precedents (MEDIUM–HIGH, from consumer repos):
- **`@systemfsoftware/effect-gherkin-spec@2.0.0`** — a Gherkin-on-Effect library, i.e. this project's near-twin — published `effect: "4.0.0-rc.108"` as an **exact peer** and produced two copies for anyone on rc.109. Fixed in 2.0.1 by moving to `^4.0.0-rc.111`.
- `prisma/composer#196` — `TypeError: Schedule.either is not a function` from beta.93 and beta.102 coexisting. Their note: *"this monorepo uses pnpm, which merely warns… Only a standalone npm install triggers the failure"* — i.e. **your own pnpm workspace will not reproduce your users' breakage.**
- Two runtimes could not share `Context`/`Cause`; teardown misclassified a foreign `Cause` and exited 1 with no output.

**How to avoid:**
Before publishing anything:
```jsonc
"peerDependencies": { "effect": "^4.0.0-rc.112", "vitest": ">=4.1.0 <5.0.0" },
"devDependencies":  { "effect": "4.0.0-rc.112",  "vitest": "4.1.11" }
```
Same for `@effect/vitest` in `packages/vitest`. `@cucumber/gherkin` and `@cucumber/cucumber-expressions` stay real `dependencies` — they carry no shared runtime identity.

Semver mechanics, verified empirically with `semver@7.8.5`. `^4.0.0-rc.112` desugars to `>=4.0.0-rc.112 <5.0.0-0`:

| version | exact `4.0.0-rc.112` | `^4.0.0-rc.112` | `^4.0.0` |
|---|---|---|---|
| `4.0.0-rc.111` | no | no | no |
| `4.0.0-rc.113` | **no** | **yes** | no |
| `4.0.0` stable | no | **yes** | yes |
| `4.1.0` | no | **yes** | yes |
| `4.1.0-rc.1` | no | **no** | no |

Two consequences: the caret is a **floor**, not a pin — it carries you forward to 4.0.0 stable and all of 4.x for free. And **`^4.0.0` matches no rc at all**, so a library publishing `^4.0.0` today is uninstallable for every current Effect user. (The governing rule: a prerelease version only satisfies a comparator set if some comparator shares its `[major, minor, patch]` tuple *and* has a prerelease tag — [node-semver README](https://github.com/npm/node-semver#prerelease-tags).) Several published third-party packages get exactly this wrong: `@effect-aws/*` shipped `effect: ">=4.0.0 <5.0.0"` across five prereleases — a range **nothing installable could satisfy**.

Ecosystem context (HIGH, npm registry): of ~259 third-party packages declaring `effect` at 4.x, **123 use an exact rc pin** — the risky majority — versus 25 using the caret-rc convention. Doing this correctly puts `effect-cucumber` in the better-behaved minority.

**Warning signs / concrete test:**
P0 CI check: install the built tarball into a scratch consumer pinned to a *different* rc, then assert `pnpm ls effect` reports exactly one version — and repeat with `npm`, since **pnpm only warns where npm fails**. Do not use the workspace itself as the test; it will always pass.

**Phase to address:** **P0**, before any publish. A 5-minute fix now; a breaking release plus silent user breakage later.

---

### Pitfall 18: Reading the Effect changelog as if `### Patch Changes` meant "patch" [HIGH]

**What goes wrong:**
Effect's `.changeset/pre.json` is `{"mode":"pre","tag":"rc"}`. In changesets **pre-mode, major/minor/patch all collapse into a single `rc.N` increment**, so every entry lands under `### Patch Changes` regardless of severity. Breaking removals are routinely filed as "patch". None of the five RCs has a `Major Changes` section — and that proves nothing.

So the natural upgrade heuristic ("only patch changes, safe to bump") is exactly wrong. Measured against the published tarballs:

| window | rc bumps | exports **removed** | exports added |
|---|---|---|---|
| beta.100 → rc.108 | 8 | **68** | 167 |
| rc.108 → rc.112 | 4 | 3 | 310 |

The RC train is mostly additive **at the name level**, but keeps breaking at the **signature level**, which name-diffing misses: `Match.ValueMatcher` gained a 7th type parameter between rc.108 and rc.112 (breaks any hand-written annotation); `Pool.State`'s interface changed; rc.110 added a CLI option that rc.112 removed two RCs later.

And **rc.113 is already queued to be loudly breaking** — all entries typed `patch`: `Socket.run`/`runString`/`runRaw` removed with `Socket.make` resignatured; `Config` constructors renamed to PascalCase with `mapOrFail` → `mapEffect`; msgpack encoding removed; **runtime TypeId marker strings realigned** (which is precisely the identity mechanism Pitfall 17 depends on).

The changelog itself is good — 3,519 lines, per-PR, at [`packages/effect/CHANGELOG.md` on `main`](https://raw.githubusercontent.com/Effect-TS/effect/main/packages/effect/CHANGELOG.md). Note it lives on `main` (there is no `v4`/`next` branch) and is **not** shipped in the npm tarball, so `node_modules` cannot tell you what changed.

Also note the RC post's stability promise — *"we have no more broad breaking changes planned… our interfaces are now presumed final"*, with the caveat *"if a narrowly scoped breaking change proves necessary, we will communicate it clearly."* The rc.113 queue is exactly those narrowly-scoped breaks, and there are several.

**How to avoid:**
- Treat every rc bump as potentially breaking. Bump `effect` deliberately, in its own commit, with the full test suite as the gate — never as an incidental lockfile refresh.
- Read `packages/effect/CHANGELOG.md` **and** the open `.changeset/` directory (which previews the *next* rc) before bumping.
- ADR-EC-012's negative consequence — *"every `@effect/vitest` API surface referenced in this spec needs re-verifying against each v4 beta bump"* — is correct and should become a real checklist item, not a note. Good news: **`@effect/vitest` had zero first-party changes across rc.108 → rc.112** (every entry is `Updated dependencies`), so the surface this project depends on has been stable across the RC train. Its one recent material change was at beta.103: it now requires **Vitest ≥ 4.1**, dropping Vitest 3 and 4.0 — which this repo already satisfies.
- Keep this project's own type-test file (Pitfall 4) and acceptance suite as the rc-bump regression gate. They are cheaper and more reliable than reading changelogs.

**Warning signs:**
A green `tsc -b` after an rc bump is **not** sufficient — signature changes to types you do not annotate will pass. Run the full acceptance suite.

**Phase to address:** **P0** (write the rc-bump checklist into the repo), reinforced by P4's type tests and P10's acceptance suite.

---

### Pitfall 19: The `latest` dist-tag points at v3 — install instructions that omit `@rc` install the wrong major [HIGH]

**What goes wrong:**
As of 2026-08-28 (verified against `registry.npmjs.org`):

```
effect          latest: 3.22.1        rc: 4.0.0-rc.112     ← 4.0.0 stable does not exist
@effect/vitest  latest: 0.30.0        rc: 4.0.0-rc.112     ← latest is the v3 line
```

A user following a README that says `pnpm add effect @effect/vitest` gets **v3** and a pile of incomprehensible type errors against a v4-only library. Some v4-only packages are worse still: their `latest` is stuck at `4.0.0-beta.107` while `rc` is `4.0.0-rc.112`, so a bare install silently lands on a **beta**.

**How to avoid:**
Every install instruction this project publishes must carry the tag: `pnpm add effect@rc @effect/vitest@rc`. Add a runtime/startup check or a clear `peerDependencies` range (Pitfall 17) so a v3 install fails with a message that names the problem. State the required Effect line prominently in the README — this is the single most likely first-run failure for a new user.

**Phase to address:** P0 (README + install docs), P10.

---

### Pitfall 20: pnpm `catalog:` expands at pack time, turning a pinned catalog into a pinned peer [MEDIUM–HIGH]

**What goes wrong:**
If this workspace adopts pnpm catalogs (a natural next step for keeping `effect` and `@effect/vitest` in lockstep across `packages/gherkin` and `packages/vitest`), note that a `catalog:` reference **expands to its literal value at `pnpm pack` time**. A catalog holding an exact pin therefore publishes an exact **peer** range — reintroducing Pitfall 17 through the back door, invisibly, since the workspace's own `package.json` files still just say `catalog:`.

This is exactly how `@systemfsoftware/effect-gherkin-spec@2.0.0` — again, this project's near-twin — shipped `effect: "4.0.0-rc.108"` and broke for rc.109 consumers.

**How to avoid:**
If you adopt catalogs, the catalog entry for a **peer** dependency must hold a *range* (`^4.0.0-rc.112`), not a pin. Keep the exact pin only in `devDependencies`. Verify by inspecting the **packed tarball's** `package.json`, not the source one:

```sh
pnpm pack && tar -xzOf *.tgz package/package.json | grep -A3 peerDependencies
```

**Phase to address:** P0, as part of the packaging check.

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or bad DX rather than wrong results.

---

### Pitfall 21: Every generated Scenario reports the same source location [VERIFIED]

**What goes wrong:**
vitest derives a test's location from `new Error().stack` at registration. Dynamically generated tests all originate at the **same line inside the library**. Reproduced: four tests generated in nested loops all reported `b.test.ts:28:40`; two tests in one loop both reported `b.test.ts:20:8`.

Consequences: IDE gutter run-buttons point at library internals; `vitest path/to/file.ts:42` line-filtering cannot select a Scenario; click-to-source in the vitest UI is useless; failure output points away from the `.feature` file the author actually needs to read.

Two aggravating details: vitest caps `Error.stackTraceLimit` at **10** frames while collecting a test, so a sufficiently deep call chain (easy to hit through Effect) yields `location: undefined` outright. And line-filtering (`vitest file.ts:42`) is **exact line equality**, so it either errors `No test found in <file> in line N` or runs everything under the matched suite.

**Is this a reason to switch to codegen?** No — and it is worth being precise, because `playwright-bdd`'s much-cited decision does **not** say what it is usually quoted as saying. Its FAQ gives three reasons for pre-generating files, and all three are about **config-time** generation: *"the Playwright config is executed many times from different sources: workers, VS Code extension, UI mode"*; watch mode is tricky; and in `--ui` mode a change to generated test files triggers a run that regenerates them — *"a circular dependency."* Playwright additionally **forbids runtime test creation outright** (`test()` may not be called from a config file or an async `describe`), for a reason its maintainer states plainly: *"we can't afford expensive / asynchronous test generation."*

None of that applies here. This project's parse is synchronous and cheap, it produces **no artifacts** (so there is no regeneration loop), and vitest explicitly supports dynamic generation — its maintainers say so: *"For the use case of dynamic test case generation, using await inside file or describe is a valid alternative"* and *"async describe is supported in Vitest, unlike Jest."* Playwright itself blesses **synchronous** loop-based generation from a file read at load time. So `spec/overview.md`'s decision is sound; this pitfall is a known cost of it, not evidence against it.

And codegen is not free: `playwright-bdd` shipped **wrong test locations for 2.5 years**, fixing them only in v9.3.0 by emitting Source Map v3 files; still [cannot run or debug from a `.feature` file](https://github.com/vitalets/playwright-bdd/issues/297); had no watch mode for years (the answer was `nodemon`); and needed a lock file to stop its watcher rewriting specs mid-run.

**How to avoid:**
Mitigate rather than fix:
- Put the `.feature` file and line into the test name: `it.effect(\`${pickle.name} (checkout.feature:${pickle.location.line})\`, ...)`. `Pickle.location` is per-row precise for Outlines.
- `task.location` is a **writable** property — overwriting it from the Gherkin AST is the obvious next step, though nothing documents support for a non-`.test.ts` path there. Treat as a spike, not a plan.
- `Effect.fn(stepText)` (ADR-EC-005) already names the frames; see Pitfall 31 for where that output actually lands.

**One API-naming trap to avoid while you are here:** vitest's VS Code extension collects tests by **parsing the AST**, not by running the file, so dynamically generated tests are invisible in the explorer until the file is run once. Worse, that collector matches any identifier that `startsWith('test')` or `endsWith('Test')` — so a public API named `testFeature()` or `featureTest()` would be **mis-detected** and produce garbage explorer entries. `describeFeature()` / `loadFeature()` are safely ignored. Keep the names as specified.

**Phase to address:** P5 (naming scheme), documented as a known limitation in P10.

---

### Pitfall 22: `@only` in a committed `.feature` file fails CI with a message that names the wrong thing [VERIFIED]

**What goes wrong:**
vitest defaults `allowOnly: !isCI`. BEH-EC-008 maps `@only` → `it.effect.only`. Reproduced:

```
local  : ✓ scenario tagged @only    ↓ other scenario    (works as intended)
CI=true: FAIL  Error: [Vitest] Unexpected .only modifier. Remove it or pass --allowOnly argument
```

A developer commits `@only` for a quick local loop, CI fails, and the message tells them to remove a `.only` modifier that appears nowhere in their TypeScript.

**How to avoid:**
Two options, and the second is better — see Pitfall 32.
1. Keep the `.only` mapping, but detect `@only` at collection time and raise the library's own error when `process.env.CI` is set: *"Scenario 'X' in checkout.feature:12 is tagged @only; remove the tag before committing, or pass --allowOnly."* Naming the `.feature` file and line turns a 20-minute confusion into a 10-second fix.
2. **Map Gherkin tags to vitest v4's native test tags instead**, which sidesteps `allowOnly` entirely and generalises to the arbitrary tags `spec/roadmap.md` currently parks. See Pitfall 32 for the mechanics and the one catch.

**Phase to address:** P8.

---

### Pitfall 23: Scenario Outline rows can produce duplicate test names [VERIFIED]

**What goes wrong:**
`compile()` names an Outline pickle `interpolate(scenario.name, ...)`. If the Scenario Outline's title does not reference the column that actually varies (e.g. `Scenario Outline: applying a discount` with an `<amount>` column used only in a step), **every row gets the same test name**. Reproduced: vitest accepts duplicate names silently — two `scenario with n=1` entries, indistinguishable in reporters and both selected by the same `-t` pattern.

Duplicate names are not merely cosmetic in vitest v4:
- **Snapshot keys collide.** Keys are `` `${fullTestName} ${counter}` `` with a **per-name** counter, so two identically-named Scenarios share one counter and the second one's first snapshot reads the first one's second.
- **Task IDs are positional** (`${parent.id}_${idx}`), so reordering Scenarios in a `.feature` shifts every id downstream — breaking the VS Code extension's "run this one test" and any stored `testIds`.
- **`-t` compiles to a RegExp**, so Scenario titles containing `(`, `)`, `?`, `.`, `+` misbehave under filtering. Note this is *not* hypothetical for a Gherkin tool — cucumber-expression optionals mean parenthesised text like `apple(s)` is idiomatic in step and scenario prose (Pitfall 28).

**How to avoid:**
Disambiguate at emission: Pitfall 21's `(file:line)` suffix already does it, since `Pickle.location` is the Examples-row location and therefore unique per row. Prefer that — one mechanism, three problems. Use the **pickle id**, never the title, as internal identity.

**Phase to address:** P5/P7.

---

### Pitfall 24: `Parser.parse()` throws a cascading `CompositeParserException` [VERIFIED]

**What goes wrong:**
`parse()` collects errors and throws `CompositeParserException` (a thrown JS exception — must be wrapped in `Effect.try`, it will not arrive in an error channel by itself). Its `.message` concatenates every error, and its own `.location` is `undefined` — locations live only on the individual `.errors[]` entries.

Worse, errors **cascade**: a single misplaced tag before a `Background:` produced **11** errors covering the entire rest of the file, all reading `expected: #TagLine, #RuleLine, #Comment, #Empty`. The parser also hard-stops at 10 collected errors (`if (context.errors.length > 10) throw`). So the real problem — one bad line — is buried under ten misleading ones.

There are also **two different error shapes** depending on a flag. [VERIFIED] `Parser`'s class field is `stopAtFirstError = false` by default, which is the accumulate-then-throw-composite path above. If it is ever set `true`, `parse()` instead throws a **bare `UnexpectedTokenException` with no `.errors` array**. Any handler that reaches for `.errors` unconditionally will throw a `TypeError` while handling a parse error — the worst place to have a second bug.

**How to avoid:**
Wrap in `Effect.try`, and normalise defensively the way cucumber-js does — `err.errors ?? [err]` — into a typed `GherkinParseError` carrying `errors: ReadonlyArray<{ message, line, column }>` (locations live on the individual entries, never on the composite). **Report only the first error prominently** with the rest collapsed. Verify against a fixture whose only defect is on line 4, and against one parsed with `stopAtFirstError = true`.

**Phase to address:** P1.

---

### Pitfall 25: A custom parameter type's `transform` may return a Promise, and throws escape the Effect channel [VERIFIED]

**What goes wrong:**
`ParameterType`'s transform is typed `(...match: string[]) => T | PromiseLike<T>` and `Argument.getValue()` returns it **unwrapped**. Reproduced: an `async` transform yields `typeof v === "object"`, `v instanceof Promise === true` — the step receives a `Promise` where its parameter type says `number`. `cucumber-js` awaits it; this library, if it does not, hands a Promise to the step body.

Separately [VERIFIED]: a transform that throws throws **synchronously out of `getValue()`**, i.e. during argument extraction, outside the step's Effect — bypassing ADR-EC-001's structured error channel.

**How to avoid:**
Either (a) type the public `defineParameterType` API to reject async transforms (`transform: (...m: string[]) => T` with no `PromiseLike`), which is the simplest and most Effect-idiomatic choice, or (b) accept `Effect<T, E>` transforms and sequence them in the step's Effect. Run argument extraction inside `Effect.try` regardless, mapping a throwing transform to a typed `ParameterTransformError` naming the type and the raw text.

**Phase to address:** P2.

---

### Pitfall 26: `Effect.provide` composition order decides whether retries reset state [VERIFIED]

**What goes wrong:**
Verified with `it.flakyTest` (which is `Effect.retry(Schedule.recurs(10))` + `Effect.orDie` — up to **11 attempts inside a single test**):

```
Effect.gen(...).pipe(Effect.provide(World.layer))   wrapped in flakyTest
  → [layer build] × 3, refTotal = 1 on every attempt   ✅ fresh per attempt
  → closureTotal = 1, 2, 3                             ❌ closure `let` leaks
```

Two findings:
1. **ADR-EC-009's footgun is reproducible within one test run**, not just across watch-mode reloads. `spec/roadmap.md` lists "does a retried Scenario rebuild its per-Scenario Layer fresh per attempt?" as an open question — **the answer is yes, but only if `Effect.provide(layer)` is applied *inside* the retried Effect.**
2. If the runner instead composes `it.flakyTest(scenarioEffect).pipe(Effect.provide(layer))`, the Layer is built **once** and the World's `Ref`s leak across attempts — silently reintroducing exactly the cross-run state leakage ADR-EC-002 and ADR-EC-009 exist to prevent, *while the user is doing everything right*.

**How to avoid:**
Fix the composition order in P5 and pin it with a test: a Scenario whose Layer builder increments a module-level counter, retried 3 times, must show 3 builds. Record the answer in `spec/roadmap.md` (closing the open question) and add it to INV-EC-002's enforcement mechanism.

**Phase to address:** P5, closing a `spec/roadmap.md` § Planned open question.

---

### Pitfall 27: A `shared` Layer's typed error `E` becomes an unrecoverable defect [VERIFIED by inspection]

**What goes wrong:**
`@effect/vitest`'s `layer()` does `Layer.buildWithMemoMap(...).pipe(Effect.orDie, ...)`. A `shared` Layer with a typed failure channel (`Layer<Db, DbConnectError>` — the realistic case: a testcontainer that fails to start) does **not** surface as a typed failure. `Effect.orDie` converts it to a defect, reported as an unhandled error out of `beforeAll`, detached from any Scenario.

**How to avoid:**
Either constrain `describeFeature`'s `shared` option to `Layer<R, never, never>` (forcing the user to handle failures with `Layer.catchAll`/`Layer.orDie` themselves, where the types make the choice visible), or wrap the shared Layer in `Layer.tapError` to emit a diagnostic naming the Feature before it dies. The first is preferable — it is a type-level constraint, testable in the P4 type-test file.

**Phase to address:** P9, with the type constraint declared in P4.

---

## Minor Pitfalls

---

### Pitfall 28: Cucumber-expression punctuation quietly changes matching [VERIFIED]

`CucumberExpression.escapeRegex` escapes `([\\^[({$.|?*+})\]])` but **not** `(`/`)`/`/` as *literals* — they are the expression language's own syntax:

```
'I have 5 apple(s)'  → /^I have 5 apple(?:s)?$/     matches both "apple" and "apples"
'I am happy/sad'     → /^I am (?:happy|sad)$/       alternation
```

Expressions are also anchored (`^...$`) — `'foo'` does not match `'xfoox'`. And `{float}` matches integer text (`'v 5'` → `5`) while `{int}` does **not** match `'v 5.5'` (returns `null` → undefined step).

**How to avoid:** document these in the step-pattern docs with these exact examples. The `(s)` behavior is usually *desirable*, but users who type a literal parenthesis are surprised. `Pitfall 15`'s undefined-step snippet suggestion is the safety net for the `{int}`/`5.5` case.

**Phase to address:** P2 docs, P10 doc-example compile check.

---

### Pitfall 29: `layer(...)`'s block loses `it.live` [VERIFIED by types]

Inside `layer(L)(...)`, the callback receives `Vitest.MethodsNonLive<R>` — which has `effect`, `flakyTest`, `layer`, `prop`, but **no `live`**. A Feature using a `shared` Layer therefore cannot opt a Scenario out of the simulated clock through the DSL. Minor, but it means the `shared` and per-Scenario code paths do not have identical capability surfaces — worth stating rather than discovering.

**Phase to address:** P9.

---

### Pitfall 30: Feature-level `Background` placement is order-dependent and asymmetric [VERIFIED by source]

In `compile()`, a Feature-level `Background` **replaces** `featureBackgroundSteps` (`= [].concat(...)`) while a Rule-level `Background` **appends** (`ruleBackgroundSteps.concat(...)`). And `featureBackgroundSteps` is assigned as `feature.children` is iterated — so a `Background:` written *after* a `Rule:` in the file does not apply to that Rule. Gherkin syntax permits it; the semantics silently differ from what the author expects.

**How to avoid:** `loadFeature` should warn (or error) on a Feature-level `Background` that appears after any `Rule` child. One-line check during the P1 AST walk.

**Phase to address:** P1.

---

### Pitfall 31: The step name lands in a log line, not in vitest's failure panel [VERIFIED]

**What goes wrong:**
Good news first: `Effect.fn(stepText)` **does** work with a step text computed at runtime, which is how `describeFeature` will call it. Verified — a failing step produced:

```
at I have 5 apples (h.test.ts:8:88)
at I have 5 apples (definition) (h.test.ts:4:21)
```

The problem is *where* that appears. `@effect/vitest`'s `runPromise` calls `Effect.logError(...)` on every failure **before** re-raising, so the named frames land in a **stdout** block. vitest's own `Failed Tests` panel — the thing a developer actually reads — instead shows:

```
❯ Object.~effect/Effect/successCont  effect/src/internal/effect.ts:1365
❯ Object.~effect/Effect/evaluate     effect/src/internal/effect.ts:1377
❯ FiberImpl.runLoop                  effect/src/internal/effect.ts:655
...
```

Seven frames of Effect fiber internals and no step text. Combined with Pitfall 21 (every Scenario reports the same source location), a failing Scenario gives the reader: a test name, a generic error message, a stack pointing into `effect`'s internals, and a separate stdout block they have to scroll to. For a BDD tool whose whole pitch is legibility, that is a poor first failure experience — and it is the failure experience *by default*, with no misuse required.

**How to avoid:**
Do not rely on the stack. Put the information in the places vitest renders prominently:
- **Test name** — `${scenarioName} (${featureFile}:${line})` (Pitfall 21 already recommends this for a different reason; one change, three problems solved).
- **Error message** — wrap the scenario Effect so a step failure is re-raised with a message that *leads* with the step: `Step "I have 5 apples" (checkout.feature:9) failed: <original>`. The runner knows which step it was executing; the user's error type does not.
- Consider `Effect.tapErrorCause` at the scenario boundary rather than fighting `runPromise`'s built-in `logError`.

**Warning signs:**
P10 acceptance check: deliberately fail a step and read the output as a newcomer would. If you cannot tell which Gherkin step failed without scrolling to a stdout block, it is not done.

**Phase to address:** P5, alongside Pitfall 21's naming scheme; validated in P10.

---

## Late-Surfacing Pitfalls

Found by the ecosystem survey after the sections above were written. Severity is **Moderate to Critical**, not minor — they are grouped here only because they arrived last. Pitfall 32 in particular is as much an opportunity as a hazard.

---

### Pitfall 32: vitest v4 has native test tags — but the tag universe must be declared in config, or registration throws [VERIFIED in source]

**What goes wrong (and the opportunity):**
vitest v4 ships a first-class tag API that maps almost exactly onto Gherkin tags:

```ts
it.effect(pickle.name, { tags: pickle.tags.map((t) => t.name) }, fn)
```
```sh
vitest --tagsFilter '@slow && !@wip'    # supports &&, ||, !
vitest --listTags
```

`TestTagDefinition extends TestOptions`, so a tag can carry `timeout` / `retry` / `concurrent` — a natural home for `@slow` or `@flaky`. This is a better target for `@skip`/`@only` than `.skip`/`.only` (it sidesteps Pitfall 22's CI failure entirely) **and** it closes `spec/roadmap.md`'s parked "custom, non-reserved tags" item without inventing any API surface — exactly the kind of reuse ADR-EC-007 and ADR-EC-011 already favour.

**The catch:** the tag universe must be pre-declared in `vitest.config.ts` as `test.tags: TestTagDefinition[]`. An undeclared tag **throws at registration** — visible in `@vitest/runner`'s `createSuiteCollector`, which calls `createNoTagsError(runner.config.tags, tag)` when `runner.config.strictTags` is set and no definition matches:

```
Error: The Vitest config doesn't define any "tags", cannot apply "@smoke" tag for this test.
```

`strictTags: false` silences that, but `--tagsFilter` still errors without a declared registry. So Gherkin tag filtering requires enumerating the tags used across all `.feature` files **at config-load time**.

That is config-time work — precisely `playwright-bdd`'s objection #1 (Pitfall 21) — but it is a **read, not a codegen**: idempotent, artifact-free, and safe to repeat however many times vitest evaluates the config. The objection does not transfer.

**How to avoid:**
Design the tag story deliberately in P8 rather than reaching for `.only` because it is the obvious mapping:
- Emit Gherkin tags as vitest tags on every generated test regardless (free, and makes `--listTags` useful).
- Ship a small `gherkinTags(globPattern)` config helper that pre-scans `.feature` files and returns a `TestTagDefinition[]` for `vitest.config.ts`. Keep it cheap and dependency-light — it runs on every config evaluation.
- Keep `@skip` → `it.effect.skip` (harmless), but prefer tags over `.only` for `@only`.

**Warning signs / concrete test:**
P8 test: a Feature with `@slow` on one Scenario → `vitest --tagsFilter '@slow'` selects exactly that Scenario; and running without a declared tag registry produces the library's own error naming the `.feature` file, not vitest's raw `createNoTagsError`.

**Phase to address:** **P8** — and this is worth a short spec addition, since it upgrades `spec/roadmap.md`'s parked "custom tags" item from "not designed" to "mostly free".

---

### Pitfall 33: `@cucumber/gherkin` v42 allows a step to have BOTH a DocString and a DataTable [VERIFIED by source]

**What goes wrong:**
Changed in **v42.0.0** (2026-07, *"Allow steps to have both a DocString and a Datatable argument"*). `createPickleArguments` now returns both, with an `argumentIndex` recording source order:

```js
if (step.dataTable && step.docString) {
  const tableFirst = step.docString.location.line > step.dataTable.location.line
  return { docString: pickleDocString(tableFirst ? 2 : 1, ...), dataTable: pickleTable(tableFirst ? 1 : 2, ...) }
}
```

The natural handler — `if (arg.docString) {...} else if (arg.dataTable) {...}` — is the shape every pre-v42 example uses, and it **silently drops one argument**. ADR-EC-008 discusses data tables and doc strings as independent concerns and does not contemplate a step carrying both.

**How to avoid:**
Handle both in P3's step-argument mapping, and respect `argumentIndex` when deciding the order in which they are passed to the step function. Decide and document the calling convention now (does a step get `(dataTable, docString)` positionally, or one options object?) — changing it later is a public API break.

**Warning signs / concrete test:**
P3 fixture: a step with a DocString **and** a DataTable, in each of the two source orders. Both must reach the step body, in source order.

**Phase to address:** P3, with the calling convention recorded as a spec amendment to ADR-EC-008.

---

### Pitfall 34: Loop-variable capture when generating one test per Examples row

**What goes wrong:**
Generating N tests from N Examples rows means a loop that closes over per-row data. `@amiceli/vitest-cucumber` shipped exactly this bug and had to fix it ([PR #32](https://github.com/amiceli/vitest-cucumber/pull/32)): *"The synchronous loop over each of the examples causes the test runner to execute the test suite N times, but it does so on each iteration with the **last** item of example data."* Their fix survives on `main` as an IIFE snapshotting `[...scenarioStepsToRun]`.

`for (const row of rows)` with `const` is safe in modern JS, so the naive form of this bug is unlikely here. The **live** version for this project is subtler and is a direct cousin of ADR-EC-009: if the DSL accumulates registered steps into **one shared mutable array** and each generated `it.effect` reads that array at *execution* time, then by the time any test runs the array holds whatever the last registration pass left in it. Same class of bug, different shape — a single mutable structure read after registration finishes rather than during.

`@amiceli/vitest-cucumber` has two more instances of the same family worth knowing about: its Scenario Outline `context` object is constructed **once** and shared across all example rows, and its Background re-registers the **same handler closure** for every Scenario — so Background step state is created once and shared across all N repetitions. Both are precisely what ADR-EC-002 and ADR-EC-009 exist to prevent, observed in the closest competing library.

**How to avoid:**
Snapshot per row at registration: `const steps = [...collected]` inside the loop body, captured by that row's `it.effect` closure. State that reaches a step body must come from the Layer (a `Ref` from `World`, per ADR-EC-009), never from a structure the DSL is still mutating.

**Warning signs / concrete test:**
P7 test: a 3-row Outline where each row's step asserts on *its own* value. If all three tests see row 3's data, this is the bug. Run it with `--sequence.shuffle` too, so ordering cannot mask it.

**Phase to address:** P7, reinforcing ADR-EC-009's rule at the DSL-implementation level rather than only at the step-author level.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| `loadFeature` returns a Promise / `Effect` run with `runPromise` | Feels idiomatic; no `?raw`/`readFileSync` decision needed | Pitfall 2 — silently zero tests under `layer()`; unfixable without an API break | **Never.** This is the one API-shape decision that cannot be walked back. |
| `effect` as a plain `dependency` with an exact pin | Reproducible local builds, no peer warnings | Pitfall 17 — two `effect` runtimes that pass each other's brand checks, so failures are silent and late | Only while `private: true` and unpublished. Fix before the first `npm publish`. |
| First-matching-step-pattern wins | Simpler matcher, no ambiguity bookkeeping | Pitfall 15 — test semantics depend on definition order; silently changes under refactor | Never — the "match all, count them" version is ~6 extra lines. |
| Skip unmatched steps instead of failing | Partial features "work" during development | Green tests that assert nothing — the worst failure mode for a BDD tool | Never. Emit `it.effect.skip`/`todo` if you need the partial-progress feel. |
| One process-global `ParameterTypeRegistry` | Matches `@amiceli/vitest-cucumber`'s familiar pattern | Pitfall 14 — duplicate-name throws that depend on vitest's isolation config | Never — fresh-registry-per-`loadFeature` + replayed descriptors is not harder. |
| Eagerly compiling `CucumberExpression` at `Given()` time | Fail fast on a bad pattern | Pitfall 13 — module-evaluation-order coupling to parameter-type registration | Acceptable **if** registry population provably precedes it (fresh-registry model makes this true). |
| Mapping `@only` to `.only` because it is the obvious mapping | One line; matches other Gherkin runners | Pitfall 22 — fails CI with a message naming nothing the user wrote; forgoes vitest v4's tag system entirely | Acceptable as a first cut **if** paired with the CI-time guard error. |
| Handling only one of DocString / DataTable per step | Matches every pre-v42 example online | Pitfall 33 — silently drops an argument; fixing the calling convention later is an API break | Never — decide the convention in P3. |
| Accepting `layer()`'s shared TestClock as-is | Ship `shared` Layers sooner | Pitfall 1 — order-dependent Scenarios; violates a headline requirement | Acceptable for an internal milestone **only if** documented in `spec/invariants.md` as a carve-out to INV-EC-002. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| `@cucumber/gherkin` `Parser` | Constructing a new `Parser` + fresh `IdGenerator.incrementing()` per file | `Parser` is reusable (`parse()` resets the builder) [VERIFIED]; use `IdGenerator.uuid()` or one shared generator (Pitfall 10) |
| `@cucumber/gherkin` `compile()` | Trusting `Pickle[]` to cover every Scenario in the AST | Reconcile AST↔Pickle both ways; empty-Examples Outlines produce nothing (Pitfall 7) |
| `@cucumber/gherkin` `compile()` | `Map<astNodeIds[0], Pickle>` | `Map<astNodeId, Pickle[]>` — Outline rows share `astNodeIds[0]` (Pitfall 9) |
| `@cucumber/gherkin` `Pickle.steps` | Assuming placeholders are substituted everywhere | Background steps in an Outline are **not** interpolated (Pitfall 11) |
| `@cucumber/messages` (the package) | Using `IdGenerator` without declaring the dep | Not re-exported by `@cucumber/gherkin`; declare `@cucumber/messages` at gherkin's own `>=34.0.0 <35` (Pitfall 16) |
| `@cucumber/gherkin` step arguments | `if (docString) … else if (dataTable)` | v42 allows **both** on one step, with `argumentIndex` for order (Pitfall 33) |
| `@cucumber/gherkin` `Parser` errors | Reaching for `err.errors` unconditionally | Two shapes depending on `stopAtFirstError`; normalise as `err.errors ?? [err]` (Pitfall 24) |
| vitest v4 tags | Not knowing they exist; mapping `@only` → `.only` | Native `{ tags: [...] }` + `--tagsFilter '@a && !@b'`; requires a config-declared tag registry (Pitfall 32) |
| `@cucumber/messages` `PickleTable` | Expecting `.hashes()` | Already caught by ADR-EC-008's correction — plain `{rows:[{cells:[{value}]}]}`, ship your own wrapper (P3) |
| `@cucumber/cucumber-expressions` registry | Assuming an empty or global registry | 11 built-ins pre-registered by the constructor; instance-scoped; duplicate names throw (Pitfall 14) |
| `@cucumber/cucumber-expressions` | Expecting it to detect ambiguous step definitions | It does not — that is the runner's job (Pitfall 15) |
| `@effect/vitest` `layer()` | Passing an `async` callback | Callback must be synchronous — the 1-arg form never awaits (Pitfall 2) |
| `@effect/vitest` `layer()` | Assuming per-test test services | `TestClock`/`TestConsole` are built once for the whole block (Pitfall 1) |
| `@effect/vitest` `it.effect` | Typing the step's `R` as just the Layer's `ROut` | Must be `ROut \| Scope.Scope` (Pitfall 5) |
| `effect@4` generators | Copying the v3 `YieldWrap` idiom | v4 removed it; use `Generator<Effect<any, E, R>, A, any>` / `Effect.gen.Return` (Pitfall 4) |
| `effect@4` `Layer` variance | Assuming `Layer<ROut>` is covariant | `Layer<in ROut, out E, out RIn>` — `Layer<A\|B>` **is** assignable to `Layer<A>`; over-provided services silently vanish from the type [VERIFIED] |
| vitest v4 collection | Registering tests after any `await` | Registration must be synchronous; `collectorContext.currentSuite` is one global (Pitfall 2) |
| vitest v4 `.only` | Mapping `@only` → `.only` without a CI guard | `allowOnly: !isCI` — fails CI with a misleading message (Pitfall 22) |
| Vite/vitest module graph | Reading `.feature` via `fs` | `import src from "./x.feature?raw"` — sync + watch-invalidating [VERIFIED] (Pitfalls 2, 3) |

## Performance Traps

Scale here means *number of Scenarios and Examples rows per process*, not users.

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| Recompiling a `CucumberExpression` per step **execution** | Collection is fine, run time grows with total steps | Memoize per `(registry, pattern)` — never per pattern alone, since expressions snapshot their registry (Pitfall 13) | A few hundred Outline rows × steps |
| Matching every step against every pattern linearly | Quadratic-ish growth in a large step library | Acceptable, and **required** for Pitfall 15's ambiguity detection. Bucket by the pattern's literal prefix only if profiling demands it | ~500+ step definitions; do not pre-optimize |
| Rebuilding the per-Scenario Layer for a heavy resource | Every Scenario pays container/DB startup | This is ADR-EC-006's `shared` escape hatch working as designed — but read Pitfall 1 before using it | Any real DB/testcontainer |
| Re-parsing the same `.feature` in several `.steps.ts` modules | Duplicated parse cost, duplicated `LoadFeatureError`s | Memoize `loadFeature` by source string; the `?raw` import already makes the source a stable module value | Rare; low priority |

## Security Mistakes

Low surface — this is a dev-time test library. Two real items:

| Mistake | Risk | Prevention |
|---|---|---|
| Interpolating Gherkin content into a generated `RegExp` without escaping | A `.feature` file is developer-authored input, but a step pattern built from feature text can ReDoS the dev/CI machine. Note `compile()`'s `interpolate` builds a `new RegExp` per Examples column per step [VERIFIED by source] | Never construct a `RegExp` from Gherkin text yourself; let `CucumberExpression` (which escapes via its own `escapeRegex`) own all regex construction |
| Including raw step text / table cells in error messages emitted to CI logs | Feature files can legitimately contain fixture credentials; a verbose failure dump can leak them into public CI logs | Truncate table/doc-string content in error output; show the step text, not the full data table |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Reporting a step failure without the `.feature` file and line | Author sees a stack pointing into library internals (Pitfall 21) | Put `feature.file:line` in the test name; `Effect.fn(stepText)` (ADR-EC-005) already names the span |
| Raw `UndefinedParameterTypeError` / `CompositeParserException` reaching the user | Column numbers with no file context; 11 cascading errors for one typo (Pitfalls 13, 24) | Wrap every third-party error in a typed library error carrying file + line, and show only the first parse error prominently |
| An undefined step failing with "no match" and nothing else | User must reverse-engineer the pattern syntax | Generate a copy-pasteable snippet via `CucumberExpressionGenerator` (already a dependency) — this is a real differentiator over `@amiceli/vitest-cucumber` |
| `@only` failing CI with vitest's message (Pitfall 22) | Developer greps their `.ts` for `.only` and finds nothing | Library-owned error naming the `.feature` file, the Scenario, and the tag |
| An empty Scenario or empty-Examples Outline reporting green / vanishing (Pitfalls 7, 8) | The author believes a behavior is covered when nothing ran | Hard error at `loadFeature`; never a passing test |
| A `shared`-Layer Feature where Scenario 2's clock is polluted by Scenario 1 (Pitfall 1) | "TestClock is broken" bug reports; heisenbugs under `-t` | Fix via `excludeTestServices`, or document loudly at the `shared` option |

## "Looks Done But Isn't" Checklist

- [ ] **`loadFeature`:** every AST Scenario node has ≥1 correlated Pickle — verify with an empty-`Examples:` fixture (Pitfall 7)
- [ ] **`loadFeature`:** an Outline with 3 Examples rows yields exactly 3 scenario entries with **distinct** names (Pitfalls 9, 23)
- [ ] **`loadFeature`:** a zero-step Scenario does not emit a passing test (Pitfall 8)
- [ ] **`loadFeature`:** each step carries `origin: feature-background | rule-background | scenario` (Pitfall 12)
- [ ] **`loadFeature`:** two Features loaded in one process have no colliding node ids (Pitfall 10)
- [ ] **Step matching:** an unmatched step *fails*; two matching patterns *fail* — neither is silently resolved (Pitfall 15)
- [ ] **Parameter types:** two `describeFeature` calls in one module both see the same custom type, with no duplicate-name throw (Pitfall 14)
- [ ] **Types:** the `@ts-expect-error` negative test file compiles clean under `tsc --noEmit` — and *fails* if the directive becomes unused (Pitfall 4)
- [ ] **Types:** a step using `Effect.acquireRelease` compiles (Pitfall 5)
- [ ] **Runner:** a retried Scenario rebuilds its per-Scenario Layer — assert the Layer builder ran N times (Pitfall 26)
- [ ] **Runner:** emitted test count === compiled Pickle count for a fixture Feature (Pitfall 2)
- [ ] **Shared Layer:** Scenario 2 sees a clean `TestClock` after Scenario 1 advances it (Pitfall 1)
- [ ] **Tags:** `@only` under `CI=true` produces the library's error naming the `.feature` file, not vitest's raw message (Pitfall 22)
- [ ] **Watch mode:** editing a `.feature` triggers a rerun and picks up a newly added Scenario (Pitfall 3)
- [ ] **Packaging:** a scratch consumer on a *different* rc resolves exactly one `effect` and one `vitest`, under both pnpm and npm (Pitfall 17)
- [ ] **Packaging:** the **packed** tarball's `package.json` has `effect` under `peerDependencies` as a `^` range — not a pin, not a `dependency`, not an unexpanded `catalog:` (Pitfalls 17, 20)
- [ ] **Docs:** the README install line carries `@rc` on both `effect` and `@effect/vitest` (Pitfall 19)
- [ ] **Process:** an rc-bump checklist exists and names the acceptance suite as the gate (Pitfall 18)
- [ ] **Resolution:** `import { IdGenerator } from "@cucumber/messages"` resolves from inside `packages/gherkin` (Pitfall 16)
- [ ] **Step arguments:** a step with both a DocString and a DataTable delivers both, in source order (Pitfall 33)
- [ ] **Outlines:** a 3-row Outline where each row asserts its own value passes under `--sequence.shuffle` (Pitfall 34)
- [ ] **Tags:** `--tagsFilter '@slow'` selects exactly the `@slow`-tagged Scenarios (Pitfall 32)
- [ ] **Skip ordering:** a `@skip` Scenario containing an unmatched step reports *skipped*, not *undefined* (Pitfall 15)
- [ ] **Failure output:** a deliberately failing step names the Gherkin step and `.feature:line` in the panel a reader sees first, not only in a stdout block (Pitfall 31)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| 2 — async `loadFeature` shipped | **HIGH** | Public API break. Add a sync sibling, deprecate the async one, major version. Decide correctly in P1 instead. |
| 17 — `effect` shipped as a pinned `dependency` | **HIGH** once published | Breaking release; every consumer must reinstall. Trivial before the first publish. |
| 4 — vacuous `R` constraint shipped | **HIGH** | Tightening the type breaks every consumer's compiling-but-wrong step. Prevent with the P4 type test. |
| 1 — shared TestClock | MEDIUM | Switch to `excludeTestServices: true` + per-Scenario `TestEnv`. Behavior-changing for anyone who (accidentally) depended on the leak. |
| 15 — first-match-wins shipped | MEDIUM | Adding ambiguity detection turns previously-"passing" suites into errors. Ship behind a flag for one minor, then default on. |
| 14 — wrong registry lifecycle | MEDIUM | Internal-only if `defineParameterType` is already descriptor-based; a public API break if it mutates a global. Choose the descriptor model in P2. |
| 7, 8, 11, 30 — missing `loadFeature` validations | LOW | Purely additive checks. May newly fail existing user features — ship as errors in a minor with a clear message. |
| 21, 23 — location / duplicate names | LOW | Change the generated test name. Cosmetic; only affects `-t` patterns. |
| 26 — wrong `provide` composition order | LOW | One-line fix in the runner, plus the regression test. |
| 22 — `@only` CI message | LOW | Additive check in P8. |
| 18 — bumped an rc without a regression gate | MEDIUM | Bisect the rc range with the acceptance suite; the changelog's `Patch Changes` heading will not narrow it for you. |
| 19 — published install docs without `@rc` | LOW | Docs-only fix, but every user who followed them hit v3 first. |
| 31 — unhelpful failure output | LOW | Change the generated test name and wrap the step error. Purely additive. |
| 16 — undeclared `@cucumber/messages` | LOW | One line in `package.json`. Blocks P1 until fixed, so it will be found immediately. |
| 33 — one-argument-per-step convention shipped | MEDIUM | Public API break for every step taking a table or doc string. Decide in P3. |
| 32 — `.only`/`.skip` mapping shipped instead of tags | LOW | Additive: emit tags as well, keep the old mapping working through one minor. |
| 34 — shared mutable step array across Outline rows | LOW | Snapshot per row; the shuffle test pins it. |
| 20 — pinned catalog shipped as a pinned peer | **HIGH** once published | Same as 17: breaking release. Catch it by inspecting the packed tarball, not the source `package.json`. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| 16 undeclared `@cucumber/messages` | **P0** | `import { IdGenerator } from "@cucumber/messages"` resolves inside `packages/gherkin` |
| 17 `effect` as dependency not peer | **P0** | install the packed tarball into a scratch consumer on a *different* rc; `pnpm ls effect` **and** `npm ls effect` → exactly one version |
| 18 rc bumps are breaking despite `Patch Changes` | **P0** | rc-bump checklist in the repo; full acceptance suite is the gate, not `tsc` |
| 19 `latest` dist-tag points at v3 | **P0** | README install line reads `effect@rc @effect/vitest@rc`; a v3 install fails with a named error |
| 20 pnpm catalog pack-time expansion | **P0** | `pnpm pack` then grep `peerDependencies` in the **packed** `package.json` — must be a range, not a pin |
| 2 async registration → zero tests | **P1** (API shape), P5 | emitted test count === Pickle count; a `?raw`-based fixture |
| 3 watch mode blind to `.feature` | **P1** | manual `vitest watch` + add a Scenario → rerun observed |
| 7 empty-Examples Outline vanishes | **P1** | fixture with header-only and no-header `Examples:` → `LoadFeatureError` |
| 8 zero-step Scenario passes green | **P1** | fixture with an empty Scenario → error or `skip`, never pass |
| 9 `astNodeIds` one-to-many | **P1** | 3-row Outline → exactly 3 distinct scenario entries |
| 10 id collisions across files | **P1** | two Features in one process → no duplicate node ids |
| 11 Background not interpolated in Outlines | **P1** | `<x>` in a Background under an Outline → `LoadFeatureError` |
| 12 Background steps unmarked in Pickles | **P1** | each step carries an `origin` tag; asserted for a Rule + Feature Background fixture |
| 24 cascading `CompositeParserException` | **P1** | fixture with one bad line → error reports that line first, not 11 |
| 30 Background-after-Rule ordering | **P1** | fixture with `Background:` after `Rule:` → warn/error |
| 13 eager `CucumberExpression` construction | **P2** | unregistered `{money}` → `StepPatternError` naming `money` |
| 14 registry lifecycle / duplicate names | **P2** | two `describeFeature` calls sharing a custom type both work; duplicate → named error; built-in override → clear error |
| 15 ambiguous / undefined steps | **P2** | `{int}` vs `{word}` fixture → `AmbiguousStepError`; unmatched step → `UndefinedStepError` + snippet |
| 25 async/throwing parameter transforms | **P2** | async transform rejected at the type level; throwing transform → typed `ParameterTransformError` |
| 28 punctuation semantics | **P2** docs | doc-example compile check covers `(s)` and `/` cases |
| 33 DocString + DataTable on one step | **P3** | fixture with both, in both source orders → both reach the step body |
| 4 vacuous generic `R` constraint | **P4** (first task) | `@ts-expect-error` type-test file under `tsc --noEmit` in CI |
| 5 `Scope` missing from `ROut` | **P4** | positive type test: an `acquireRelease` step compiles |
| 6 `any` disables the guarantee | **P4** (spec wording), P10 (docs) | INV-EC-003 amended to "for step bodies free of `any`" |
| 27 shared Layer `E` becomes a defect | **P4** (type constraint), P9 | `shared` typed as `Layer<R, never, never>`; a failable Layer is a type error |
| 21 identical test locations | **P5** | test names include `feature.file:line` |
| 23 duplicate Outline test names | **P5**/P7 | 3-row Outline with a non-varying title → 3 distinct names |
| 26 `provide` order vs retries | **P5** | Layer builder counter === attempt count under `flakyTest` |
| 31 step name buried in a log block | **P5** | deliberately fail a step; the failure panel must name the step and `.feature:line` |
| 34 loop capture across Outline rows | **P7** | 3-row Outline, each row asserts its own value, under `--sequence.shuffle` |
| 22 `@only` fails CI confusingly | **P8** | `CI=true` run → library error naming the `.feature` file |
| 32 vitest v4 native tags | **P8** | `--tagsFilter '@slow'` selects exactly the tagged Scenarios; undeclared tag → library error naming the `.feature` |
| 1 shared `TestClock` never resets | **P9** | two-Scenario shared-Layer feature; Scenario 2 asserts `currentTimeMillis === 0` |
| 29 `layer()` block loses `it.live` | **P9** | documented; no test needed |

## Open Questions / Gaps

Honest accounting of what this pass did **not** establish:

1. **Both delegated web passes completed** and are folded in (Effect prerelease practice → Pitfalls 17-20; Gherkin-wrapper library histories → Pitfalls 7, 9, 11, 12, 14, 15, 21, 22, 23, 24, 32, 33, 34). Where an external finding contradicted a local one, the **local reproduction wins and is marked so** — see gap 8. Nothing in this document rests on an unverified secondhand claim without saying so.
2. **No official Effect guidance for library authors exists.** Confirmed negative finding (HIGH): nothing in the README, `MIGRATION.md`, `LLMS.md`, the RC/beta blog posts, or the docs site addresses how a *library* should depend on v4; GitHub Discussions are disabled on `Effect-TS/effect`; `MIGRATION.md` still says "currently in beta" 16 days after the RC post. The convention in Pitfall 17 was reverse-engineered from 30 published first-party `package.json` files, not read from a policy document. It is consistent enough to rely on, but it is a convention, not a promise.
3. **`effect/unstable/*` breaks in minor releases, by policy.** Stated in both the beta blog post and `MIGRATION.md`: *"Modules under `effect/unstable/*` may receive breaking changes in minor releases."* This project currently imports only stable paths (`effect/Effect`, `effect/Layer`, `effect/Context`, `effect/Schema`, `effect/testing/*`) - **keep it that way.** Adopting anything from `effect/unstable/*` would mean signing up for breakage in 4.1.0 and 4.2.0, not just during the RC. Worth recording as an explicit constraint alongside ADR-EC-012.
4. **Duplicate-`effect` runtime behavior (Pitfall 17).** Refined rather than resolved. v4 uses string-literal TypeIds and `Symbol.for`, so brand checks *pass* across duplicate copies - meaning the failure is silent rather than a clean type error - and v4 removed `effect/GlobalValue`, v3's cross-copy singleton-sharing escape hatch. Three downstream repos report concrete symptoms (`TypeError: X is not a function`, unshared `Context`/`Cause`, silent double-install). I did not construct a minimal duplicate-install reproduction inside this repo. The evidence is more than sufficient to justify the peer-dependency fix.
5. **vitest isolation x global registry (Pitfall 14).** The duplicate-name throw and the built-in pre-population are `[VERIFIED]`. The claim that `pool`/`isolate` settings determine *which* half of the incompatibility you hit is reasoned from vitest's module-isolation model; an attempt to reproduce it was defeated by module resolution in the scratch probe environment - MEDIUM confidence, honestly held. The recommended fresh-registry-per-`loadFeature` design makes the question moot, which is why it is the recommendation.
6. **`Effect.fn`'s span naming under a dynamically-generated step (ADR-EC-005) — RESOLVED during this pass.** `Effect.fn(runtimeComputedText)` does produce correctly-named stack frames. But the named frames go to a `logError` stdout block, while vitest's failure panel shows Effect fiber internals instead. Promoted to **Pitfall 31**; no longer an open question.
7. **Gherkin dialects (`# language: fr`).** `IGherkinOptions.defaultDialect` exists and `GherkinInMarkdownTokenMatcher` is exported, but non-English features and Markdown features were not tested. If they are in scope, they need their own P1 fixtures; if not, `loadFeature` should reject them explicitly rather than mis-parse.
8. **One external claim was wrong and is corrected here.** The delegated survey reported that `Parser.stopAtFirstError` defaults to `true` (yielding a bare `UnexpectedTokenException`). It does not: `dist/Parser.js` has the class field `stopAtFirstError = false`, and my own parse of a malformed fixture threw a `CompositeParserException` **with** `.errors`. Pitfall 24 records the verified default. Both shapes are reachable, so the defensive `err.errors ?? [err]` normalisation is right regardless — which is why the actionable advice was unaffected. Flagged because it is a reminder to trust the installed package over any secondhand report, including this document's.
9. **rc.113's queued breaking changes were read from the open `.changeset/` directory, not from a shipped release.** They could change before publication. The actionable conclusion — treat every rc bump as breaking — does not depend on the specifics.
10. **Several upstream behaviours have no corresponding bug report.** No `cucumber/gherkin` issue exists for headerless-Examples-yields-zero-pickles, for `incrementing()` id collisions, or for Background-placeholders-not-interpolated; no `cucumber-js` issue for duplicate parameter-type registration (the evidence there is entirely from `cypress-cucumber-preprocessor`); no vitest issue for duplicate-name snapshot collisions or wrong locations on generated tests. Those findings are **source-derived and locally reproduced**, not reported bugs — which means nobody upstream is going to fix them for you.
11. **`@amiceli/vitest-cucumber`'s "a failed step does not abort the scenario" behaviour is MEDIUM confidence** — inferred from its one-test-per-step structure, not from a filed issue. It matters only as motivation for ADR-EC-004 (one `it.effect` per Scenario), which this project already decided differently and for stated reasons. No action.

## Sources

**Primary — read directly from the packages installed in this repo (HIGH confidence):**
- `@cucumber/gherkin@42.0.1` — `dist/pickles/compile.js` (full source), `dist/Parser.js`, `dist/AstBuilder.d.ts`, `dist/Errors.d.ts`, `dist/index.d.ts`, `dist/IGherkinOptions.d.ts`
- `@cucumber/cucumber-expressions@20.1.0` — `dist/ParameterTypeRegistry.js`, `dist/defineDefaultParameterTypes.js`, `dist/CucumberExpression.js`, `dist/Argument.js`, `dist/ParameterType.d.ts`, `dist/Errors.d.ts`
- `@effect/vitest@4.0.0-rc.112` — `dist/internal/internal.js` (`layer`, `makeTester`, `makeItProxy`, `flakyTest`, `TestEnv`), `dist/index.d.ts`, `package.json` peer-dependency declarations
- `effect@4.0.0-rc.112` — `dist/Effect.d.ts` (`gen`, `gen.Return`, `fn`, `fn.Return`, `Variance`), `dist/Layer.d.ts` (`interface Layer<in ROut, out E, out RIn>`)
- `vitest@4.1.11` / `@vitest/runner@4.1.11` — `chunk-artifact.js` (`createSuiteCollector`, `runWithSuite`, `collectorContext`, `checkAllowOnly`, `interpretTaskModes`), `vitest/dist/chunks/defaults.*.js` (`allowOnly: !isCI`)

**Executed reproductions (HIGH confidence):** Gherkin parse+compile against a fixture exercising empty Scenarios, empty Examples, Rule Backgrounds, and Outline interpolation; id-generator collision and Parser-reuse probes; 15 `cucumber-expressions` runtime probes; 6 `tsc --noEmit` type probes against `effect@4.0.0-rc.112`; 5 real `vitest run` / `vitest watch` executions covering shared-vs-plain TestClock, async registration, task locations, duplicate names, `.only` under `CI=true`, `?raw` imports, and `flakyTest` retry/Layer-rebuild semantics.

**Effect v4 prerelease research (delegated web pass, 2026-08-28):**
- npm registry dist-tags and published `package.json` metadata for `effect` and 30 first-party `@effect/*` packages — [registry.npmjs.org/effect](https://registry.npmjs.org/effect), [unpkg.com/@effect/vitest@4.0.0-rc.112/package.json](https://unpkg.com/@effect/vitest@4.0.0-rc.112/package.json) (HIGH)
- [`packages/effect/CHANGELOG.md` on `main`](https://raw.githubusercontent.com/Effect-TS/effect/main/packages/effect/CHANGELOG.md) and the open [`.changeset/`](https://github.com/Effect-TS/effect/tree/main/.changeset) directory, incl. `pre.json` pre-mode config (HIGH)
- [Effect v4 RC announcement](https://www.effect.website/blog/releases/effect/40-rc) and [v4 beta announcement](https://www.effect.website/blog/releases/effect/40-beta) — stability promise, `unstable/*` policy, Q3/Q4 2026 stable target (HIGH)
- [node-semver prerelease-tag rule](https://github.com/npm/node-semver#prerelease-tags), corroborated by empirical `semver@7.8.5` evaluation (HIGH)
- Export-surface diffs of the published beta.50 / beta.100 / rc.108 / rc.112 tarballs; `GlobalValue` module presence check across v3 and v4 (HIGH)
- Downstream breakage reports: `systemfsoftware#217` (pnpm catalog pack-time expansion; Gherkin-on-Effect library), `prisma/composer#196` (`Schedule.either is not a function` from coexisting betas), `Threadlines#113` (two runtimes cannot share `Context`/`Cause`) (MEDIUM)
- npm search across ~1181 `effect`-depending packages for version-range strategy distribution — a floor, not a census (MEDIUM)

**Gherkin-wrapper ecosystem research (delegated web pass, 2026-08-28):**
- `@cucumber/gherkin` — [`compile.ts`](https://github.com/cucumber/gherkin/blob/main/javascript/src/pickles/compile.ts), `testdata/good/incomplete_scenario.feature` golden master, open issues [#11](https://github.com/cucumber/gherkin/issues/11) (Background indistinguishable — by design), [#22](https://github.com/cucumber/gherkin/issues/22) (missing trailing pipe drops a column), [#28](https://github.com/cucumber/gherkin/issues/28) (duplicate Examples headers) (HIGH)
- `cucumber-js` — `assemble_test_cases.ts`, `test_case_runner.ts`, `runtime/helpers.ts` (`shouldCauseFailure`), `pickle_parser.ts` / `api/gherkin.ts` (the `astNodeIds.at(-1)` idiom), `support_code_library_builder/index.ts` (the module singleton), `docs/installation.md` (stateful-instance warning); issues [#2388](https://github.com/cucumber/cucumber-js/issues/2388) (WONTFIX on Background origin), [#2522](https://github.com/cucumber/cucumber-js/issues/2522); [PR #2836](https://github.com/cucumber/cucumber-js/pull/2836) (check skip before matching) (HIGH)
- `cypress-cucumber-preprocessor` — duplicate `defineParameterType` crashes: issues [#298](https://github.com/badeball/cypress-cucumber-preprocessor/issues/298), [#364](https://github.com/badeball/cypress-cucumber-preprocessor/issues/364), [#549](https://github.com/badeball/cypress-cucumber-preprocessor/issues/549) (HIGH)
- `playwright-bdd` — [FAQ](https://vitalets.github.io/playwright-bdd/#/faq) (the three codegen reasons), [source-maps guide](https://github.com/vitalets/playwright-bdd/blob/main/docs/guides/source-maps.md), `src/gherkin/featuresLoader.ts`, `docs/pickles.md`, issues [#18](https://github.com/vitalets/playwright-bdd/issues/18), [#258](https://github.com/vitalets/playwright-bdd/issues/258), [#297](https://github.com/vitalets/playwright-bdd/issues/297) (HIGH)
- Playwright — `packages/playwright/src/common/testType.ts` (runtime `test()` prohibition), maintainer rationale on [microsoft/playwright#12857](https://github.com/microsoft/playwright/issues/12857#issuecomment-1072727674), [test-parameterize docs](https://playwright.dev/docs/test-parameterize) (HIGH)
- `jest-cucumber` — `src/configuration.ts`, `src/parsed-feature-parsing.ts`; issues [#1](https://github.com/bencompton/jest-cucumber/issues/1), [#22](https://github.com/bencompton/jest-cucumber/issues/22), [#104](https://github.com/bencompton/jest-cucumber/issues/104), [#106](https://github.com/bencompton/jest-cucumber/issues/106), [#111](https://github.com/bencompton/jest-cucumber/issues/111), [#112](https://github.com/bencompton/jest-cucumber/issues/112), [#139](https://github.com/bencompton/jest-cucumber/issues/139), [#150](https://github.com/bencompton/jest-cucumber/issues/150), [#163](https://github.com/bencompton/jest-cucumber/issues/163), [#164](https://github.com/bencompton/jest-cucumber/issues/164) (HIGH)
- `@amiceli/vitest-cucumber` — [PR #32](https://github.com/amiceli/vitest-cucumber/pull/32) (Outline loop-capture fix), [PR #36](https://github.com/amiceli/vitest-cucumber/pull/36) (registration callbacks never awaited); issues [#97](https://github.com/amiceli/vitest-cucumber/issues/97), [#111](https://github.com/amiceli/vitest-cucumber/issues/111), [#200](https://github.com/amiceli/vitest-cucumber/issues/200), [#258](https://github.com/amiceli/vitest-cucumber/issues/258), [#270](https://github.com/amiceli/vitest-cucumber/issues/270) (HIGH)
- vitest — maintainer statements on dynamic generation and async `describe` ([#8682](https://github.com/vitest-dev/vitest/issues/8682), [#703](https://github.com/vitest-dev/vitest/issues/703)), `?raw` watch recommendation ([#6457](https://github.com/vitest-dev/vitest/issues/6457)), open `forceRerunTriggers` bugs ([#10835](https://github.com/vitest-dev/vitest/issues/10835), [#11054](https://github.com/vitest-dev/vitest/issues/11054)) (HIGH)

**Project spec (normative):** `spec/decisions/001`–`014`, `spec/invariants.md`, `spec/roadmap.md`, `.planning/PROJECT.md`

---
*Pitfalls research for: Effect-native Gherkin/Cucumber test runner for vitest*
*Researched: 2026-08-28*
