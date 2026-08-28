# Research report: reversing ADR-EC-015 (effect as a core dependency of `@effect-cucumber/gherkin`)

**Status:** Research only. No code, ADR, or spec files were changed to produce this report. Nothing here is a decision or a recommendation to act — it's the input for one.

**Question under research:** should `effect` become a hard/core dependency of `@effect-cucumber/gherkin` (or should `gherkin` and `vitest` merge into one Effect-native package), specifically to adopt `@effect/platform`'s `FileSystem`/`Path` abstractions for Node/Bun/Deno portability?

**Headline findings, before the detail:**

1. ADR-EC-015 was decided at commit `785add2` (03:49 on the project's single build day), **before any file that touches the filesystem existed** and **before Phase 1 execution started**. It is not a rule that calcified after the fact — it was foundational from the first hour of the spec, and has never been amended.
2. The current ground truth is *stronger* than the ADR's own title suggests: `packages/gherkin/package.json` has **zero** reference to `effect` in any field (not `dependencies`, not `peerDependencies`, not even `devDependencies`). "Peer dependency" describes `@effect-cucumber/vitest`'s relationship to `effect`, not `gherkin`'s — `gherkin` has no relationship to `effect` at all today.
3. Only two of gherkin's twelve source files (`Source.ts`, `loadFeature.ts`) are actually forced to change by a FileSystem-abstraction rewrite. The rest of the package (`Parser.ts`, `Pickles.ts`, `Correlate.ts`, `Validate.ts`, `Model.ts`, `StepMatcher.ts`, `StepArgs.ts`) is pure and untouched by this question either way.
4. The portability motivation has two very differently-sized readings, and only the narrow one is well-supported: "gherkin's parsing layer importable into a Bun/Deno script" is plausible and, for **Bun specifically, already works today** (Bun's Node-compat layer runs the current `node:fs` call fine). "The whole Cucumber DSL runs on Bun's/Deno's native test runners" is a separate, much larger project unrelated to this ADR.
5. `@effect/platform`'s FileSystem is not a drop-in `Effect.runSync` swap for the current synchronous call site — official examples never use `runSync` for file reads, and the Node implementation almost certainly suspends (async under the hood). Official Deno support (`@effect/platform-deno`) does not exist yet; Bun's platform package currently proxies through Node's `fs`, per an open upstream issue.

Full detail follows in five sections, matching the structure requested.

---

## 1. Full decision history audit

### 1a. Per-ADR summary table

| ADR | Title | One-line decision | Dependency on effect-free/sync gherkin boundary | Rework if ADR-EC-015 reversed? |
|---|---|---|---|---|
| 001 | A step is `(...params) => Effect<A,E,R>` | Steps return Effect, no ctx param | None — governs `vitest`'s DSL, not gherkin | No |
| 002 | World is a `Context.Service` | World is a typed Effect service | None — vitest package only | No |
| 003 | `describeFeature` takes a Layer | Layer typechecks step `R` | None — vitest package only | No |
| 004 | One `it.effect` per Scenario | Background inlined, not a hook | None — vitest package only | No |
| 005 | `Effect.fn` wraps step/hook bodies | Auto-wrap for tracing spans | None — vitest package only | No |
| 006 | Two Layer scopes only | per-Scenario default, `shared` opt-in | None — vitest package only | No |
| 007 | Cucumber-expressions for step matching | Reuse upstream syntax, not bespoke | **Weak-indirect**: its Phase 3 correction built `ParameterTypeStore` as a plain object specifically *because* ADR-EC-015 forbade a `Layer`-provided registry ("a `Layer`-provided registry is therefore unreachable from the package that owns `loadFeature` — not a weaker option, an impossible one") | **Yes** — the registry-lifecycle design (plain data, not `Context.Service`+`Layer`) is a direct downstream consequence of ADR-EC-015 and would need re-examination |
| 008 | DataTables/DocStrings decode through `Schema` | Decode via `effect/Schema` | **Strong, but at the right layer already**: `Schema` decoding is a `vitest`-side concern (steps call `Schema.decode` in their Effect body); gherkin only emits raw shapes | No — already correctly scoped away from gherkin |
| 009 | Cross-step state in a `Ref` | No closure `let` for scenario state | None — vitest/DSL concern | No |
| 010 | Rule/Scenario extra Layers | `Layer.provideMerge` per scope | None — vitest package only | No |
| 011 | Depend on official `@cucumber/gherkin`/`cucumber-expressions` | Use official upstream parser packages | **Foundational precondition** — decouples parsing from vitest-cucumber internals, which is what makes an independent, effect-free gherkin package possible at all | Not invalidated — about *which* parser, not sync-vs-Effect |
| 012 | Target Effect v4 (beta) | Pin exact v4 beta | None directly on gherkin; would extend to gherkin only if gherkin gains an `effect` dependency | Only conditionally |
| 013 | `@effect-cucumber` npm scope, one package per module | Separate `gherkin`/`vitest` packages, not subpath exports | **Strong — this is the package-split rationale the whole question hinges on.** Its stated Positive: "`@effect-cucumber/gherkin` is independently installable and testable **with no Effect-specific logic in its dependency tree**, useful even to something that isn't `@effect-cucumber/vitest`." | **Yes, if merging into one package** — that specific justification evaporates. A peer-dependency/adapter-package alternative could preserve the split without contradicting this ADR. |
| 014 | `loadFeature` consumes both `GherkinDocument` and `Pickles` | Parse+compile+correlate in one pass | None — purely a data-shape decision, orthogonal to sync-vs-Effect | No |
| 015 | **`effect` is a peer dep of vitest; gherkin has no `effect` dependency at all** | **This is the boundary itself** | **IS the boundary** | **Yes — the ADR under direct reconsideration** |
| 016 | `@effect/tsgo` gates the build | Wire `duplicatePackage`/`missingLayerContext` diagnostics | **Strong**: explicitly built as "an automated backstop for ADR-EC-015's peer-dependency decision" | **Yes, partially** — if gherkin takes a hard `effect` dependency, the `duplicatePackage` risk this guards against re-enters gherkin's own manifest |
| 017 | Background/Scenario are step-def containers | Consistent `(dsl)=>void` shape | None — vitest DSL concern | No |
| 018 | Shared Layer keeps TestClock isolation | `excludeTestServices: true` | None — vitest package only | No |
| 019 | Fail loudly on unmatched/ambiguous steps | New error family at Plan stage | None directly (built on gherkin-side correlation data, but a vitest-side policy) | No |
| 020 | Gherkin tags → vitest v4 native tags | `@skip`→`.skip`, `@only`→ plain tag | None — vitest package only | No |

**What actually depends on ADR-EC-015 being reversed:**
- **Directly (IS the boundary):** ADR-EC-015 itself.
- **Structurally downstream (real rework required):** ADR-EC-013 (package-split rationale), ADR-EC-007's Phase 3 correction (registry-as-plain-data design), ADR-EC-016 (backstop scope).
- **Executable enforcement, not an ADR but load-bearing:** `scripts/verify-no-runner-dep.sh` (added Phase 2, commit `266b454`). It structurally scans `packages/gherkin/src/**/*.ts` for imports of `vitest`/`@effect/vitest`/`effect`, and separately asserts (via `JSON.parse` of `package.json`) that neither `dependencies` nor `peerDependencies` names any of the three — deliberately excluding `devDependencies`, where `vitest` legitimately lives for gherkin's own tests. It has a positive control and cites a prior incident where a grep-based gate passed vacuously. Reversing ADR-EC-015 in any form that gives gherkin a real `effect` dependency requires deleting or rewriting this script.
- **Everything else (14 of 20 ADRs)** governs `@effect-cucumber/vitest`'s DSL/runner semantics and has zero load-bearing dependency on gherkin's sync/effect-free character — Effect is already a first-class citizen on that side of the package boundary regardless of what gherkin does.

### 1b. Framing in overview.md / roadmap.md / invariants.md / glossary.md

- **`spec/overview.md`** states the split in its Packages table: `@effect-cucumber/gherkin` — "`.feature` parsing + step-text matching ... **No Effect-specific logic**." This one-line charter is what ADR-EC-013 and ADR-EC-015 both cite back to.
- **`spec/roadmap.md`**'s "Current state" section treats ADR-EC-015 as *already closed, foundational infrastructure*: "Finish Phase 0 tooling/dependency policy (partially done: **peer deps fixed via ADR-EC-015**, `@effect/tsgo` wired via ADR-EC-016; still open: ...)." It is listed as settled, not as an evolving design question.
- **`spec/invariants.md`** does **not** name the sync/effect-free boundary as a formal `INV-EC-*` invariant. None of `INV-EC-001`–`006` concern gherkin's dependency surface — all are vitest/runner-side (fail-fast, Layer freshness/scoping, hooks, cross-step `Ref`). The boundary is enforced structurally (the CI script) and by ADR text, but there is no `INV-EC-007: gherkin has no Effect dependency` to formally revise if the ADR reverses — only the ADR and the script.
- **`spec/glossary.md`** has no entry framing the boundary at all; it's pure DSL vocabulary (Feature, Scenario, Background, Rule, World). Nothing there needs correction under a reversal.

### 1c. Timeline

All 131 commits land on a single calendar day (2026-08-28, 01:50–17:59) — this is one continuous build run, not a multi-day project; ADR "Date:" fields are uniformly stamped and not useful for sequencing, so ordering below is by commit timestamp.

1. `01:50` `3ede69b` — initial API design (pre-spec).
2. `02:15` `35280c4` — "Adopt spec-driven development"; `spec/decisions/` introduced. **ADR-EC-011 and ADR-EC-013 are first written here, before any package code exists.**
3. `02:40`–`02:50` — ADR-EC-007 and ADR-EC-014, still pre-scaffold.
4. `02:50` `0eb5680` — pnpm workspace scaffolded (packages exist, empty).
5. `03:49` `785add2` — **"Fix dependency scoping and wire @effect/tsgo" — ADR-EC-015 is authored here.** This is the *only* commit that has ever touched `spec/decisions/015-effect-is-a-peer-dependency.md`.
6. `04:39` `162e854` — several more ADRs added from "GSD research decisions" (likely the 016–020 cluster).
7. `05:38` `f640f4a` — **Phase 1 execution begins.**
8. `14:04` `31d6dd8` — **`packages/gherkin/src/Source.ts` — the package's only `node:fs` consumer — is created for the first time.** ~10 hours of commit-time after ADR-EC-015 was decided.
9. `15:07` `266b454` — `scripts/verify-no-runner-dep.sh` added (Phase 2), ~11.5h after the ADR, once there was finally source for it to scan.
10. `16:38`–`17:59` — Phase 3 (step matching/parameter types) executes, producing the `ParameterTypeStore`-as-plain-data design whose correction explicitly cites ADR-EC-015 as the forcing constraint.

**Conclusion: the sync/effect-free contract was foundational from day one, not hardened over time.** ADR-EC-015 predates Phase 1 execution and predates any filesystem-touching code by ~10 hours — there was no working synchronous implementation in existence yet whose behavior it was written to preserve; it precedes the code entirely. What *did* accrete over time is **enforcement, not the decision**: `@effect/tsgo`'s `duplicatePackage` diagnostic (same commit cluster) and `verify-no-runner-dep.sh` (Phase 2) are both backstops for a decision already made. The one place the boundary's *consequences* were discovered rather than anticipated is ADR-EC-007's Phase 3 correction: an earlier pass had floated a `Context.Service`+`Layer`-based parameter-type registry as an open option; only when Phase 3 tried to build it did the correction retroactively mark it foreclosed by ADR-EC-015 ("never actually open to this package"). The decision was locked at hour one; its full implications kept surfacing through Phase 3.

---

## 2. Actual code surface audit

### 2a. File classification

| File | Class | Justification |
|---|---|---|
| `src/index.ts` | (a) | Barrel; doc comment narrates the "synchronous" contract, would need rewriting for (b) |
| `src/loadFeature.ts` | (b) implies (a) | The two public entry points (`loadFeature`, `parseFeature`). Own doc comment: "Synchronous, permanently... a consumer writes `const feature = loadFeature("x.feature")` at module top level... a one-way door." |
| `src/Source.ts` | (a) | The **only** `node:fs` consumer in `src/` — exactly what `@effect/platform`'s `FileSystem`/`Path` would replace |
| `src/Errors.ts` | (a) | Own doc comment names ADR-EC-015 directly: plain `Error` subclasses "NOT Effect's tagged-error constructor," because "ADR-EC-015 forbids `@effect-cucumber/gherkin` from declaring `effect` in any manifest field" |
| `src/ParameterTypes.ts` | (a) | Own doc comment: store is a plain object, not a `Layer`-provided service, "because... ADR-EC-015 forbids `@effect-cucumber/gherkin` from declaring `effect`" — names the alternative design the ADR blocks |
| `src/Model.ts` | (c) | Pure types only |
| `src/Parser.ts` | (c) | Wraps `@cucumber/gherkin`'s synchronous parser; no I/O |
| `src/Pickles.ts` | (c) | Wraps `@cucumber/gherkin`'s synchronous `compile()`; no I/O |
| `src/Correlate.ts` | (c) | Pure in-memory AST/pickle join |
| `src/Validate.ts` | (c) | Pure validation over the correlated result |
| `src/StepMatcher.ts` | (c) | Own doc comment: stays effect-free by design, "how a package forbidden by ADR-EC-015 from depending on `effect` still serves Phase 6" |
| `src/StepArgs.ts` | (c) | Types only, emits zero runtime statements by design |

(b) implies (a) but not vice versa. Only `loadFeature.ts`/`index.ts` are (b); `Source.ts`, `Errors.ts`, `ParameterTypes.ts` would need internal rework if `effect` merely becomes *available*, independent of whether the public signature changes.

### 2b. Top-level call-site trace

Exactly **one** module-top-level `loadFeature`/`parseFeature` call exists across all of `packages/gherkin/test/`:

- **`test/loadFeature.test.ts:34`** — `const topLevelFeature = loadFeature(fixturePath)`, outside any `describe`/`it`. Its own header comment states this placement *is* the test: it's the structural proof of PARSE-01/BEH-EC-001 — "The file declares N tests and vitest reports exactly N in exactly one file. `loadFeature` ran during module evaluation and contributed none of them. Moving the call inside an `it` deletes the only evidence this file exists to produce." An async/Effect-returning call could not serve this specific test's purpose.

All other call sites (~18, across `ParameterTypeLifecycle.test.ts`, `dialect.test.ts`, and the rest of `loadFeature.test.ts`) are inside `it()`/`describe()` bodies — convention, not structural necessity. They could move to `beforeAll` or go async without breaking test discovery.

**Conclusion:** the "synchronous, module-top-level" contract is structurally load-bearing in exactly one test file that exists specifically to demonstrate it — not because vitest's collection mechanics broadly demand synchronous parsing everywhere.

### 2c. How `packages/vitest` actually consumes `packages/gherkin`

The entirety of `packages/vitest/src/index.ts` (14 lines) is a Phase-5 placeholder:

```ts
import * as Gherkin from "@effect-cucumber/gherkin"

export const packageName = "@effect-cucumber/vitest" as const
export const gherkinPackageName: Gherkin.PackageName = Gherkin.packageName
```

It imports only `Gherkin.packageName`/`Gherkin.PackageName`, to exercise the cross-package build graph. **There is no real `loadFeature`/`describeFeature` consumption pattern to trace yet** — the DSL/runner that would actually call `loadFeature` at scale (Register/Plan/Emit, per `.planning/research/SUMMARY.md`) hasn't been built. Any claim about what the real consumer "needs" from gherkin's call signature is currently forward-looking, not evidenced by existing code.

### 2d. Blast radius quantification

- **Call sites:** 1 module-top-level (`loadFeature.test.ts:34`) vs. ~18 in-test-body, across 3 files that actually call it (`loadFeature.test.ts`, `dialect.test.ts`, `ParameterTypeLifecycle.test.ts`).
- **Commits touching `packages/gherkin`:** 49 (`git log --oneline -- packages/gherkin`), overwhelmingly deliberate `feat(NN-NN)`/`test(NN-NN)` phase/plan increments, plus a couple of early setup/fix commits.
- **Completion-doc assertions of effect-free-ness:** the repo has exactly one `SUMMARY.md` (`.planning/research/SUMMARY.md`), which states: "`effect` dropped **entirely** from `@effect-cucumber/gherkin` (it has no Effect-specific logic, matching ADR-EC-013's original charter — this closes STACK.md's open question #3 as **decided: no**)" and "`@effect-cucumber/gherkin` is synchronous, has no Effect runtime dependency..." Beyond this file, the assertion is also structurally encoded in `scripts/verify-no-runner-dep.sh` and repeated in source doc comments (`Errors.ts`, `ParameterTypes.ts`, `StepMatcher.ts`) and in `packages/gherkin/package.json`'s own `description` field ("Parsing only — no Effect dependency").

### 2e. Current package.json reality — and a discrepancy worth flagging

**`packages/gherkin/package.json`:** `dependencies` = `@cucumber/gherkin`, `@cucumber/messages`, `@cucumber/cucumber-expressions` only. **No `effect` anywhere** — not in `dependencies`, not `peerDependencies`, not even `devDependencies`.

**`packages/vitest/package.json`:** `dependencies` includes `@effect-cucumber/gherkin`; `peerDependencies` includes `effect`, `@effect/vitest`, `vitest`.

**Discrepancy:** ADR-EC-015's filename is `015-effect-is-a-peer-dependency.md`, which reads as if it's describing `gherkin`'s relationship to `effect`. In the actual codebase, the peer-dependency relationship applies to **`vitest`**, not `gherkin` — `gherkin` has *no* relationship to `effect` at all, which is a stronger (more effect-free) position than the ADR's title implies. This is consistent with `SUMMARY.md`'s account, so the code isn't wrong — but a reader going by the ADR title alone could be misled about what "reversing ADR-EC-015" actually changes for `gherkin` specifically. Worth reconciling if this ADR is revisited at all, independent of the portability question.

---

## 3. Comparative technical research (external)

### 3a. Precedent for "sync core, Effect-native wrapper" in the Effect ecosystem

**`@effect/vitest`'s actual shape:** zero runtime dependencies, `effect: "^3.19.0"` and `vitest: "^3.2.0 || ^4.0.0"` as peer dependencies. But this is a poor precedent for what gherkin is trying to do — `@effect/vitest` exists *specifically* to bridge Effect programs into vitest; every export (`it.effect`, `it.scoped`, layer-sharing helpers) is Effect-typed by construction, with no sync facade at all. It confirms that peer-dependency is the ecosystem's normal way to avoid duplicate-`effect` bundling (matching ADR-EC-015's own `ERR_MODULE_NOT_FOUND`/duplicate-package concern), but it says nothing about whether a package *can or should stay Effect-free entirely*.

**No comparable "effect-free core / Effect-native adapter" precedent was found** anywhere in or adjacent to the Effect ecosystem. Every package built on `effect` (`@effect/platform`, `@effect/schema`, `@effect/cli`, etc.) takes it directly; none ship a dependency-light core with an opt-in Effect wrapper the way `gherkin`/`vitest` currently do. This is a negative/inconclusive finding, not a refutation — it means the split as designed here is a bespoke choice for this project, not something modeled on established ecosystem practice. It's also, notably, not contradicted by anything found — nobody in the ecosystem is doing this pattern, but nobody is arguing against it either.

**General `@effect/platform` consumer convention:** every documented FileSystem consumer is fully Effect-native. No example was found of a library offering both a promise/sync wrapper *and* a raw Effect version of the same function — the convention is "if you depend on `@effect/platform`, your API is Effect-typed, full stop," and callers who don't want Effect run `Effect.runPromise`/`runSync` themselves at their own boundary.

### 3b. `@effect/platform-node`/`-bun`/`-deno` FileSystem, concretely

**API shape:** `FileSystem.readFileString: (path: string, encoding?: string) => Effect.Effect<string, PlatformError>`, obtained via `Effect.gen(function* () { const fs = yield* FileSystem.FileSystem; ... })` and run via `NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)))`.

**What `readFeatureSource` would look like:**
```ts
const readFeatureSource = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFileString(path, "utf8")
  })
```
This changes the return type from `string` to `Effect<string, PlatformError, FileSystem>` and requires the caller to be inside an Effect context with a `FileSystem` Layer provided.

**Does it need `Effect.runSync` or a bigger bootstrap?** No official example anywhere uses `Effect.runSync` for a file read — every one uses `runMain`/`runPromise`. `Effect.runSync` throws outright (doesn't block) whenever the effect genuinely suspends on an async boundary, and `NodeFileSystem`'s implementation reads via Node's async `fs` APIs, so `readFileString` almost certainly suspends. **This was not confirmed by reading `NodeFileSystem`'s source directly** (time-boxed out of this pass) — flagged as the one point worth a source spot-check before finalizing a decision — but the circumstantial evidence (total absence of a `runSync` example in the docs, plus the async substrate) points strongly one way: this is **not** a drop-in `runSync` swap. It requires either (a) `loadFeature`/`parseFeature` themselves becoming Effect-returning, pushing the provide/run decision to the caller, or (b) constructing and running a full Effect runtime with the FileSystem Layer *inside* the currently-synchronous call — the "bigger runtime-bootstrap redesign" the original question anticipated as the alternative, not a minor edit.

**Bun:** `@effect/platform-bun` exists and publishes `BunFileSystem`/`BunContext.layer`. An open upstream issue (Effect-TS/effect **#5993**, "Use Bun-native file APIs in BunFileSystem instead of Node.js fs") states `BunFileSystem.js` **currently just re-exports `NodeFileSystem.layer`** — i.e. today's "Bun support" runs file I/O through Node's `fs` via Bun's compat layer, not a Bun-native implementation. Functionally fine for portability, but not what the package name implies yet.

**Deno:** **there is no official, Effect-TS-maintained `@effect/platform-deno` package.** Only third-party packages were found (`@lishaduck/effect-platform-deno`, `@aethral/platform-deno`). An open issue on the next-gen `effect-smol` repo ("Deno Support," #79) indicates first-party Deno support is still under discussion, not yet shipped even in the newer core rewrite. **Adopting `@effect/platform` today does not deliver official, maintained Deno portability** — it means an unofficial community package, or running Deno's Node-compat layer against `@effect/platform-node`.

### 3c. Is Bun's/Deno's native test runner even relevant?

`bun test` and `deno test` are separate runners with their own APIs (`bun:test`'s own `mock()`, `Deno.test`) — no interop shim was found that runs vitest test files or vitest-plugin-dependent tooling (like `@effect/vitest`'s `it.effect`/layer helpers) unmodified under either. Since `@effect-cucumber/vitest` is hard-wired to vitest's primitives via `@effect/vitest`, making the *whole* DSL (`describeFeature`, step definitions, hooks, World/Layer machinery) run on Bun's/Deno's native runners would require a net-new runner package comparable in scope to `@effect-cucumber/vitest` itself — structurally unrelated to whether `gherkin` depends on `effect`. **Reversing ADR-EC-015 cannot, by itself, make the DSL runnable on Bun/Deno's native runners.**

What the FileSystem swap *can* plausibly serve is the narrower goal: gherkin's parsing layer, independent of any runner, importable into a Bun or Deno script someone writes themselves. This is realistic — but note the current synchronous `node:fs` call in `Source.ts` **already runs fine under Bun** today (Bun implements Node's `fs` API), undercutting some of the urgency there. It is specifically **Deno** — which doesn't provide `node:fs` by default without explicit compat flags — where portability is a live, unsolved gap, and one that adopting `@effect/platform` doesn't currently close either (no official `-deno` package).

No evidence, positive or negative, was found of specific demand for Bun/Deno-native test runner support in the Cucumber/Gherkin ecosystem generally — open/unconfirmed, not validated demand and not a non-issue.

**Net effect on the portability case:** the two readings of "portability" are very differently sized, and the research supports only the narrow one — parsing importable elsewhere — cleanly. Even that narrow goal is only partly served by `@effect/platform` today: Node ✅, Bun ✅ (already true without this ADR reversal, and even with it, only via a non-native compat shim per #5993), Deno ❌ (no official package). The broader "whole DSL on native runners" reading isn't served by this ADR reversal at all.

---

## 4. Alternative approaches

### 4a. Injected reader (no Effect dependency at all)

`Source.ts` is currently the sole `node:fs` consumer in the package (§2a). The alternative: parameterize it with a reader function instead of hardcoding `node:fs`.

```ts
export interface SourceReader {
  readFile: (path: string) => string
}

const defaultReader: SourceReader = {
  readFile: (path) => readFileSync(path, "utf8"),
}

export const readFeatureSource = (path: string, reader: SourceReader = defaultReader) =>
  reader.readFile(path)
```

`loadFeature`/`parseFeature` would accept an optional reader override (additive, backward-compatible signature).

**What it buys:** portability for exactly the runtime this report identifies as the real gap — Deno, which has its own synchronous `Deno.readTextFileSync` and doesn't need `node:fs` compat at all if a caller supplies a Deno-backed reader. It does this with **zero** `effect` dependency, so it doesn't touch ADR-EC-015, ADR-EC-013, the CI gate, or ADR-EC-007's registry design at all. It's a pure, additive refactor of one file.

**What it does NOT buy:** no Effect-native composability (no `Layer`, no typed Effect errors, no DI via Effect's testing/mocking tools) for consumers already in an Effect context who specifically want that. It's still fundamentally synchronous — it doesn't help with any future *async* or streaming read requirement (e.g., remote feature files, large-file streaming), since a sync reader signature can't express that. If the actual motivation is "we want Effect-native FS abstractions as a design principle," this alternative doesn't deliver that principle — it only solves the concrete Deno-portability symptom.

### 4b. Thin adapter package (`@effect-cucumber/platform-node` or similar)

A new, separate package that depends on both `@effect-cucumber/gherkin` and `@effect/platform(-node/-bun/-deno)`, and wraps gherkin's read step with an Effect-native `FileSystem`-based reader — e.g. exposing `loadFeatureEffect: (path) => Effect<ParsedFeature, ..., FileSystem>`.

Since §2a's classification shows `Parser.ts`, `Pickles.ts`, `Correlate.ts`, and `Validate.ts` are all pure (no I/O, no Effect involvement either way), an adapter package plausibly does **not** need to reimplement parsing logic — it can call gherkin's existing pure pipeline pieces directly and only replace the read step. **This is not confirmed against `index.ts`'s actual export list** (the code audit classified files but didn't verify which of `Parser`/`Pickles`/`Correlate`/`Validate` are individually exported vs. private to `loadFeature.ts`'s internal pipeline) — worth checking before treating this as settled, but it's the natural design if those pieces are or become exported.

**This pairs cleanly with 4a:** the adapter's Effect-native reader could satisfy the `SourceReader` interface from 4a, or the adapter could bypass `Source.ts` entirely and call the pure pipeline stages directly.

**What it preserves:** ADR-EC-015, ADR-EC-013, ADR-EC-007's Phase 3 correction, and ADR-EC-016's current scope all stay fully intact — gherkin itself never gains an `effect` dependency, so nothing about its existing manifest, CI gate, or design corrections is invalidated.

**What it costs:** a new package to build, test, and maintain, with its own publishing/versioning story. Its `-deno` variant is blocked today by the same gap identified in §3b (no official `@effect/platform-deno`) — it would have to depend on a community package or wait.

---

## 5. Decision framework

Four concrete options, in increasing order of how much of the existing ADR/CI/Phase-1–3 surface they disturb.

| | **A. Injected reader** (§4a) | **B. Adapter package** (§4b) | **C. `effect` as gherkin dependency, sync preserved via `runSync`** | **D. Full merge to one Effect-native package** |
|---|---|---|---|---|
| **What changes** | `Source.ts` gains a `SourceReader` parameter, default unchanged | New package added; `gherkin` unchanged (may gain 4a's hook) | `gherkin` adds `effect`/`@effect/platform` as real dependencies; `Source.ts` rewritten against `FileSystem`; `loadFeature`/`parseFeature` internally build+run a Layer to keep the sync signature | `gherkin` and `vitest` merge (or gherkin's exports become subpath exports of one package); `loadFeature`/`parseFeature` become natively Effect-returning, no `runSync` shim |
| **What breaks** | Nothing observable; additive signature only | Nothing in existing packages | `verify-no-runner-dep.sh` (must be deleted/rewritten); ADR-EC-015's text is directly contradicted; ADR-EC-013's "no Effect-specific logic in dependency tree" justification is falsified even if the package split is kept; ADR-EC-016's backstop scope re-enters gherkin; ADR-EC-007's Phase 3 "impossible" ruling on a `Layer`-based registry becomes stale, reopening that design; the one structural proof-test (`loadFeature.test.ts:34`) needs re-examination since `loadFeature.ts` calls this contract "a one-way door" | Everything Option C breaks, plus ADR-EC-013 itself (package split) is superseded outright; the charter line in `overview.md` ("useful even to something that isn't `@effect-cucumber/vitest`") is no longer true |
| **What's gained** | Deno portability for parsing (Deno's own sync FS API), zero new dependency | Full Effect-native, Layer-composable feature loading for whoever explicitly wants it, without forcing it on anyone else | A "we use `@effect/platform`" story for Node; **does not actually gain Bun** (already works via compat) **or Deno** (no official `-deno` package) beyond what Options A/B already give more cheaply, per §3b/3c | Same portability ceiling as C, plus a simpler single-package mental model and no more "impossible design" workarounds like the plain-object registry |
| **Feasibility risk** | Low — self-contained refactor | Low-medium — new package surface, but isolated | **High and load-bearing**: §3b found no evidence `readFileString` is `runSync`-safe; if it suspends, this option may not be achievable as designed without dropping to raw `fs` inside the wrapper anyway (defeating the point) | Same technical risk as C, plus organizational/publishing risk of the merge itself |
| **Effort** | Low | Medium | High | Highest |
| **ADRs it supersedes** | None | None | ADR-EC-015 (contradicted); ADR-EC-013 (rationale undercut, not necessarily superseded if the split is kept anyway); amendment needed on ADR-EC-007's correction; scope note on ADR-EC-016 | ADR-EC-015, ADR-EC-013 both superseded outright; ADR-EC-007's correction superseded; ADR-EC-016 rescoped |
| **ADRs it leaves fully intact** | All 20 | All 20 | The other 16 (vitest-DSL ADRs, unaffected either way) | The other 16 (vitest-DSL ADRs, content unaffected, though now living in one package) |
| **Reopens PARSE-01 / re-verifies Phase 1–3?** | **No** — public sync contract unchanged, only an optional new parameter; existing tests and Phase 1–3 verification stand | **No** — purely additive; gherkin's own Phase 1–3 work is untouched | **Yes** — PARSE-01 is explicitly built on the effect-free synchronous contract (per `SUMMARY.md` and multiple source doc comments); reversing it requires reopening PARSE-01 and re-verifying at minimum Phase 2's `Source.ts`/CI-gate work and Phase 3's `ParameterTypeStore` design | **Yes, most invasively** — full Phase 1–3 re-verification plus a package-structure/publishing re-plan |

**One cross-cutting note on the premise:** per §3c, "Node/Bun/Deno portability" is not one goal but two very differently sized ones, and per §3b the concrete `@effect/platform` story is currently incomplete for two of the three target runtimes (Bun's platform package proxies through Node's `fs` rather than being native; Deno has no official platform package at all). That weakens the strongest form of the case for Options C/D specifically, since neither actually closes the Deno gap today, while Option A closes it directly and cheaply. Options C and D's clearest value proposition is not "portability" so much as "Effect-native design consistency" for its own sake — which is a legitimate reason to want them, but a different justification than the one that opened this research, and worth being explicit about when deciding.
