# ADR-EC-060: `GherkinJUnitReporter` — a custom Reporter adding `<properties>` (tags) and `<system-out>` (attachments) that vitest's own built-in `--reporter=junit` has no configuration hook to add

> **Status:** Accepted and implemented — `packages/vitest/src/JUnitReporter.ts`, `packages/vitest/src/index.ts`, `packages/vitest/test/junit-reporter-fixture/`, `scripts/verify-junit-reporter.sh`
> **Date:** 2026-09-10
> **Context:** an independent audit flagged "Attachments/reporting richness — `attach()` exists but no Allure/ReportPortal/LivingDoc-class integration"

## Context

The audit's premise — treated as a claim to verify, not a fact — was checked directly against a real
`vitest run`, not assumed:

**Finding 1 — vitest's own built-in `--reporter=junit` already works, today, with zero code from this
package.** `describeFeature` already registers a real `describe(Feature.name)` → `it(Scenario.title)`
hierarchy (`Runner.ts`'s `emitFeature`), so `vitest run --reporter=junit` already emits
`<testcase name="Feature name > Scenario title">` per Scenario. `.feature:line` failure detail
(`StepFailureLocation`/`HookFailureLocation`, ADR-EC-033/ADR-EC-052) already flows into its
`<failure>` message verbatim — confirmed by running the built-in reporter against this repo's own
`failure-panel-fixture`. JUnit XML is exactly the format Allure, ReportPortal, Jenkins, GitLab and
most CI dashboards already ingest natively. The audit's claim was materially overstated: most of "no
reporting ecosystem integration" was already false.

**Finding 2 — two things genuinely have no path into the built-in reporter's output.** vitest's own
`JUnitOptions` type (`vitest/node`) exposes only name-template strings
(`classnameTemplate`/`titleTemplate`/`suiteNameTemplate`) — no hook to inject arbitrary per-test
metadata. So: (a) a Scenario's tags never appear as structured data, only as prose inside whatever a
`classnameTemplate` string composes; (b) `attach()`'s own output (ADR-EC-036) never appears at all —
the built-in JUnit reporter reads neither `task.meta` nor `TestCase.annotations()`.

**Finding 3 — neither gap needs a new seam.** Both `TestCase.tags` and `TestCase.annotations()` are
already part of vitest's OWN public `Reporter`/`TestCase` API (`vitest/node`), already populated:
`tags` because `Runner.ts` already passes `{ tags }` to `it.effect`, `annotations()` because
`attach()`'s live implementation (`VitestTestApi.ts`'s `attachmentsLive`) already calls
`ctx.annotate`. No `EmitOptions`/`TestApi.ts` change was needed or made — a fix here is purely
additive: a reporter reading what already crosses vitest's own public surface.

## Decision

**Ship `GherkinJUnitReporter`, a new public export implementing vitest's `Reporter` interface,
producing real JUnit XML with `<properties>` (tags) and `<system-out>` (attachments) added on top of
the standard `<testsuite>`/`<testcase>`/`<failure>` shape — additive to, never a replacement for,
vitest's own built-in `--reporter=junit`.**

A consumer adds it alongside the default reporter in their own `vitest.config.ts`:

```ts
import { GherkinJUnitReporter } from "@effect-cucumber/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { reporters: ["default", new GherkinJUnitReporter({ outputFile: "junit.xml" })] }
})
```

### Why a whole reporter, not extending the built-in one

Vitest's built-in `JUnitReporter` class is not designed for extension — `JUnitOptions` has no
metadata-injection hook, and its internal serialization is not part of vitest's public API surface.
Re-implementing the (small, well-defined) JUnit-XML shape directly, walking the SAME public
`TestModule`/`TestSuite`/`TestCase` API any third-party reporter author would use, is simpler and
more robust than attempting to monkey-patch or wrap an internal implementation.

### Why JUnit XML, not Cucumber-messages/Cucumber-JSON

`@cucumber/messages` is already a dependency of `packages/gherkin` — but only on the PARSING side
(`GherkinDocument`, `Pickle`, etc.); this repository has never produced its OUTPUT envelope format
(`Envelope`, `TestStepFinished`, `TestRunFinished`). JUnit XML was chosen for this first reporter
because it is the format the audit's own named tools (Allure, ReportPortal) and most CI dashboards
already consume without any plugin, whereas Cucumber-messages output requires the CONSUMING tool to
support that specific format. Cucumber-messages output remains a credible FUTURE option, not ruled
out — revisit if a consumer specifically needs Cucumber-native tooling (e.g. a LivingDoc generator)
that JUnit XML cannot serve.

### `outputFile` resolves against `process.cwd()`, not the vitest config's `root`

Matches vitest's own built-in reporters' `outputFile` convention exactly (verified: neither reads
`root` for this). Documented in `GherkinJUnitReporterOptions`'s own JSDoc — a relative path resolves
wherever the run is invoked FROM, not beside the config file; pass an absolute path to pin the
location.

## Consequences

**Positive**:

- Closes the audit's flagged gap for the two things genuinely missing, without duplicating what
  vitest's own built-in reporter already does well.
- No new seam: builds entirely on vitest's own public `Reporter`/`TestCase` API, so a future vitest
  major that changes internal task-collection plumbing (as vitest 5 itself did, ADR-EC-059) does not
  threaten this reporter the way it would have threatened code reaching into `@vitest/runner`
  internals directly.
- Verified against a REAL `vitest run` and the ACTUAL written file (`scripts/verify-junit-reporter.sh`,
  a fixture with one passing `@smoke`-tagged, attaching Scenario and one deliberately failing one) —
  not merely unit-tested serializer functions.

**Negative**:

- A second JUnit-XML writer alongside vitest's own built-in one is a real, if small, duplication —
  accepted because the built-in one cannot be extended to add what this one adds.
- Does not (yet) address Cucumber-native tooling (a LivingDoc-class report) — deferred, not ruled
  out, per the "why JUnit XML" note above.
