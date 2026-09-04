# 17 — Rerun failed Scenarios only

Registration-time filtering that runs only the Scenarios a prior run's manifest names as failed,
keyed by something stable ACROSS separate `loadFeature()` invocations.

> **See:** [ADR-EC-038](../decisions/038-rerun-failed-only-uri-scoped-key-stamped-via-task-meta-not-a-reporter.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-030: `rerunFailedOnly`/`rerunManifestPath` filter Scenario registration against a `(uri, ruleName, title)` key, degrading gracefully when there is nothing to filter against

```
REQUIREMENT: A Scenario's rerun key MUST be computed as
             `${uri}::${ruleName ?? ""}::${title}`, where `uri` is
             `ParsedFeature.uri` (the .feature file's own path/identifier,
             FIRST in the key), `ruleName` is the enclosing Rule's `.name` —
             never its `.id` — or `null` for a Feature-level Scenario, and
             `title` is the Scenario's own EMITTED title
             (`OutlineTitle.ts`'s `buildScenarioTitles` output: an Outline
             row's already-disambiguated title, not its un-interpolated
             `astName`). This key MUST NOT be `ScenarioKey.ts`'s
             `(ruleId, astName)` key: that key's `ruleId` (and
             `ParsedScenario.id`) are produced by a fresh `IdGenerator.uuid()`
             on every `loadFeature()`/`parseFeature()` call, so a value built
             from it is a different random string on every run and can never
             be looked up against a manifest an EARLIER, separate run wrote.
             `uri` MUST be the first component (not appended), so that a
             stale-key prefix check (`startsWith(uri + "::")`) is a plain
             string operation, and so that two `.feature` files sharing a
             Feature name never produce colliding keys.
```

```
REQUIREMENT: `describeFeature`'s optional fourth argument MUST accept
             `rerunFailedOnly?: boolean` and `rerunManifestPath?: string`.
             When `rerunFailedOnly` is not exactly `true`, `rerunManifestPath`
             MUST NOT be read at all — not even a `readFileSync` call — the
             same "absent costs nothing" shape `includeTags`/`excludeTags`
             already have. When `rerunFailedOnly` is `true`, the manifest at
             `rerunManifestPath` (defaulting to `RerunManifest.ts`'s
             `defaultRerunManifestPath`) MUST be read SYNCHRONOUSLY, because
             `describeFeature` runs at vitest collection/config-load time,
             which is synchronous end to end. The resulting filter is applied
             AT REGISTRATION TIME: an excluded Scenario MUST NOT be emitted
             as a test node at all — not emitted and skipped, not emitted and
             degraded — the same registration-time exclusion
             `includeTags`/`excludeTags` already perform, and applied AFTER
             that tag filter, over whatever the tag filter left standing.
```

```
REQUIREMENT: A manifest file that does not exist yet MUST degrade to "no
             filter" (every Scenario registers normally) with NO warning
             printed — this is the ordinary, expected state of a repository
             that has never run a failing suite before, not an error
             condition. A manifest file that exists but fails to parse as
             JSON, or parses but does not match `{ "failed": string[] }`,
             MUST also degrade to "no filter", but in THESE two cases MUST
             print exactly one `console.warn` naming the reason
             (`MalformedRerunManifest`). No case of `rerunFailedOnly` degrading
             to "no filter" may fail the Feature or throw.
```

```
REQUIREMENT: A Feature or a Rule left with ZERO emitted Scenarios purely
             because the rerun filter excluded every one of its Scenarios
             MUST emit exactly ONE synthetic node in place of the empty
             block, rather than leaving the block with no children at all.
             An empty `describe` block trips vitest's own "no test found in
             suite" failure — worse than what `rerunFailedOnly` exists to
             avoid, and the roadmap entry this behavior implements names this
             as a MANDATORY fix, not deferrable polish. The synthetic node
             MUST be `skip: true` (it never runs a body), MUST be
             `contextFree: true` (it must never force the shared Layer tier
             to build), and MUST NOT fire for a block that is empty for any
             OTHER reason (e.g. every Scenario tag-filtered out, with the
             rerun filter excluding nothing) — only when the rerun filter is
             genuinely the reason nothing survived. This applies
             independently at BOTH scopes: once per Feature (covering every
             Scenario the Feature's plan names, Feature-level or nested in
             any Rule) and once per Rule (scoped to that Rule's own nested
             block).
```

```
REQUIREMENT: A rerun manifest naming a key, under a given Feature's own
             `uri` prefix, that matches no Scenario `RerunKey.ts`'s
             `rerunKeysForPlan` computes for the CURRENT parse of that
             `.feature` file (a Scenario renamed, removed, or the manifest
             from a different revision of the file) MUST print exactly one
             `console.warn` naming every such stale key for that Feature —
             it MUST NOT be silently ignored, and it MUST NOT fail the
             Feature either. A manifest key that simply does not cover a
             Scenario that PASSED last run is the ordinary, unremarkable
             case and MUST NOT print anything.
```

### Why a template script, not a shipped `bin`/`Reporter`

The write side — converting a prior `vitest run --reporter=json` report into a manifest — ships as
`scripts/templates/write-rerun-manifest.mjs`, a documented copy-paste template (README.md's "Rerun
failed Scenarios only" recipe), never a package export, a `bin` entry, or a custom vitest `Reporter`
class. Two independent reasons, both already established for unrelated purposes before this feature
needed them. First, `research/vitest-failure-reporter-surface.md` found that `vitest@4.1.11`'s
`JsonReporter` is the ONLY reporter that serialises `task.meta` verbatim — so a script reading nothing
but `--reporter=json` output needs no custom `Reporter` class to exist at all; there would be nothing
a custom `Reporter` could do that reading the JSON report cannot. Second, LINT-01
(`scripts/templates/verify-consumer-ref-state.sh`) already established the precedent that this
package ships zero tooling that runs automatically against a CONSUMER's own repository — only
copy-paste templates and documented recipes. A consumer wires
`scripts/templates/write-rerun-manifest.mjs` into their own CI themselves; nothing in this package
does it for them.

### The manifest format

```json
{ "failed": ["<rerunKey>", "<rerunKey>", "..."] }
```

Every run of the write-side script REPLACES the manifest's contents — it does not accumulate history
across runs — the same semantics cucumber-js's and behave's own rerun files already use, and the only
sane semantics for a file meant to answer "what failed LAST time," not "what has ever failed." The
script reads each failed assertion's `meta.rerunKey` directly off the `--reporter=json` report (the
exact string `RerunKey.ts`/`Runner.ts` computed once, at the single source of truth, and stamped onto
`ctx.task.meta.rerunKey` inside `VitestTestApi.ts` — BEFORE the Scenario's own Effect runs, so it
survives a failing Scenario) — never reconstructing it from `ancestorTitles`/`title`, which would
duplicate the read side's own join logic and risk the two silently drifting apart.

### Where this is proven

| Level                                                                                                                                                             | Artifact                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pure key derivation, including the two-separate-parses stability claim (INV-EC-009) and the same-Feature-name-different-uri non-collision claim (rough edge 2)    | `packages/vitest/test/RerunKey.test.ts`                                                                                                          |
| Manifest read: missing file, malformed JSON, wrong shape, a real valid file                                                                                       | `packages/vitest/test/RerunManifest.test.ts`                                                                                                     |
| Registration-time filter composing after the tag filter, `EmitOptions.rerunKey` stamping, `rerunExcludedScenarioCount`, and both synthetic-node firing conditions | `packages/vitest/test/Runner.test.ts`'s rerun-filter describe block, driven through the same recording-fake `TestApi` the rest of that file uses |
| A real `describeFeature` run against a hand-authored fixed manifest, proving a filtered-out Scenario's steps never execute at all                                 | `packages/vitest/test/acceptance/rerun-failed-only.feature` + `.steps.test.ts` (`@REQ-EC-030`)                                                   |
| The full write→read cycle, across two REAL `vitest run` invocations, including both rough-edge fixes and the stale-key warning                                    | `scripts/verify-rerun-failed-only.sh`, against `packages/vitest/test/rerun-fixture/`                                                             |

### Signatures

```ts
// packages/vitest/src/RerunKey.ts
export const rerunKey: (uri: string, ruleName: string | null, title: string) => string
export const rerunKeysForPlan: (plan: FeaturePlan) => ReadonlyMap<string, string>

// packages/vitest/src/RerunManifest.ts
export const defaultRerunManifestPath: string // ".effect-cucumber/rerun-manifest.json"
export const readRerunManifest: (path: string) => ReadonlySet<string> | null

// packages/vitest/src/describeFeature.ts
export interface DescribeFeatureOptions {
  readonly includeTags?: ReadonlyArray<string>
  readonly excludeTags?: ReadonlyArray<string>
  readonly rerunFailedOnly?: boolean
  readonly rerunManifestPath?: string
}
```

### Worked example

```typescript
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"

const feature = await loadFeature(fileURLToPath(new URL("./checkout.feature", import.meta.url)))

describeFeature(feature, Layer.empty, ({ Then, When }) => {
  When("I check out", function*() {
    yield* Effect.void
  })
  Then("the order is placed", function*() {
    yield* Effect.void
  })
}, {
  rerunFailedOnly: true,
  rerunManifestPath: ".effect-cucumber/rerun-manifest.json"
})
```

With no manifest present yet (the first run), `rerunFailedOnly: true` costs nothing beyond the one
`readFileSync` attempt and degrades to "run everything." After a run with a failure, a consumer's own
`test:record-failures` script (`vitest run --reporter=json --outputFile=...` followed by
`node scripts/write-rerun-manifest.mjs`, copied from `scripts/templates/write-rerun-manifest.mjs`)
produces `.effect-cucumber/rerun-manifest.json`; the NEXT run with `rerunFailedOnly: true` registers
only the Scenario(s) that manifest names as failed, regardless of whether this `describeFeature` call
happens to be the same process, a later one, or a `loadFeature()` re-parse of the identical file
(INV-EC-009).

---

_Previous: [16 — Effect.Metric at the Scenario emission boundary](./16-scenario-metrics.md)_
