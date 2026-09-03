# Spike: `rerunFailedOnly` — a rerun-manifest mechanism for `describeFeature`

> Answers GitHub issue [#34](https://github.com/leaderiop/effect-cucumber/issues/34)
> (child of the wayfinder map, issue #11; downstream of the closed #24 ecosystem survey).

## Question

Issue #24 found cucumber-js, cucumber-jvm, and behave all ship a rerun-file mechanism
(run only the Scenarios that failed last time), and that vitest's own `--changed`
(git-diff-based) doesn't cover it — it needs genuinely new cross-run state: which
Scenario failed last run, keyed how, stored where. #34 asks to decide: does this
write a rerun-manifest file a consumer points a new option at, does it hook vitest's
own `--reporter=json` plus external tooling instead of new library code, or is this
better left to CI-level tooling entirely?

## Method

Built a WORKING throwaway prototype and ran it for real with `vitest run` — not
simulated, not unit-tested against a recording fake. Every claim below that says a
command "worked" or "warned" is backed by the actual terminal output pasted in
below it.

The prototype lives entirely under `packages/vitest/test/spike-rerun/`, as **copies**
of `Runner.ts` and `describeFeature.ts` (`Runner.rerun.ts`,
`describeFeature.rerun.ts`) plus two new modules (`RerunKey.ts`, `RerunManifest.ts`).
`main`'s real `packages/vitest/src/Runner.ts` and `describeFeature.ts` are
byte-for-byte untouched — `git diff main -- packages/vitest/src/` is empty on this
branch. This mirrors the convention `packages/vitest/test/spike-attachments/` already
set for the sibling issue #33 spike, rather than editing the real files in place.

Read first, as instructed: `packages/vitest/src/describeFeature.ts` (the
`includeTags`/`excludeTags` registration-time filter this extends),
`packages/vitest/src/Runner.ts`/`Plan.ts` (how a Scenario gets identity today), and
`packages/vitest/src/OutlineTitle.ts` (the per-row unique-titling this spike ended up
reusing). Also read `packages/gherkin/src/loadFeature.ts` and `Pickles.ts` to check
whether `ParsedScenario.id`/`Rule.id` are actually stable — they are not (see §1) —
and this repo's own prior research at
`research/vitest-failure-reporter-surface.md` (issue #17, on branch
`research/vitest-failure-reporter-surface`), which independently confirmed the fact
this spike's write-side design leans on: vitest's `task.meta` is JSON-reporter-only,
not read by the default terminal reporter.

---

## 1. Keying a Scenario: why `ScenarioKey.ts` doesn't work, and what does

`ScenarioKey.ts` already solves an *adjacent* identity problem — the
`scenarioLayers` map key, `(ruleId, astName)` — but it is NOT reusable here.
`ruleId` is the AST `Rule.id`, and `packages/gherkin/src/loadFeature.ts` builds a
**fresh `IdGenerator.uuid()` per `loadFeature()` call**:

```ts
// packages/gherkin/src/loadFeature.ts
const newId = IdGenerator.uuid()
const document = parseDocument(source, uri, newId)
const pickles = compilePickles(document, uri, newId)
```

That id generator produces a random UUID for every AST node — `Rule.id` included,
and so is `ParsedScenario.id` (the Pickle id, which `ScenarioPlan.scenarioId`
carries). Confirmed by reading, not assumed: two `loadFeature()` calls over the
identical bytes produce two different UUID sets. `ScenarioKey.ts`'s key only ever
needs to be stable **within one `collect()` call** (write and read happen in the same
process, same parse), so this was never a bug there — it just means it cannot key a
manifest that has to be read back on a **separate, later run**.

What IS stable across two parses of the same file: the Feature's `name`, each
`Rule`'s `name`, and the per-Scenario **title** `OutlineTitle.ts` already computes for
the emitted vitest test name — `scenario.name` plus the Outline row's
`(header=value, ...)` suffix plus the ` #2`/` #3` disambiguator for byte-identical
titles. That title depends only on the document's content and iteration order,
neither of which touches the id generator, so it reproduces identically run to run.
This spike's `RerunKey.ts` reuses `buildScenarioTitles` directly rather than
re-deriving Outline-row disambiguation:

```ts
// packages/vitest/test/spike-rerun/RerunKey.ts
export const rerunKey = (featureName: string, ruleName: string | null, title: string): string =>
  `${featureName}::${ruleName ?? ""}::${title}`

export const rerunKeysForPlan = (plan: FeaturePlan): ReadonlyMap<string, string> => {
  const titles = buildScenarioTitles(plan.feature)
  const ruleNameById = new Map<string, string>()
  for (const rule of plan.feature.rules) ruleNameById.set(rule.id, rule.name)

  const keys = new Map<string, string>()
  for (const scenarioPlan of plan.scenarios) {
    const ruleId = Option.getOrNull(scenarioPlan.ruleId)
    const ruleName = ruleId === null ? null : ruleNameById.get(ruleId) ?? null
    const title = titles.get(scenarioPlan.scenarioId) ?? scenarioPlan.name
    keys.set(scenarioPlan.scenarioId, rerunKey(plan.feature.name, ruleName, title))
  }
  return keys
}
```

`ruleNameById` exists only because `ScenarioPlan.ruleId` is still the (unstable)
AST id — used here purely as a same-run lookup key into `plan.feature.rules` to
recover the STABLE `rule.name`, never persisted or compared across runs itself.

**Known gap, not solved here** (see §5): the key does not include
`ParsedFeature.uri`. Two Feature *files* that happen to share a Feature `name`
would collide. See §5 for why and what fixing it would take.

---

## 2. The write side: vitest's own `--reporter=json`, no custom Reporter class

This repo's own prior research (`research/vitest-failure-reporter-surface.md`,
issue #17) already established, by reading `@vitest/runner`'s actual shipped
source, that `task.meta` is serialized by the **JSON reporter only** — not read by
`DefaultReporter`/`BaseReporter`'s terminal failure panel at all. That finding
directly shaped this spike's choice: rather than writing a custom `Reporter` class
against an API surface that differs across vitest majors, the write side is a
standalone Node script that runs vitest with `--reporter=json --outputFile=<path>`
and post-processes that file — `scripts/spike-write-rerun-manifest.mjs`:

```js
const rerunKey = (featureName, ruleName, title) => `${featureName}::${ruleName ?? ""}::${title}`

const failedKeys = new Set()
for (const testFile of report.testResults ?? []) {
  for (const assertion of testFile.assertionResults ?? []) {
    if (assertion.status !== "failed") continue
    const [featureName, ruleName] = assertion.ancestorTitles
    failedKeys.add(rerunKey(featureName, ruleName ?? null, assertion.title))
  }
}
```

`assertionResults[].ancestorTitles` is exactly `[featureName]` for a Feature-level
Scenario or `[featureName, ruleName]` for one nested in a `Rule(...)` — matching
`Runner.ts`'s `api.describe` nesting exactly, and `.title` is the same
`buildScenarioTitles` output `RerunKey.ts` uses on the read side. The manifest
REPLACES its previous contents each run (this run's failures are the new truth,
same as cucumber-js's/behave's rerun-file semantics — not an accumulating history).

---

## 3. The read side: `rerunFailedOnly` on `DescribeFeatureOptions`

Added to `DescribeFeatureOptions` (spike copy) exactly where `includeTags`/
`excludeTags` live:

```ts
export interface DescribeFeatureOptions {
  readonly includeTags?: ReadonlyArray<string>
  readonly excludeTags?: ReadonlyArray<string>
  readonly rerunFailedOnly?: boolean
  readonly rerunManifestPath?: string   // default: ".rerun-manifest.json"
}
```

`describeFeature.rerun.ts` reads the manifest (or gets `null` — see §5.1),
computes each Scenario's rerun key via `rerunKeysForPlan`, and threads a
`rerunFilter: ReadonlySet<string> | null` into `emitFeature` alongside the existing
`tagFilter` — literally the same shape, one more field. `Runner.rerun.ts` checks it
**after** the tag filter, in both the Feature-level loop and the Rule loop (the same
two places `shouldEmit(tagFilter, ...)` already runs), and counts exclusions
separately (`rerunExcludedScenarioCount`) so the existing includeTags/excludeTags
console notice doesn't fire for the wrong reason:

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

This is deliberately the *same mechanism*, not a parallel one: one more filter
predicate checked in the same two loops that already decide whether a Scenario is
registered, at the same registration-time point `includeTags`/`excludeTags` act at.

---

## 4. End-to-end, for real

Demo Feature, `packages/vitest/test/spike-rerun/rerun-demo.feature` — 3 Scenarios,
one (`Scenario B fails`) rigged to fail whenever `SPIKE_RERUN_FAIL=1` (unset by
default, so this file is inert under a plain `pnpm test` — confirmed: `pnpm test`
on this branch is 44 files / 901 passed, up from main's 43/898, all green). Each
Scenario's first step logs its own label to a file named by `SPIKE_RERUN_EXEC_LOG`,
so registration/execution can be checked directly rather than inferred from
pass/fail counts alone.

**Run 1 — full run, no `rerunFailedOnly`, B fails:**

```
$ SPIKE_RERUN_FAIL=1 SPIKE_RERUN_EXEC_LOG=.../exec-log-1.txt \
  vitest run packages/vitest/test/spike-rerun/rerun-demo.spike.test.ts \
  --reporter=json --outputFile=.../report-1.json

JSON report written to .../report-1.json
exit: 1

$ cat exec-log-1.txt
A
B
C
```

All 3 registered and ran; exit 1 confirms B failed.

**Write the manifest from that report:**

```
$ node scripts/spike-write-rerun-manifest.mjs report-1.json rerun-manifest.json
wrote 1 failed key(s) to rerun-manifest.json:
  Rerun failed only spike::::Scenario B fails

$ cat rerun-manifest.json
{ "failed": ["Rerun failed only spike::::Scenario B fails"] }
```

**Run 2 — `rerunFailedOnly` against that manifest, B still rigged to fail:**

```
$ SPIKE_RERUN_FAIL=1 SPIKE_RERUN_ENABLE=1 SPIKE_RERUN_MANIFEST=.../rerun-manifest.json \
  SPIKE_RERUN_EXEC_LOG=.../exec-log-2.txt \
  vitest run packages/vitest/test/spike-rerun/rerun-demo.spike.test.ts --no-coverage

stderr | rerun-demo.spike.test.ts
rerunFailedOnly: 2 Scenario(s) in Feature "Rerun failed only spike" were not
registered because their rerun-manifest key was not among the previously-failed keys.

 ❯ rerun-demo.spike.test.ts (1 test | 1 failed) 6ms
     × Scenario B fails 5ms

exit: 1

$ cat exec-log-2.txt
B
```

**This is the proof**: registration itself was filtered to exactly the one
previously-failed Scenario — not "run all 3, skip 2," but "register 1." `A` and `C`
never even ran their `Given` step. The exclusion notice correctly attributes the
2 exclusions to `rerunFailedOnly`, and no stale-key warning fired (the one manifest
key matched a real Scenario).

---

## 5. Rough edges, found by actually running it

### 5.1 First run, no manifest file yet — does NOT error

```
$ SPIKE_RERUN_FAIL=1 SPIKE_RERUN_ENABLE=1 SPIKE_RERUN_MANIFEST=.../no-such-manifest.json \
  vitest run packages/vitest/test/spike-rerun/rerun-demo.spike.test.ts --no-coverage
...
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)

$ cat exec-log.txt
A
B
C
```

`RerunManifest.ts`'s `readRerunManifest` folds "file absent" and "file present but
unparseable JSON" into the same `null` return, which `describeFeature.rerun.ts`
treats identically to the option never having been passed: no filter, run
everything, no crash. This was a deliberate design choice (not an accident found
after the fact), but it's confirmed correct by actually running it against a path
that does not exist.

### 5.2 A stale manifest key — warns, as designed, BUT can starve a whole test file

Pointing `rerunFailedOnly` at a manifest whose one key matches no Scenario in this
Feature (renamed, wrong Feature, or the Feature itself changed):

```
$ SPIKE_RERUN_FAIL=1 SPIKE_RERUN_ENABLE=1 SPIKE_RERUN_MANIFEST=.../stale-manifest.json \
  vitest run packages/vitest/test/spike-rerun/rerun-demo.spike.test.ts --no-coverage

stderr | rerun-demo.spike.test.ts
rerunFailedOnly: the manifest references a Scenario key this Feature
("Rerun failed only spike", .../rerun-demo.feature) has no match for:
"Rerun failed only spike::::Scenario Z does not exist". It may belong to a
different Feature, or the Scenario may have been renamed, moved to a different
Rule, or deleted since the manifest was written.

stderr | rerun-demo.spike.test.ts
rerunFailedOnly: 3 Scenario(s) in Feature "Rerun failed only spike" were not
registered because their rerun-manifest key was not among the previously-failed keys.

 ❯ rerun-demo.spike.test.ts (0 test) 1ms
 FAIL  rerun-demo.spike.test.ts
Error: No test found in suite packages/vitest/test/spike-rerun/rerun-demo.spike.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

The warning fires exactly as intended — mirroring `Plan.ts`'s
`UnusedStepDefinitionWarning` posture (warn, don't error, on a thing that doesn't
match). But the *consequence*, found only by actually running it: when a rerun
filter excludes **every** Scenario in a Feature, that Feature's `describe` block
ends up with zero children, and — because this demo file has no unused-step
warnings to keep it non-empty (the way `Runner.ts`'s own `plan.warnings` nodes do
for an all-tag-excluded Feature) — the whole test FILE trips vitest's own
`"No test found in suite"` error. A rerun-manifest whose relevant keys are all
stale for one file doesn't read as "nothing needed rerunning here" — it reads as a
broken test file, which is a worse failure mode than the thing `rerunFailedOnly`
was trying to avoid.

**Two fixes considered, neither built here:**
- Emit one synthetic informational skipped node when the rerun filter would
  otherwise leave a Feature block with zero children — the same shape `Runner.ts`
  already uses for unused-step-definition warnings, so it is a small, precedented
  change, not a new mechanism.
- Fall back to "run everything" for a Feature whose intersection with the manifest
  is empty, rather than "run nothing." Rejected as the default: it silently
  defeats the entire feature for a genuinely-fixed Feature (no Scenario in it
  failed last time, so its manifest intersection is legitimately empty) — that
  Feature would re-run in full every time, exactly the cost `rerunFailedOnly`
  exists to avoid.

  My recommendation is the first option.

### 5.3 The key's missing `uri` is a real, not hypothetical, gap

`RerunKey.ts`'s key is `featureName::ruleName::title` — no file path. Two
different `.feature` files sharing a Feature `name` collide. This isn't just a
theoretical gap: the write side (§2) reads `ancestorTitles`/`title` off vitest's
JSON reporter, which reports the **vitest test file**, not the `.feature` file —
and nothing in the emitted test hierarchy currently carries `ParsedFeature.uri`
anywhere a reporter could recover it from.

Checked concretely whether `EmitOptions` (`TestApi.ts`, the framework-agnostic
seam `Runner.ts`/`VitestTestApi.ts` cross) could carry the `uri` through as vitest
task `meta` — it presently cannot: `EmitOptions` is `{ tags, skip, contextFree }`
only, no `meta` field, and `VitestTestApi.ts` never reaches vitest's `TestContext`
to set one. Adding it would need a small `TestApi.ts`/`VitestTestApi.ts` seam
widening — the same shape of change the sibling issue #33 attachments spike
already found necessary to reach vitest's `TestContext` for a different reason
(`Scope.Scope | Attachments`). Since `task.meta` is JSON-reporter-only anyway
(§2), this would cost a seam change for a benefit only the manifest-writer script
needs — the simpler alternative is embedding `uri` (or a hash of it) directly in
the outer `describe` title, which needs no seam change but does change what a
developer sees in the terminal. Neither was built here; both are real options a
production implementation should weigh.

---

## Recommendation

**Build it as a rerun-manifest file a new `describeFeature` option points at** —
issue #34's first option, confirmed viable end to end by this spike, not the
`--reporter=json`-only or CI-tooling-only alternatives:

- The read side extends the exact registration-time filtering
  `includeTags`/`excludeTags` already do (§3) — proven, not just designed, by a
  real `vitest run` registering exactly 1 of 3 Scenarios (§4).
- The write side should stay a small external script/CLI over vitest's own
  `--reporter=json`, not a custom `Reporter` class — `research/vitest-failure-
  reporter-surface.md`'s finding that `task.meta` (the only reporter-agnostic
  attachment point) is JSON-reporter-only already settles that choice; a custom
  `Reporter` class would only add API-surface risk across vitest majors for no
  extra capability.
- Before shipping: fix §5.2 (a stale-everywhere manifest must not turn into a
  file-level "no tests found" error — the synthetic-skip-node fix is small and
  precedented) and decide §5.3's `uri` gap deliberately (embed it in the `describe`
  title is the lower-cost fix; a `meta`-based seam widening is the higher-fidelity
  one). Neither blocks the mechanism working — both are pre-existing rough edges
  a real implementation should close, not reasons to reconsider the direction.

## Branch and files

Branch: `spike/rerun-failed-only` (off `main`, throwaway — see the branch's own
commit for whether it pushed).

- `packages/vitest/test/spike-rerun/RerunKey.ts` — the stable key (§1).
- `packages/vitest/test/spike-rerun/RerunManifest.ts` — manifest read/write.
- `packages/vitest/test/spike-rerun/Runner.rerun.ts` — copy of `Runner.ts` + the
  rerun filter (diff it against `packages/vitest/src/Runner.ts` to see the exact
  addition — every changed line is tagged `SPIKE (issue #34)`).
- `packages/vitest/test/spike-rerun/describeFeature.rerun.ts` — copy of
  `describeFeature.ts` + the option (same diff convention).
- `packages/vitest/test/spike-rerun/rerun-demo.feature` /
  `rerun-demo.spike.test.ts` — the real Feature and step definitions §4 ran.
- `scripts/spike-write-rerun-manifest.mjs` — the write-side script (§2).

`main`'s real `packages/vitest/src/Runner.ts` and `describeFeature.ts` are
untouched by this branch.
