# ADR-EC-021: `effect` and `@effect/platform` become peer dependencies of `@effect-cucumber/gherkin`, pinned to v4 only — supersedes ADR-EC-015

> **Status:** Accepted and implemented — `effect` is a real peer dependency; `FileSystem`/`Path` are used via core `effect` (not `@effect/platform`, which remains genuinely unavailable for v4 — see both Corrections below for the full, twice-revised story)
> **Date:** 2026-08-28
> **Context:** reverses [ADR-EC-015](015-effect-is-a-peer-dependency.md) after a dedicated research pass (`.planning/research/ADR-EC-015-reversal-report.md`); this is a new ADR rather than a correction to ADR-EC-015, per `spec/process/requirement-id-scheme.md`'s rule that a genuinely new design question gets its own ADR

## Context

ADR-EC-015 committed `@effect-cucumber/gherkin` to having zero relationship to `effect` in any manifest field, reasoning that the package has "no Effect-specific logic" and should stay usable by a consumer who isn't `@effect-cucumber/vitest`. That reasoning wasn't wrong at the time — it was a deliberate, then-correct trade-off, made before any code existed (see the research report's timeline audit).

This session reopened the question directly: should `@effect-cucumber/gherkin` adopt `@effect/platform`'s `FileSystem`/`Path` abstractions, trading the effect-free boundary for Effect-native capability — typed errors, composable Layers, tracing, swappable I/O? The research report that followed audited every ADR, the real code surface (only `Source.ts` and `loadFeature.ts` actually touch I/O; the rest of the package is pure either way), and the external Effect ecosystem (no comparable "effect-free core" precedent exists; `@effect/platform`'s Node coverage is solid, Bun's proxies through `node:fs`, Deno has no official package).

The decision reached is not that ADR-EC-015 was mistaken — it's that this project's priorities have changed: `@effect-cucumber` is Effect-only by design (no non-Effect consumer was ever actually being served), and the most capable testing experience is now valued over minimizing `gherkin`'s dependency footprint or avoiding migration cost. Complexity and migration risk are explicitly accepted, not weighed against the outcome.

## Decision

- `@effect-cucumber/gherkin` declares `effect` and `@effect/platform` as `peerDependencies`, not `dependencies` — the same shape ADR-EC-015 already established for `@effect-cucumber/vitest`, now extended to `gherkin` too. The consumer's own single `effect` install satisfies the peer range; `gherkin` never bundles its own copy, which is exactly what keeps `Context.Service`/`Context.Tag` identity checks safe (the same concern ADR-EC-015 raised, still true, now handled the same way on both packages).
- **v4 only.** The peer range (`^4.0.0-rc.112`, via the `peer` pnpm catalog, matching `effect`'s and `@effect/vitest`'s existing range) targets Effect v4 exclusively, consistent with [ADR-EC-012](012-effect-v4-beta.md). No v3 compatibility shim, no dual-targeting.
- `@effect-cucumber/gherkin` does **not** depend on any concrete platform implementation (`@effect/platform-node`, `@effect/platform-bun`, `@effect/platform-deno`). It depends only on the `FileSystem`/`Path` service _interfaces_ from `@effect/platform`. The concrete `Services` Layer (`NodeServices`, `BunServices`, ...) is supplied by whichever runner package consumes `gherkin` — today `@effect-cucumber/vitest`, potentially a future non-vitest runner package — via a `ManagedRuntime` that package owns. `gherkin` stays runtime-agnostic even though it is no longer Effect-agnostic. `scripts/verify-no-runner-dep.sh` now enforces this split mechanically: `effect`/`@effect/platform` are permitted only as `peerDependencies`, never `dependencies`; concrete platform packages and any test runner remain forbidden in every manifest field and every source import, unchanged from before.
- `loadFeature`/`parseFeature` change signature from a plain synchronous return to `Effect<ParsedFeature, GherkinError, FileSystem.FileSystem | Path.Path>`. This is the behavioral change [BEH-EC-001](../behaviors/01-steps-and-world.md#beh-ec-001-loading-a-feature-file) will need to reflect — not done as part of this ADR; see Follow-up.
- Gherkin's own error types migrate from plain `Error` subclasses to `Schema.TaggedError`, consistent with [ADR-EC-008](008-data-tables-and-doc-strings-decode-through-schema.md)'s existing `Schema` usage elsewhere in this project, now that `Schema`/`effect` are reachable from this package.

## Consequences

**Positive**:

- Typed, matchable error channels (`Effect.catchTag`) instead of `instanceof` checks.
- A swappable `FileSystem`/`Path` service — virtual/in-memory feature sources, remote sources, or a future Deno implementation — all without touching `gherkin`'s own code, only the Layer a runner package provides.
- Tracing spans (`Effect.withSpan`) available on feature-loading for free, composable with whatever tracing the consuming test suite already has.
- Removes an entire class of "impossible in this package" design workarounds — see the amendment to [ADR-EC-007](007-cucumber-expressions-for-step-matching.md).

**Negative**:

- `PARSE-01`/[BEH-EC-001](../behaviors/01-steps-and-world.md#beh-ec-001-loading-a-feature-file) is reopened: the synchronous, module-top-level `loadFeature` contract this project's Phase 1–3 work was built and verified against no longer holds as specified, once the source code is actually migrated (not yet done — see Follow-up).
- The "usable by something that isn't `@effect-cucumber/vitest`" value [ADR-EC-013](013-effect-cucumber-npm-scope.md) named is narrowed to "usable by something that isn't `@effect-cucumber/vitest` **but is still an Effect program**" — see the amendment to ADR-EC-013.
- `@effect/platform`'s official runtime coverage is uneven across the three target runtimes as of this research: Node is solid, Bun's `FileSystem` currently proxies through Node's `fs` rather than being native (upstream issue `Effect-TS/effect#5993`), and there is no official `@effect/platform-deno` at all. Adopting this ADR does not, by itself, deliver the portability story that partly motivated reopening the question — that gap is orthogonal to this decision and unresolved by it.

**Trade-off accepted**: migration cost, the reopened PARSE-01 verification work, and today's incomplete Bun/Deno platform coverage are all accepted in exchange for Effect-native capability, on the explicit basis (this session) that this library serves Effect users exclusively and the most capable testing experience is the priority — not dependency-footprint minimization.

## Follow-up (not decided by this ADR)

- Whether `ParameterTypeStore` migrates from a plain-object registry to a `Context.Service`/`Layer`-provided one, now that [ADR-EC-007](007-cucumber-expressions-for-step-matching.md)'s "impossible" constraint is gone — this ADR only removes the constraint; it does not decide the migration.
- Which package owns the `ManagedRuntime` construction (`@effect-cucumber/vitest` itself, or a separate thin adapter shared with a future non-vitest runner package) — raised during design, not yet settled.
- ~~The actual rewrite of `Source.ts`, `loadFeature.ts`, and `Errors.ts`~~ — **done**, see the second Correction below. `BEH-EC-001` is updated to match; `BEH-EC-014`/`BEH-EC-015` were not touched by this rewrite (no change to their normative content was needed).
- Bun/Deno concrete `FileSystem` Layers for `gherkin`'s own use are not built — `gherkin` never depends on a concrete platform implementation by design (see Decision), so this was never gherkin's to build; a future runner package targeting Bun/Deno would supply its own.

---

> **Correction (2026-08-28, verified against the npm registry while wiring the actual dependency):** the Decision section above states `@effect-cucumber/gherkin` declares both `effect` and `@effect/platform` as `peerDependencies`. Only `effect` actually landed. `npm view @effect/platform versions`/`dist-tags` shows **no published `@effect/platform` release compatible with Effect v4**: the latest stable release (`0.97.1`) peer-depends on `effect@^3.22.1`, and the only release touching a v4-line `effect` is a single unstable CI snapshot build (`0.0.0-snapshot-6ebc752baf28354006ca2a0ae783a5bccf5de9ad`) that peer-depends on that exact snapshot hash of `effect` and `@effect/schema` — not a real, installable release line, and not a match for this project's `4.0.0-rc.112` pin.
>
> Declaring `@effect/platform` as a peer dependency today would either (a) reference a version that doesn't exist, breaking `pnpm install` for every consumer (this is exactly what happened when this ADR's original wiring was attempted — `ERR_PNPM_NO_MATCHING_VERSION`), or (b) pin to the real stable `0.97.1`, which is incompatible with this project's v4-only commitment ([ADR-EC-012](012-effect-v4-beta.md)) since it expects `effect` v3.
>
> **What's actually true right now:** `@effect-cucumber/gherkin`'s `package.json` declares only `effect` (`catalog:peer`, `^4.0.0-rc.112`) as a peer dependency. `@effect/platform` is a decided, intended peer — this ADR's Decision and Consequences sections above still describe the target design — but it is **not yet declared anywhere**, and the `FileSystem`/`Path`-based rewrite of `Source.ts`/`loadFeature.ts` this ADR anticipates is blocked on it, not merely undone. This is a harder blocker than the rest of the Follow-up list: those items are undecided; this one is decided but not achievable yet. Revisit once `@effect/platform` publishes a real v4-compatible release.

---

> **Correction (2026-08-28, verified by direct install and a deep Effect-feature-adoption research pass — `.planning/research/effect-feature-adoption-report.md`):** the correction immediately above was checking the wrong package. `@effect/platform` (the aggregate package) genuinely has no v4-compatible release — that much was right. But `effect` v4 moved `FileSystem`/`Path`/`PlatformError`/`Terminal` directly into the **core `effect` package** (`effect/FileSystem`, `effect/Path` — confirmed by import, zero extra dependency), and the **per-runtime implementation packages have their own, independent version lines that kept pace with the v4 rc train even though the aggregate didn't**:
>
> | Package                        | `latest`                         | `rc` dist-tag                                   |
> | ------------------------------ | -------------------------------- | ----------------------------------------------- |
> | `@effect/platform` (aggregate) | `0.97.1`, peers `effect@^3.22.1` | none — still genuinely blocked                  |
> | `@effect/platform-node`        | `0.108.1`                        | `4.0.0-rc.112` — matches this workspace exactly |
> | `@effect/platform-bun`         | `0.91.2`                         | `4.0.0-rc.112`                                  |
> | `@effect/platform-deno`        | `4.0.0-beta.107`                 | `4.0.0-rc.112`                                  |
>
> `@effect/platform-node@4.0.0-rc.112` was installed and verified directly (not just checked on the registry): its `NodeFileSystem.layer` reads real files via `Effect.runPromise` against `effect/FileSystem.FileSystem` — the exact same service Tag (`FileSystem.FileSystem.key === "effect/platform/FileSystem"`) whether reached through core `effect` or through `@effect/platform-node`'s re-export.
>
> **This ADR's Decision is amended, not superseded:** `@effect/platform` itself is still never declared (still correctly blocked, and — per the Decision's own architecture — `gherkin` was never going to declare a concrete platform package as a dependency anyway). What changes is that the _interface_ half of the plan needed no new peer at all (`effect` alone already covers it), and the _implementation_ half is unblocked via `@effect/platform-node`, but only as a **`devDependency`** of `gherkin` (for its own test suite — see `test/loadFeature.test.ts`), never a `dependency` or `peerDependency` of the shipped package, exactly matching the Decision's original "no concrete platform implementation" architecture.
>
> **The rewrite anticipated in the Follow-up list is done:** `Source.ts#readFeatureSource` and `loadFeature.ts#loadFeature` now require `FileSystem.FileSystem` and are implemented via `effect/FileSystem`, with `@effect/platform-node`'s `NodeFileSystem.layer` providing it in tests. One real, confirmed-by-reproduction trade-off came with this: `NodeFileSystem.readFileString` suspends internally, so **`Effect.runSync(loadFeature(path))` no longer works** — it throws `AsyncFiberError` — where the earlier `node:fs.readFileSync`-backed interim implementation was `runSync`-safe. `test/loadFeature.test.ts`'s module-top-level proof of PARSE-01/BEH-EC-001 now uses a top-level `await Effect.runPromise(...)` instead of `Effect.runSync`, and pins the `runSync` failure explicitly so a future change to this trade-off is forced to notice. `parseFeature` (no filesystem touched) is unaffected and stays `Effect.runSync`-safe.
>
> `Errors.ts`'s `Schema.TaggedError` migration was completed earlier in this same session (see `.planning/research/` history) and is unaffected by this correction.
