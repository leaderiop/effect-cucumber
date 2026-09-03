# Research: Cucumber ecosystem feature survey — what comparable frameworks have that effect-cucumber doesn't

> Resolves GitHub issue [#24](https://github.com/leaderiop/effect-cucumber/issues/24)
> (part of the wayfinder map, issue [#11](https://github.com/leaderiop/effect-cucumber/issues/11)).

## Method

Five frameworks surveyed against seven specific questions: **cucumber-js**,
**cucumber-jvm** (Java), **behave** (Python), **SpecFlow** (.NET), and
**jest-cucumber**. Every finding below is grounded in an official docs page or
source file — GitHub `docs/` folders, `readthedocs.io`, `docs.specflow.org`,
`vitest.dev` — not blog posts or secondary write-ups; each row below carries
its own citation.

Before any external research, this library's own `spec/overview.md`,
`spec/glossary.md`, every `spec/behaviors/*.md`, and every `spec/decisions/*.md`
ADR were read in full, plus `packages/gherkin/src/Snippet.ts`,
`packages/vitest/src/{Tags,GherkinTags,describeFeature,Dsl,ScenarioEffect,VitestTestApi}.ts`,
`packages/vitest/README.md`, and `research/vitest-failure-reporter-surface.md`
(branch `research/vitest-failure-reporter-surface`) — so a finding already
built, or already a deliberately rejected decision in `spec/roadmap.md`'s
§ Explicitly not planned (a bespoke parser, a bespoke matcher, a third Layer
scope, a custom report format), is called out as such rather than re-proposed.

Each section below states the question, a per-framework table (finding +
citation), a verdict (**real gap** / **false positive** — already covered
under a different name — / **considered rejection** — already decided against
on purpose), and whether closing the gap fits Effect's model or would import
an anti-pattern this codebase's ADRs already reject.

---

## 1. Global (suite-wide, not per-Feature) `BeforeAll`/`AfterAll` hooks

This library's `BeforeAllScenarios`/`AfterAllScenarios` are Feature-scoped
only — a once-cell per Feature block, confirmed by
[`spec/behaviors/07-hook-ordering-and-guarantees.md`](../spec/behaviors/07-hook-ordering-and-guarantees.md)'s
BEH-EC-017 and `packages/vitest/README.md`. Nothing runs once for the whole
suite.

| Framework | Finding | Citation |
|---|---|---|
| cucumber-js | Has `BeforeAll`/`AfterAll` — run once for the whole test run, not per Feature file. Under `--parallel`, each **worker process** gets its own run by default (not one global run); `{on: HookTarget.COORDINATOR}` forces a single run on the coordinator process instead. Hook bodies don't receive a `World` instance — only `this.parameters`. | [`docs/support_files/hooks.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/hooks.md) |
| cucumber-jvm | `@BeforeAll`/`@AfterAll` — static methods, no args, run "before all scenarios are executed and after all scenarios have been executed" (JVM-process scope, not per-Feature). Requires Maven Surefire/Failsafe ≥3.0.0-M5 for correct ordering; a Kotlin companion-object placement throws `InvalidMethodSignatureException`. | [`cucumber-java/README.md`](https://github.com/cucumber/cucumber-jvm/blob/main/cucumber-java/README.md) |
| behave | `before_all(context)`/`after_all(context)` in `environment.py` — documented as running "before and after the whole shooting match." Single process, no worker ambiguity documented — the cleanest true-global example of the five. | [`docs/api.rst`](https://behave.readthedocs.io/en/latest/api/) |
| SpecFlow | `[BeforeTestRun]`/`[AfterTestRun]` — static methods, run once above the Feature level. Under SpecFlow+ Runner's parallel execution, they run once **per thread/AppDomain/process**, not once globally — the same per-worker caveat as cucumber-js. | [`docs.specflow.org` — Bindings/Hooks](https://docs.specflow.org/projects/specflow/en/latest/Bindings/Hooks.html) |
| jest-cucumber | No library-specific concept. Defers entirely to Jest's own `beforeAll`/`afterAll`, which are per-test-**file** in Jest, not suite-wide. | [`bencompton/jest-cucumber` README](https://github.com/bencompton/jest-cucumber) |

**Verdict: real gap.** Four of five frameworks with a real BDD identity ship
a genuinely suite-wide hook; this library's own once-per-Feature scope is a
narrower guarantee than what "Cucumber" usually promises.

**But every implementation that has it hits the same isolation problem a
suite-wide hook in this library would.** cucumber-js and SpecFlow both
document that under parallel execution "global" quietly degrades to "once per
worker/thread" unless the framework adds a dedicated escape hatch
(cucumber-js's `HookTarget.COORDINATOR`) — exactly the kind of ordering
footgun `BeforeAllScenarios`'s own once-cell design already documents
explicit caveats for at Feature scope (see BEH-EC-017's "Concurrent
sequencing is UNSUPPORTED" clause). Extending "once per Feature" to "once per
run" multiplies that same caveat across every Feature file in a suite, not a
small addition.

**Effect fit.** A suite-wide hook cannot be registered through the per-Feature
`describeFeature` dsl object the way the other six hooks are (DSL-04's
prohibition on a module-level registry is specifically about *step*
registration; a new top-level export for this is a different, deliberate
design question, not a violation of an existing rule as written) — it would
need its own entry point, most naturally a Layer-aware wrapper around vitest's
own `globalSetup`/`globalTeardown` (`vitest.config.ts`'s `test.globalSetup`),
which already gives a consumer a real "run once before/after the whole run"
hook *today*, with no framework support needed, just without Effect typing or
declared-Layer access. Building a first-class Effect version is a real,
non-trivial feature (worth its own design ticket, not a small addition here)
— and the ergonomics gap it would close is narrower than it first looks,
since `globalSetup` already structurally covers the "once before/after
everything" need for a consumer willing to write it by hand.

---

## 2. Boolean tag EXPRESSIONS (`@fast and not @slow`, parenthesized AND/OR/NOT)

This library's `includeTags`/`excludeTags` on `describeFeature`'s optional
fourth argument are a plain array of tag strings — a registration-time filter
(ADR-EC-026), deliberately never the boolean grammar (BEH-EC-008's own
REQUIREMENT text: "Both MUST accept a plain array of tag strings, never
vitest's boolean tag-expression grammar").

| Framework | Supports and/or/not/parens? | Citation |
|---|---|---|
| cucumber-js | **Yes** — `--tags`/`-t`, full grammar. | [`docs/configuration.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md), [`docs/filtering.md#tags`](https://github.com/cucumber/cucumber-js/blob/main/docs/filtering.md#tags) |
| cucumber-jvm | **Yes** — identical grammar (`"@smoke and not @slow"`, `"(@smoke or @ui) and (not @slow)"`), via `-Dcucumber.filter.tags`, `CUCUMBER_FILTER_TAGS`, or `@CucumberOptions(tags=...)`. | [cucumber.io/docs/cucumber/api (Java)](https://cucumber.io/docs/cucumber/api/?lang=java) |
| behave | **Yes**, but versioned: "Tag-Expressions v2" (and/or/not/parens/wildcards) is current; the older comma+dash syntax ("v1", commas = OR, `-@foo` = NOT) is deprecated and slated for removal in behave 1.4.0. | [`docs/tag_expressions`](https://behave.readthedocs.io/en/latest/tag_expressions/) |
| SpecFlow | Tags map to the underlying xUnit/NUnit `Category`/`Trait` and are filtered via that runner's own filter syntax, not a native Cucumber tag-expression grammar (unconfirmed to the same primary-source depth as the other four — flagged rather than asserted). | — |
| jest-cucumber | No tag-expression concept found; it doesn't implement Gherkin tag filtering as a first-class feature. | [`bencompton/jest-cucumber` README](https://github.com/bencompton/jest-cucumber) |

The shared grammar itself, per the [`cucumber/tag-expressions`](https://github.com/cucumber/tag-expressions)
spec: `and`, `or`, `not`, parentheses for grouping, backslash-escaping for a
literal `(`/`)`/whitespace in a tag name — implemented as parallel packages
across Java/JS/Python/Ruby/Go/PHP/Perl/.NET.

**vitest's own `--tagsFilter` already has the identical grammar.** Per
[vitest.dev/guide/test-tags](https://vitest.dev/guide/test-tags.html):
operators `and`/`&&`, `or`/`||`, `not`/`!`, a `*` wildcard, and `()` for
grouping, with stated precedence `not` > `and` > `or` — e.g.
`"(unit || e2e) && !slow"`.

**Verdict: false positive — already covered under a different name.** ADR-EC-026
emits every Gherkin tag (including inherited Feature/Rule/Examples tags) as a
real native vitest tag. That means vitest's own `--tagsFilter` already gives a
consumer the full Cucumber tag-expression grammar over those exact tags —
under a CLI flag rather than a `describeFeature` argument. This library's
`includeTags`/`excludeTags` are solving a genuinely different problem
(registration-time removal from the report, not CLI-time boolean selection —
BEH-EC-008 states the two "COMPOSE, and neither replaces the other"), so its
staying array-only is not a missing capability, just a narrower one than "all
of Cucumber tag filtering" by design.

---

## 3. Attachments/embeddings in a failure report

cucumber-js's `World.attach()` lets a step attach arbitrary data (a
screenshot, JSON, plain text) to the report for the current step/scenario.

| Framework | API | Citation |
|---|---|---|
| cucumber-js | `this.attach(data, { mediaType, fileName }, callback?)` — `data` is text, a `Buffer`, or a `stream.Readable`; `mediaType` defaults to `text/plain`, with `application/json` and `image/png` (buffer/base64) as documented common cases. Surfaces as attachments in the JSON/message formatters, and in any reporter (HTML included) built on those. | [`docs/support_files/attachments.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/attachments.md) — *"Text, images and other data can be added to the output of the messages and JSON formatters with attachments."* |
| cucumber-jvm | `Scenario.attach(byte[] / String, mediaType, name)`, reached via the `io.cucumber.java.Scenario` object injected into an `@After` hook parameter. | [`cucumber-jvm`](https://github.com/cucumber/cucumber-jvm) (javadoc.io returned 403 during this research pass; the GitHub source is the durable citation) |
| behave / SpecFlow | No first-class, stable core-API equivalent found — behave has attach-like behavior only via specific listener/reporter plugins, not a core API; SpecFlow has nothing comparable in its stable docs. | — |

**This library's own runner surface, verified by reading source, not by
docs.** `research/vitest-failure-reporter-surface.md` (already on branch
`research/vitest-failure-reporter-surface`, resolving issue #17) establishes
that vitest v4's `context.annotate(message, type?, attachment)` — where
`TestAttachment` is `{ contentType, body, bodyEncoding }`, `body` a string or
file path — **is** rendered automatically by the *default* reporter's failure
panel (`TestContext.annotate` → `recordArtifact` → `BaseReporter.printAnnotations`,
traced to source line numbers in that doc), unlike `task.meta`, which only the
JSON reporter reads. `@effect/vitest`'s `it.effect` callback already receives
`TestContext` as its final parameter at the `@effect/vitest` layer.

Reading `packages/vitest/src/Dsl.ts` directly, though, shows `StepRegistrar`/
`HookRegistrar` are typed as **zero-parameter** callables
(`() => Effect<A, E, ROut | Scope.Scope>`) — no `TestContext` anywhere in a
step or hook body's signature. A grep of `ScenarioEffect.ts` and
`VitestTestApi.ts` for `TestContext`/`annotate` returns zero hits.

**Verdict: real gap, not a false positive.** `context.annotate` is not
reachable from inside a step or hook as the DSL ships today — this isn't "an
awkward workaround exists," it's genuinely unreachable without a DSL/runner
change. The gap is narrow, though: the underlying vitest mechanism the fix
would sit on is already proven out (issue #17's research), so closing this is
"thread one more parameter through `ScenarioEffect`, expose it as an
`Attach`-shaped DSL member" — not a new subsystem, and it imports no
anti-pattern (no global state, no callback style; `context.annotate` is
itself a plain async function a step's Effect can `yield* Effect.promise(...)`
around once it's in scope).

---

## 4. Rerun-failed-only support

| Framework | Finding | Citation |
|---|---|---|
| cucumber-js | Two distinct mechanisms. `--retry <n>` (+ `--retry-tag-filter`) retries failing scenarios **within the same run** (flaky-test mitigation). A separate **rerun formatter** — `--format rerun:@rerun.txt` — writes failing scenario locations to a file for a *later* invocation, `cucumber-js @rerun.txt`, to replay just those. The docs explicitly distinguish the two use cases. | [`docs/rerun.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/rerun.md), [`docs/configuration.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md) |
| cucumber-jvm | `rerun:target/rerun.txt` plugin (`@CucumberOptions`), then `@target/rerun.txt` as the feature-path argument on the next run. **Not supported under the newer JUnit 5 Platform Engine** — confirmed by open upstream issues; the documented workaround there is Gradle's Test Retry plugin instead. | [`cucumber-junit-platform-engine/README.md`](https://github.com/cucumber/cucumber-jvm/blob/main/cucumber-junit-platform-engine/README.md), cucumber-jvm issues #2843/#2805 |
| behave | Native `rerun` formatter (`format = rerun`, `outfiles = rerun.txt` in `behave.ini`) — same shape as cucumber-js/jvm: `behave @rerun.txt` replays just the failed scenario locations, individual Scenario Outline example rows included. | [`behave/formatter/rerun.py`](https://github.com/behave/behave/blob/main/behave/formatter/rerun.py) |
| SpecFlow | No SpecFlow-native rerun-failed mechanism — defers entirely to the underlying .NET test runner's (MSTest/NUnit/xUnit) own "rerun failed tests" feature. | — |
| jest-cucumber | Nothing beyond Jest's own `--onlyFailures` / interactive watch-mode "press `f` to rerun failures." | [`bencompton/jest-cucumber` README](https://github.com/bencompton/jest-cucumber) |

vitest v4 itself has `--retry` (in-run, test-level retry — distinct from a
rerun-file mechanism) and `--changed` (reruns tests affected by a git diff,
not by prior failure). Neither is "rerun only what failed last time."

**Verdict: real gap.** Three of five frameworks (cucumber-js, cucumber-jvm,
behave) ship the same rerun-file pattern, and it answers a question `--changed`
structurally cannot (what changed vs. what failed). It's also the one item in
this survey most awkward to fit into this library's existing shape: it needs
cross-run, process-external state — a file naming failed Scenario locations,
written by one run and read by the next. Nothing in the ADRs forbids that
outright (it's not shared mutable state *within* a run, and not a callback),
but it's a different kind of statefulness than anything else this library
owns. It would sit at the `describeFeature`/registration layer — a
`rerunFile` option feeding into location-based registration filtering,
parallel to how `includeTags`/`excludeTags` already filter by tag rather than
inside any step's own Effect — not a small addition, but a real and
commonly-relied-on one.

---

## 5. Step-definition-level timeout, distinct from vitest's own `testTimeout`

| Framework | Finding | Citation |
|---|---|---|
| cucumber-js | `setDefaultTimeout(ms)` (global default, 5000ms) **and** a per-step override: `Given(pattern, { timeout: ms }, fn)` — an options object between the pattern and the function. | [`docs/support_files/api_reference.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/api_reference.md) |
| cucumber-jvm | Not found — no timeout attribute on `@Given`/`@When`/`@Then`, no `cucumber.execution.timeout` property in the primary docs. | [`cucumber-java/README.md`](https://github.com/cucumber/cucumber-jvm/blob/main/cucumber-java/README.md) (silent) |
| behave | No step-level timeout mechanism found. | [`docs/api.rst`](https://behave.readthedocs.io/en/latest/api/) (silent) |
| SpecFlow | No per-step timeout found — relies on the .NET test runner's own overall test timeout. | — |
| jest-cucumber | Relies on Jest's own `testTimeout` only. | [`bencompton/jest-cucumber` README](https://github.com/bencompton/jest-cucumber) (silent) |

**Verdict: not worth adopting — closest thing to a considered rejection in
this survey, even though nothing formally decided it before now.** Only
cucumber-js has this, of the five. And for this library specifically it's
close to a non-issue: a step body is already `Effect<A, E, R>`, so a step
author who wants a step-specific timeout already writes
`yield* Effect.timeout(myEffect, "2 seconds")` (or `Effect.timeoutFail` for a
typed timeout error) directly in the step body, with no framework support
needed and strictly more control than cucumber-js's option object gives (a
typed failure, composable with the rest of the step's error channel, no
separate deadline-tracking machinery). cucumber-js's per-step timeout exists
*because* its step bodies are callback/promise-based with no native
cancellation-with-typed-failure primitive — exactly the gap `Effect.timeout`
already closes structurally. Building a `{ timeout }` option into
`Given`/`When`/`Then` here would be adding a second, framework-level timeout
mechanism on top of a combinator that already does the job better — the one
place in this survey where importing the feature would be a regression, not
a gap.

---

## 6. Cucumber-expression custom-type libraries / shared parameter-type registries across projects

| Framework | Mechanism | Cross-project sharing story | Citation |
|---|---|---|---|
| cucumber-js | `defineParameterType({ name, regexp, transformer, useForSnippets, preferForRegexpMatch })` | No documented package/registry convention — the only pattern found is exporting a module that calls `defineParameterType`, imported and executed by a consuming project's own support files. No auto-discovery. | [`docs/support_files/api_reference.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/api_reference.md) |
| cucumber-jvm | `@ParameterType` annotation on glue classes | "Sharing" means packaging the glue classes in a shared JAR on the classpath/glue-path; Cucumber then **auto-detects** annotated types anywhere on that path — implicit auto-discovery, not explicit registration. | cucumber-jvm docs; fat-jar caveat tracked at [cucumber-jvm#2146](https://github.com/cucumber/cucumber-jvm/issues/2146) |

Neither ecosystem has an actual "custom-type package registry" or versioning
tooling. "Sharing" in both cases is ordinary module/JAR distribution, nothing
Cucumber-specific.

**Verdict: false positive — already covered, and arguably ahead.**
`ParameterTypeStore.layer(definitions)` (ADR-EC-023) already accepts a plain
`ReadonlyArray<ParameterTypeDefinition<unknown>>` — a consumer can already
publish an npm package exporting that array (or a `Layer` wrapping it) and
compose it into their own `ParameterTypeStore.layer([...shared, ...own])`.
That's at least as capable as cucumber-js's story (explicit import, no magic)
and better than cucumber-jvm's implicit classpath auto-discovery — adopting
glue-path-style auto-discovery would actively fight Effect's explicit-Layer-provision
model, not complement it, so there is nothing here worth importing from either
framework.

---

## 7. Other notable findings

### 7a. Tagged/conditional hooks — real gap, clean fit

`Before`/`After` in this library apply unconditionally to every Scenario in
the Feature or Rule they're registered in (BEH-EC-017). Both cucumber-js and
cucumber-jvm let a hook itself be scoped by a tag expression:

| Framework | Syntax | Citation |
|---|---|---|
| cucumber-js | `Before({ tags: "@foo and not @bar" }, fn)`, or shorthand `Before("@foo", fn)` — the full tag-expression grammar from §2. | [`docs/support_files/hooks.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/hooks.md) |
| cucumber-jvm | `@Before("not @zukini")` — a tag-expression string as the annotation argument. | [`cucumber-java/README.md`](https://github.com/cucumber/cucumber-jvm/blob/main/cucumber-java/README.md) |
| behave | No declarative tag-scoped `Before`-equivalent; instead ships `before_tag(context, tag)`/`after_tag(context, tag)`, firing per-tag as Gherkin elements are entered, plus the documented convention of checking `context.tags` by hand inside `before_scenario`. | [`docs/api.rst`](https://behave.readthedocs.io/en/latest/api/) |

This is a real, commonly-relied-on Cucumber feature this library doesn't
have, and closing it imports **no** anti-pattern: it's `if
(!tagMatches(currentTags, expr)) return Effect.void` wrapped around the
existing Effect-based hook body at the point BEH-EC-017's ordering already
iterates each hook batch — no global mutable state, no callback style. The
open design question it would inherit is which grammar to accept: the plain
array this library already committed to for `includeTags`/`excludeTags`
(ADR-EC-026), or the full boolean tag-expression grammar §2 found vitest's own
`--tagsFilter` already implements — worth flagging as coupled to §2's finding
rather than a separate, independent decision.

### 7b. "Pending" step status — a considered rejection, not an overlooked gap

cucumber-js has a `pending` step-result status distinct from `undefined`: a
step can explicitly signal "not implemented yet, on purpose" as opposed to a
step Cucumber genuinely can't find a definition for
([cucumber.io/docs/cucumber/api](https://cucumber.io/docs/cucumber/api/),
[`docs/support_files/step_definitions.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/step_definitions.md)).
This library's [ADR-EC-019](../spec/decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md)
fail-loudly policy treats an unmatched step as a hard failure with no soft
middle state — that's a deliberate, already-made design choice (loudness over
a "not yet" status the ADR's own Context section argues against implicitly by
choosing to fail loudly rather than degrade), not something this survey is
newly surfacing.

### 7c. Snippet generation — already built, and not behind cucumber-js's own

The original issue asked to verify `packages/gherkin/src/Snippet.ts` against
cucumber-js's own snippet capability, not just note that one exists. Reading
`Snippet.ts` directly: `generateStepSnippet` runs upstream's own
`CucumberExpressionGenerator` (the same generator cucumber-js's own snippet
feature is built on) against the Feature's real `ParameterTypeRegistry`, so
custom parameter types generalize into suggested snippets automatically, and
additionally types every generated parameter using this library's own
built-in-name → TypeScript-type table (`{int}` → `number`,
`{biginteger}` → `bigint`, etc.) with identifier-safety and reserved-word
handling for parameter names — output cucumber-js's own JS-target snippet
generator has no equivalent of, since JavaScript snippets carry no static
types to get right. **Not a gap** — this is parity on the underlying
generator plus a TypeScript-specific improvement cucumber-js structurally
can't offer.

### 7d. Parallel Scenario execution — flagged, not deep-dived (out of this survey's specific scope)

The original issue text also names this; it isn't one of the seven numbered
questions this pass was scoped to, so it's noted rather than researched to
the same depth. `packages/vitest/README.md` states plainly that a Feature
emitted under `sequence.concurrent: true` or a consumer's own
`describe.concurrent` is unsupported, because two Scenarios could enter the
`BeforeAllScenarios` once-cell together. cucumber-js supports real
worker-process parallelism (`--parallel <n>`) and cucumber-jvm supports JUnit
5 platform parallel execution — both first-class, load-bearing features in
those ecosystems. This is arguably the single largest scaling gap versus
cucumber-js specifically, but closing it interacts directly with the
once-per-Feature hook guarantees §1 already found every comparable framework
struggles with under parallelism — it's a big enough question to warrant its
own research ticket rather than a subsection here.

---

## Summary

| # | Question | Verdict | Effect fit if adopted |
|---|---|---|---|
| 1 | Global (suite-wide) `BeforeAll`/`AfterAll` | **Real gap** | Needs a new entry point outside `describeFeature`; every framework that has it fights the same parallel-worker isolation problem; vitest's own `globalSetup`/`globalTeardown` already structurally covers "once per run" today, untyped |
| 2 | Boolean tag expressions | **False positive** — vitest's `--tagsFilter` already has the identical and/or/not/parens grammar over natively-emitted tags | N/A |
| 3 | Attachments (`World.attach`) | **Real gap** — `TestContext` isn't threaded into a step/hook body at all today | Clean — the underlying vitest mechanism (`context.annotate`) is already proven reachable from `it.effect`; needs plumbing, not a new subsystem |
| 4 | Rerun-failed-only | **Real gap** — 3 of 5 frameworks ship a rerun-file mechanism; vitest's `--changed` answers a different question | Needs process-external, cross-run state (a rerun-location file) — a new kind of statefulness for this library, though not one any ADR forbids |
| 5 | Step-definition-level timeout | **Not worth adopting** — only cucumber-js has it, and `Effect.timeout` already does the job better inside a step body | Adopting it would be a regression — reintroduces callback-era deadline machinery `Effect.timeout` already replaces |
| 6 | Custom parameter-type libraries | **False positive** — `ParameterTypeStore.layer(definitions)` already matches/exceeds cucumber-js's story | N/A |
| 7a | Tagged/conditional hooks | **Real gap** | Clean — a guard around the existing Effect-based hook body, no anti-pattern; coupled to #2's grammar choice |
| 7b | "Pending" step status | **Considered rejection** (ADR-EC-019) | N/A |
| 7c | Snippet generation | **Not a gap** — parity with cucumber-js's generator, plus TS-specific typing it can't offer | N/A |
| 7d | Parallel Scenario execution | **Flagged, out of this survey's scope** | Interacts directly with #1's parallel-worker findings; worth its own ticket |

**Ranked by how likely each is worth adopting:** (1) tagged/conditional hooks
(7a) — clean fit, no anti-pattern, small surface; (2) attachments (3) — clean
fit, the hard part (vitest's own mechanism) is already proven by issue #17's
research, remaining work is plumbing; (3) rerun-failed-only (4) — real and
commonly relied on, but a genuinely new kind of cross-run state for this
library to own; (4) global suite-wide hooks (1) — real, but the biggest of
the four, and partly softened by `globalSetup` already existing as an
untyped fallback today.
