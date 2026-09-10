# 20 — `GherkinJUnitReporter`: tags and attachments in JUnit XML

An optional vitest `Reporter` a consumer registers ALONGSIDE (never instead of) the default or
built-in `--reporter=junit` reporter, adding the two things vitest's own built-in JUnit reporter has
no configuration hook to add.

> **See:** [ADR-EC-060](../decisions/060-gherkinjunitreporter-adds-properties-and-system-out-vitests-built-in-junit-reporter-has-no-hook-for.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-034: `GherkinJUnitReporter` writes a real JUnit-XML file whose `<testcase>` carries a Scenario's tags as `<properties>` and `attach()`'s output as `<system-out>`

```
REQUIREMENT: `GherkinJUnitReporter` MUST implement vitest's own `Reporter`
             interface (`vitest/node`) and write its output ONLY from
             `onTestRunEnd`, reading exclusively vitest's own PUBLIC
             `TestModule`/`TestSuite`/`TestCase` API — never a private or
             internal vitest module, and never a new `EmitOptions`/
             `TestApi.ts` field, since `TestCase.tags` and
             `TestCase.annotations()` already carry a Scenario's tags and
             `attach()`'s output without any new seam.
```

```
REQUIREMENT: Every `TestCase` a `TestModule`'s `children.allTests()`
             yields MUST become one `<testcase>` element, carrying
             `classname` (the module's `relativeModuleId`) and `name`
             (the `TestCase`'s own `fullName` — the Feature/Rule/Scenario
             hierarchy vitest itself already joins with `>`, unchanged from
             what the built-in reporter already shows).
```

```
REQUIREMENT: A `<testcase>` whose `TestCase.tags` is non-empty MUST carry a
             `<properties>` child with one `<property name="tag"
             value="...">` per tag. A `<testcase>` with no tags MUST NOT
             carry an empty `<properties>` element.
```

```
REQUIREMENT: A `<testcase>` whose `TestCase.annotations()` is non-empty
             (i.e. at least one `attach()` call reached it, ADR-EC-036) MUST
             carry a `<system-out>` child rendering each annotation's
             `type` and `message` — regardless of whether the Scenario
             passed or failed, matching `attach()`'s own "accumulates
             across retry attempts, visible either way" contract.
```

```
REQUIREMENT: A `TestCase` whose `result().state` is `"failed"` MUST carry
             one `<failure>` element per error in `result().errors`, with
             the error's own `message` and `name` as the `message`/`type`
             attributes and its `stack` (falling back to `message`) as the
             element body — the real error, never a synthesized summary.
             A `TestCase` whose `result().state` is `"skipped"` MUST carry
             a `<skipped/>` element instead.
```

## Why this reporter exists at all — what it does NOT need to fix

Read this behavior alongside ADR-EC-060's own Context section before assuming a gap exists that this
reporter needs to close: vitest's own built-in `--reporter=junit` ALREADY produces a correct,
richly-detailed JUnit XML file today, with zero code from this package — real Feature/Scenario names
via vitest's own `describe`/`it` nesting, and full `.feature:line` failure detail via
`StepFailureLocation`/`HookFailureLocation` flowing into `<failure>` verbatim. `GherkinJUnitReporter`
exists ONLY for the two things that built-in reporter's own `JUnitOptions` type has no hook to add at
all: structured tags (`<properties>`) and `attach()`'s own output (`<system-out>`). A consumer who
needs neither of those two things can use `--reporter=junit` directly and needs this reporter not at
all.

### Where this is proven

| Level                                                                                                                                                                                                                                            | Artifact                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| A real `vitest run` against a real fixture (one passing `@smoke`-tagged, attaching Scenario; one deliberately failing one), reading the ACTUAL written file off disk — not a synthetic value, not an in-process call to the serializer functions | `packages/vitest/test/junit-reporter-fixture/` + `scripts/verify-junit-reporter.sh` |

### Signatures

```ts
// packages/vitest/src/JUnitReporter.ts
export interface GherkinJUnitReporterOptions {
  readonly outputFile?: string // default "junit.xml", resolved against process.cwd()
}
export class GherkinJUnitReporter implements Reporter {
  constructor(options?: GherkinJUnitReporterOptions)
}
```

### Worked example

```typescript
import { GherkinJUnitReporter } from "@effect-cucumber/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    reporters: ["default", new GherkinJUnitReporter({ outputFile: "reports/junit.xml" })]
  }
})
```

Every `vitest run` now also writes `reports/junit.xml`, with each Scenario's tags as `<properties>`
and any `attach()`ed evidence as `<system-out>` — ready for Allure, ReportPortal, Jenkins, GitLab, or
any other JUnit-XML-consuming tool, alongside whatever terminal reporter the consumer already uses.

---

_Previous: [19 — Concurrent Scenario execution and per-Scenario timeout](./19-concurrent-execution-and-scenario-timeout.md)_
