# ADR-EC-038: Rerun-failed-only — a `(uri, ruleName, title)` key stamped onto `task.meta`, a template write-side script over `--reporter=json`, and a synthetic skip node for an emptied block

> **Status:** Accepted and implemented — shipped end to end, observed against the real runner in
> `packages/vitest/test/Runner.test.ts`, `packages/vitest/test/RerunKey.test.ts`,
> `packages/vitest/test/RerunManifest.test.ts`, `packages/vitest/test/describeFeature.test.ts`, and
> from OUTSIDE the test process, across two real `vitest run` invocations, by
> `scripts/verify-rerun-failed-only.sh`
> **Date:** 2026-09-04
> **Context:** implements the "Rerun-failed-only support" entry locked under `spec/roadmap.md`'s §
> Planned ([#34](https://github.com/leaderiop/effect-cucumber/issues/34)), building on a real,
> working spike (`origin/spike/rerun-failed-only`, `research/rerun-failed-only-spike.md`) that proved
> the write→read cycle end to end against an EARLIER `main` — re-verified here against the CURRENT
> one, which retries (ADR-EC-034), tagged hooks (ADR-EC-035), Attachments (ADR-EC-036) and Metric
> wiring (ADR-EC-037) had all touched since

## Context

The spike proved the core idea works: register a Feature, run it once with one deliberate failure,
convert vitest's own `--reporter=json` output into a small manifest file with a script, run again
with a new `describeFeature` option, and see exactly the failed Scenario re-register. Its own write-up
names the crux finding precisely: `ScenarioKey.ts`'s existing `(ruleId, astName)` key is not usable
here, because `ruleId` (and `ParsedScenario.id`) come from a fresh `IdGenerator.uuid()` on every
`loadFeature()`/`parseFeature()` call — confirmed unchanged on current `main`,
`packages/gherkin/src/loadFeature.ts`'s own module doc still says "node ids are stable only within
one `ParsedFeature` — never persist or compare them across calls." A key usable across two SEPARATE
runs has to be built from something that does not change between them: the Feature's `uri`, the
enclosing Rule's `name` (not its id), and the Scenario's own emitted title — which
`OutlineTitle.ts`'s `buildScenarioTitles` already computes deterministically, disambiguating Outline
rows and byte-identical titles.

The spike also named two rough edges it found by actually running the thing, and the roadmap entry
this ADR implements says both are mandatory, not deferrable polish:

1. A Feature whose every candidate key is stale (nothing in the manifest matches) collapses the
   whole test FILE to vitest's own "no test found in suite" failure — worse than what
   `rerunFailedOnly` exists to avoid.
2. The spike's own key had no `uri` component, so two `.feature` files sharing a Feature `name`
   would collide.

Two things changed on `main` since the spike that materially improve on its own design rather than
merely requiring it to be re-verified:

**Attachments (ADR-EC-036) already opened the exact seam the spike's own §5.3 discussion said would
be needed to fix rough edge 2 "properly."** The spike, written before Attachments existed, considered
and set aside widening `TestApi.ts`'s `EmitOptions`/`VitestTestApi.ts` to reach vitest's own
`TestContext` — its write-up called that cost "a seam widening only the manifest-writer script would
benefit from" and instead proposed the lower-cost alternative of embedding the `uri` (or a hash of it)
directly into the printed Feature title. Attachments landed since then and did exactly that widening,
for an unrelated reason (`Attachments.attach` needs `ctx.annotate`): `VitestTestApi.ts`'s
`attachmentsLive(ctx)` already receives vitest's real `TestContext` inside both `it.effect` call
sites. Re-verified directly against the installed source (`packages/vitest/src/VitestTestApi.ts`,
current `main`): the `ctx` parameter is right there, already threaded through. Stamping a value onto
`ctx.task.meta` at that same point costs one `if` and one field assignment, not a new seam — so the
"low-cost, terminal-title-changing" alternative the spike settled for is no longer the cheapest
option; a `task.meta` stamp is now cheaper AND does not touch what a developer sees in the terminal.

**`vitest@4.1.11`'s `JsonReporter` already serialises `task.meta` verbatim, and only that reporter
does** (`research/vitest-failure-reporter-surface.md`, the finding that already justified the write
side being a standalone script over `--reporter=json` rather than a custom `Reporter` class). That
fact, established for an unrelated purpose (the failure-panel work), turns out to be exactly what
makes a `task.meta` stamp usable here: the write-side script already reads nothing but
`--reporter=json` output, so a value that reaches `task.meta` reaches it for free — no separate
mechanism is needed to smuggle it into that specific report.

## Decision

### 1. The stable key: `(uri, ruleName, title)`, joined with `::`

```ts
// packages/vitest/src/RerunKey.ts
export const rerunKey = (uri: string, ruleName: string | null, title: string): string =>
  `${uri}::${ruleName ?? ""}::${title}`

export const rerunKeysForPlan = (plan: FeaturePlan): ReadonlyMap<string, string> => {
  const titles = buildScenarioTitles(plan.feature)
  const ruleNameById = new Map<string, string>()
  for (const rule of plan.feature.rules) ruleNameById.set(rule.id, rule.name)
  const keys = new Map<string, string>()
  for (const scenarioPlan of plan.scenarios) {
    const ruleId = Option.getOrNull(scenarioPlan.ruleId)
    const ruleName = ruleId === null ? null : ruleNameById.get(ruleId) ?? null
    const title = titles.get(scenarioPlan.scenarioId) ?? scenarioPlan.name
    keys.set(scenarioPlan.scenarioId, rerunKey(plan.feature.uri, ruleName, title))
  }
  return keys
}
```

`uri` is the FIRST component, not appended, so a prefix check against it (used by the stale-key
detection in §5) is a plain `startsWith`. This fixes rough edge 2 directly: two `.feature` files
sharing a Feature name now produce keys differing in their first component. The `::` separator
matches the spike's own choice; it is a pragmatic one, not a collision-proof one (a name containing a
literal `::` could in principle produce a colliding key), the same honest limitation
`ScenarioKey.ts`'s own `\0`-joined key next to it has relative to a name containing that character —
recorded here rather than silently assumed away.

`rerunKeysForPlan` is computed ONCE, by `describeFeature.ts`, and handed to `Runner.ts`'s
`emitFeature` as plain data (`rerunKeys: ReadonlyMap<string, string>`) — the same "decide in
`describeFeature.ts`/`Tags.ts`, apply in `Runner.ts`" split `retry`/`skip` already have. It is
computed UNCONDITIONALLY, on every run, not only a `rerunFailedOnly` one: an ordinary run is exactly
the run whose `--reporter=json` output the write-side script reads to produce the NEXT run's
manifest, so the key must be present in `EmitOptions`/`task.meta` regardless of whether the CURRENT
run itself filters by one.

### 2. The key is carried across the `TestApi` seam as plain data, and reaches `task.meta` only inside `VitestTestApi.ts`

`TestApi.ts`'s `EmitOptions` gains one field:

```ts
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly retry: boolean
  readonly contextFree: boolean
  readonly scenario: boolean
  readonly rerunKey: string | null
}
```

`Runner.ts` sets it from the precomputed `rerunKeys` map for every real Scenario emission
(`null` for the trailing warning nodes and the new synthetic node from §4 — never a Scenario).
`VitestTestApi.ts` is the only module that turns it into a framework call, exactly like `retry`
becoming a real `flakyTest` wrap (ADR-EC-034) — never in `Runner.ts`, which may not import a test
framework (`scripts/verify-testapi-seam.sh`):

```ts
it.effect(name, (ctx) => {
  if (emitOptions.rerunKey !== null) {
    ctx.task.meta.rerunKey = emitOptions.rerunKey
  }
  return self().pipe(Effect.provide(attachmentsLive(ctx)))
}, emitOptions)
```

Stamped BEFORE `self()` runs, so it survives a FAILING Scenario — `task.meta` is a plain property on
the task object, set independently of how the test body later exits, the same reason `attachmentsLive`
already needs `ctx` bound before the body runs rather than after. `TaskMeta` (`@vitest/runner`,
re-exported by `vitest`) is declared as an empty interface specifically so a caller can extend it via
TypeScript declaration merging — vitest's own documented extension mechanism — so `VitestTestApi.ts`
(the one module permitted to name the framework) adds:

```ts
declare module "vitest" {
  interface TaskMeta {
    rerunKey?: string
  }
}
```

`emitOptions` (the reduced `{ tags, skip, rerunKey }` object `makeDegradingEffect`'s two callers
build) is passed to `it.effect` BY REFERENCE, not rebuilt as a fresh `{ tags, skip }` literal: under
`exactOptionalPropertyTypes`, a fresh literal would widen `tags?: Array<string>` to a mandatory
`Array<string> | undefined`, which `it.effect`'s own `TestOptions.tags` (`string | string[]`, no
`undefined`) rejects — passing the existing reference keeps `tags`' true optionality and lets
`it.effect`'s own type simply ignore the extra `rerunKey` field it does not interpret.

### 3. The manifest: `{ "failed": string[] }`, read synchronously, `null` degrades to "no filter"

```ts
// packages/vitest/src/RerunManifest.ts
export const defaultRerunManifestPath = ".effect-cucumber/rerun-manifest.json"
export const readRerunManifest = (path: string): ReadonlySet<string> | null => {/* ... */}
```

Read with `node:fs`'s synchronous `readFileSync`, not through `@effect-cucumber/gherkin`'s
`FileSystem`-backed reader or any `Effect` at all — `describeFeature` runs at vitest
collection/config-load time, which is synchronous end to end, the identical constraint ADR-EC-026
already recorded for `GherkinTags.ts`'s `globSync` over the async `glob`. `readRerunManifest` returns
`null` — "no filter", every Scenario registers normally — for THREE distinct reasons, and only two of
them warn:

- the file does not exist (the ordinary "no manifest has ever been written for this Feature" case —
  no warning; a rerun-only mode that could not run without a manifest from a prior run of its own
  would be useless on the very first run, so this is the intended bootstrap path, not a failure);
- the file's contents are not valid JSON (warns: `MalformedRerunManifest`);
- the parsed JSON does not match `{ failed: string[] }` (warns: `MalformedRerunManifest`).

This mirrors `UndeclaredTagWarning`'s "warn, don't silently ignore, and don't fail the Feature either"
posture (ADR-EC-026) rather than throwing — a malformed or absent manifest degrading a
`rerunFailedOnly: true` run back to "run everything" is a safe default a consumer can recover from by
just running the suite again; failing the whole Feature over it would not be.

### 4. Two synthetic-skip-node fixes for rough edge 1 — one per Feature block, one per Rule block

`Runner.ts`'s `emitFeature` tracks a SECOND exclusion counter, `rerunExcludedScenarioCount`, applied
AFTER the tag filter at both existing call sites (composing the same "registration filter, then the
next one over whatever survived" order `includeTags`/`excludeTags` already established relative to
the CLI filter, ADR-EC-026):

```ts
if (!shouldEmit(tagFilter, scenarioPlan.tags)) {
  excludedScenarioCount += 1
  continue
}
if (!passesRerunFilter(scenarioPlan)) {
  rerunExcludedScenarioCount += 1
  continue
}
```

When `rerunFilter !== null` and this is the reason a block would otherwise end up with zero children,
ONE synthetic node is emitted in its place — same shape as the existing trailing warning nodes
(`contextFree: true` so it never forces the shared tier to build, `scenario: false` so `Metric`
wrapping skips it, `skip: true` so it never runs a body):

- **Feature-level**: fires when `rerunExcludedScenarioCount > 0` AND
  `plan.scenarios.length - excludedScenarioCount - rerunExcludedScenarioCount === 0` — i.e. every
  Scenario named by this Feature's plan, feature-level or nested in any Rule, was excluded, and at
  least one of those exclusions was the rerun filter's doing (not purely `includeTags`/`excludeTags`,
  which is unrelated to this feature and untouched by it).
- **Rule-level**: the same check scoped to one Rule's own nested `api.describe` block, tracked with
  local counters reset per Rule (`ruleEmittedCount`, `ruleRerunExcludedCount`). Added defensively,
  even though the Feature-level fix alone is what prevents the whole FILE from tripping vitest's "no
  test found in suite" (a nested `describe` with zero of its own children, while sibling Scenarios
  elsewhere in the file keep the file's own total non-zero, was NOT observed to crash the run in this
  ADR's own verification) — kept anyway because it is cheap, precedented (the identical shape as the
  Feature-level node), and gives a Rule that matched nothing its own explicit, honest node instead of
  silently vanishing with no trace in the output.

Both are proven for real, against a real second `vitest run`, by `scripts/verify-rerun-failed-only.sh`
(§6 below) — not merely asserted never to crash by absence of an exception in an in-process test.

### 5. The "manifest names a Scenario that no longer exists" warning

Detected entirely from this library's own plan data — no runner rejection is involved, unlike
`UndeclaredTagWarning` (ADR-EC-026), which reacts to the test framework's own strict-tags rejection at
the one adapter permitted to name it. A stale key is knowable purely by comparing `rerunKeys`' own
computed values (every real key for THIS Feature, ignoring the tag filter — a Scenario a tag filter
also happens to exclude this run is not "stale", it is a real Scenario the manifest correctly names,
merely irrelevant to a DIFFERENT filter) against the subset of the manifest's `failed` set that starts
with this Feature's own `uri` prefix. This places it structurally next to `plan.warnings`, printed in
`describeFeature.ts` alongside the existing warning loops, rather than at the `VitestTestApi.ts`
adapter-catch site:

```ts
const uriPrefix = `${collection.plan.feature.uri}::`
const knownKeys = new Set(rerunKeys.values())
const staleKeys = [...rerunFilter].filter((key) => key.startsWith(uriPrefix) && !knownKeys.has(key))
if (staleKeys.length > 0) {
  console.warn(makeStaleRerunManifestKeyWarning({ uri, featureName, keys: staleKeys }).message)
}
```

`makeStaleRerunManifestKeyWarning` (`Errors.ts`) follows the same plain-data-plus-`message` shape
`UndeclaredTagWarning`/`ExcludedScenariosNotice` already use. No corresponding notice exists for the
ORDINARY case — a manifest key simply not covering a Scenario that passed last run — because that is
the intended, unremarkable outcome of `rerunFailedOnly` working correctly, not something a consumer
needs telling about.

### 6. The write side ships as a documented template script, not a package export or a custom Reporter

`scripts/templates/write-rerun-manifest.mjs` — copy into a consumer's own repo, run after
`vitest run --reporter=json --outputFile=<path>`, per README.md's "Rerun failed Scenarios only"
recipe. This follows the exact precedent LINT-01 already set (README.md's "Recommended lint and
compiler configuration" section): this package ships zero enforcement/tooling that runs automatically
against a CONSUMER's own repo, only copy-paste templates and documented recipes
(`scripts/templates/verify-consumer-ref-state.sh` is the existing example). The core reason for a
standalone script rather than a custom vitest `Reporter` is unchanged from the spike and already
independently established: `JsonReporter` is the only vitest reporter that serialises `task.meta`
(`research/vitest-failure-reporter-surface.md`), so a script over its OWN output needs no custom
`Reporter` class to exist at all. Materially simpler than the spike's own script, as a direct
consequence of §2 above: the spike's write side had to RECONSTRUCT each key from
`assertionResults[].ancestorTitles`/`.title`, duplicating the exact join logic the read side used and
risking the two silently drifting from one another; this one reads `assertionResults[].meta.rerunKey`
directly — the SAME string `Runner.ts`/`RerunKey.ts` computed once, at the single source of truth,
with no reconstruction and no duplicate logic to keep in sync:

```js
for (const testResult of report.testResults ?? []) {
  for (const assertion of testResult.assertionResults ?? []) {
    if (assertion.status !== "failed") continue
    const key = assertion.meta?.rerunKey
    if (typeof key === "string") failed.add(key)
  }
}
```

Every run REPLACES the manifest's contents (not accumulating history across runs) — the same
semantics cucumber-js's and behave's own rerun files already use, and the only sane semantics for a
file meant to answer "what failed LAST time", not "what has ever failed."

## Read-side option, mirroring `includeTags`/`excludeTags` exactly

`DescribeFeatureOptions` gains two fields, extending the SAME registration-time filtering mechanism
those two already use rather than building a parallel one:

```ts
export interface DescribeFeatureOptions {
  readonly includeTags?: ReadonlyArray<string>
  readonly excludeTags?: ReadonlyArray<string>
  readonly rerunFailedOnly?: boolean
  readonly rerunManifestPath?: string // defaults to RerunManifest.ts's defaultRerunManifestPath
}
```

`rerunManifestPath` is only ever read when `rerunFailedOnly` is explicitly `true` — absent/`false`
costs nothing, not even a `readFileSync` call, matching `includeTags`/`excludeTags`'s own
"`undefined` means no filter, and costs nothing" shape. `describeFeature.ts`'s `anyRunnable` check
(which decides whether the shared Layer tier needs to build EAGERLY at all) was extended to also
consult the rerun filter, so a Feature the manifest excludes entirely does not build a shared tier for
a synthetic skip node that will never consume it:

```ts
const anyRunnable = collection.plan.scenarios.some((scenarioPlan) =>
  shouldEmit(tagFilter, scenarioPlan.tags) &&
  !isSkipped(scenarioPlan.tags) &&
  (rerunFilter === null || rerunFilter.has(rerunKeys.get(scenarioPlan.scenarioId) ?? ""))
)
```

## New invariant: INV-EC-009

A Scenario's rerun key is stable across two SEPARATE `loadFeature()` invocations of the identical
`.feature` file content, unlike `ScenarioKey.ts`'s AST-derived `(ruleId, astName)` key. See
`spec/invariants.md` for the authoritative statement.

## Verification — real, not mocked

**Unit level**: `packages/vitest/test/RerunKey.test.ts` (pure `rerunKey`/`rerunKeysForPlan` cases,
including two Features sharing a name but differing `uri` producing different keys — rough edge 2,
directly), `packages/vitest/test/RerunManifest.test.ts` (missing file → `null`, malformed JSON →
`null` + warns, wrong shape → `null` + warns, valid file → the expected `Set`), and
`packages/vitest/test/Runner.test.ts`'s new `rerunFailedOnly` describe block, driven through the SAME
recording-fake `TestApi` the rest of that file already uses — asserting the filter composes after the
tag filter, that `EmitOptions.rerunKey` is stamped correctly (and `null` for warning/synthetic
nodes), that `rerunExcludedScenarioCount` is reported correctly, and that the Feature-level and
Rule-level synthetic nodes fire exactly when the roadmap's rough edge 1 describes and never otherwise
(a partially-excluded Feature/Rule gets no synthetic node at all).

**Acceptance level** (`packages/vitest/test/acceptance/rerun-failed-only.feature`/`.steps.test.ts`,
`@REQ-EC-030`): a real `describeFeature` run, against a HAND-AUTHORED fixed manifest (its one entry
computed by hand using `RerunKey.ts`'s own documented format, not generated dynamically), naming only
ONE of two Scenarios. An observer `it.effect`, in the SAME unshuffled block (this repo's established
convention for reading what an earlier suite recorded — `metrics.steps.test.ts` follows the identical
shape), asserts via a `Ref` each step increments that ONLY the named Scenario's steps actually
EXECUTED — proof that registration-time exclusion is real, not merely that a title happens to be
absent, since an excluded Scenario's steps structurally cannot run at all. This proves the READ side
end to end for real, using a fixed manifest rather than one generated by an actual prior failing run —
that half of the cycle (a real run producing real `--reporter=json` output, a real script converting
it, a SECOND real run consuming it) does not fit a single `vitest run` acceptance scenario by
construction (a single run cannot prove what a SECOND run does differently), so it is proven
separately, for real, below.

**Cross-run level** (`scripts/verify-rerun-failed-only.sh`, wired into CI the same way
`verify-failure-panel.sh`/`verify-attachments-panel.sh` already are — a dedicated fixture directory
with its own standalone `vitest.config.ts`, excluded from every normal run, invoked via `--config`):
against `packages/vitest/test/rerun-fixture/`, containing two DIFFERENT `.feature` files sharing the
literal Feature name `Calculator` and the literal Scenario title `Adds two numbers` — one deliberately
wrong (fails), one correct (passes) — plus a third, `stale-manifest.feature`, with one always-passing
Scenario:

1. A real `vitest run --reporter=json --outputFile=...` over both `calculator-a`/`calculator-b` files
   — asserts exactly 1 failed, 1 passed.
2. The real, shipped `scripts/templates/write-rerun-manifest.mjs`, run unmodified, over that report —
   asserts the resulting manifest contains exactly ONE key, and that it names `calculator-a.feature`'s
   own `uri`, not `calculator-b.feature`'s — proving rough edge 2's fix for real: two same-named
   Features in different files did not collide, and the passing Feature's key correctly never entered
   the manifest at all.
3. A SECOND real `vitest run` with `rerunFailedOnly: true` pointed at that manifest, over the same two
   files, captured again as `--reporter=json` — asserts `calculator-a.steps.test.ts`'s own file entry
   still shows its one Scenario, now re-run (and failing again, since it is unfixed) — while
   `calculator-b.steps.test.ts`'s own file entry shows ZERO real Scenario assertion results and
   instead exactly one entry whose title matches the Feature-level synthetic skip node from §4 — the
   exact case rough edge 1 describes (every key for that Feature was excluded — here because it
   PASSED last run, not because it was renamed) proven not to crash the run, with the process exiting
   0.
4. A THIRD real `vitest run` with `rerunFailedOnly: true` against `stale-manifest.feature` alone, fed
   a hand-crafted manifest naming a key with that file's own `uri` prefix but a title that matches no
   real Scenario in it (simulating a renamed/removed Scenario, distinct from case 3's "passed, so
   correctly absent" case) — asserts the process exits 0 (not a crash), the Feature-level synthetic
   skip node's title appears in the output, vitest's own "no test(s) found" phrasing does NOT appear,
   and `StaleRerunManifestKeyWarning`'s message DOES appear — proving rough edge 1's fix AND the §5
   stale-key warning together, for a manifest entry that is genuinely stale rather than merely
   "not this run's business."

## Consequences

**Positive**:

- The whole write→read cycle now works against current `main`, re-verified rather than merely
  ported, and is proven by a real two-invocation `vitest run` sequence, not an in-process simulation.
- Both roadmap-mandated rough edges are fixed and each is proven by a dedicated, real assertion —
  neither is deferred.
- The manifest key computation has exactly ONE implementation (`RerunKey.ts`), read by both
  `describeFeature.ts` and `Runner.ts`, and the write-side script no longer reconstructs it at all —
  it reads back the identical string the read side already computed, closing off a whole class of
  write/read drift the spike's own design was exposed to.
- `rerunFailedOnly` costs nothing when unused: no manifest read, no filter application, and the only
  always-on cost is the cheap `rerunKeysForPlan` computation needed so an ORDINARY run's own
  `--reporter=json` output can seed the NEXT run's manifest.

**Negative**:

- `rerunKey` is now a mandatory field on every `EmitOptions` value and every `emitFeature` call site
  needs a `rerunFilter`/`rerunKeys` pair (`null`/an empty map reproduces the exact old behavior) — a
  real, if mechanical, ripple through every existing test that constructs either directly.
  `TaskMeta`'s declaration-merge augmentation lives in `VitestTestApi.ts`, the one file permitted to
  import the framework — a reader who does not already know vitest's `TaskMeta` extension convention
  has one more thing to learn there.
- A consumer must wire the write-side script into their own CI themselves (a `test:record`-style
  script running `vitest run --reporter=json` then the template) — nothing in this package does that
  automatically, consistent with the LINT-01 precedent but a real extra step relative to a
  hypothetical "just pass one flag and it all works" design that was never on the table once the
  write side was fixed as a standalone script (`research/vitest-failure-reporter-surface.md`).
- The `::` key separator is a pragmatic, not collision-proof, choice (§1) — an adversarially-named
  Feature/Rule/Scenario could defeat it. Not defended against, and recorded here rather than silently
  assumed away, the same honesty `ScenarioKey.ts`'s own `\0` join already required of it.

**Trade-off accepted**: the Rule-level synthetic-node fix (§4) was added even though this ADR's own
verification did not observe the crash it guards against for a Rule alone (siblings elsewhere in the
same Feature keep the file's total test count non-zero) — a deliberate "cheap and precedented, so pay
it anyway" choice rather than proof the fix is strictly load-bearing on the installed vitest version;
a future vitest version tightening what counts as an empty suite would find this repo already covered
rather than newly exposed.
