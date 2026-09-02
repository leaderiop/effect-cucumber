# Research: vitest's failure-reporter customization surface

> Resolves GitHub issue [#17](https://github.com/leaderiop/effect-cucumber/issues/17)
> (feeds the design ticket #18, currently blocked on this one).

## Method

This repo's root already had `pnpm install` run against its pinned
`vitest: ^4.1.0` / `@effect/vitest: 4.0.0-rc.112` catalog (`pnpm-workspace.yaml`),
so the installed packages' actual shipped `.d.ts`/`.js` (not doc-site prose)
were read directly out of `node_modules` at the repo root
(`/Users/mohammadalmechkor/Projects/Perso/effect-cucumber`, the parent checkout
of this worktree — the worktree itself has no `node_modules`):

- `vitest@4.1.11` (satisfies the `^4.1.0` pin) — `node_modules/vitest/package.json`.
  Its public `Reporter`/`TaskMeta`/annotation types re-export from
  `@vitest/runner` and are declared in
  `node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts`; the actual
  `DefaultReporter`/`BaseReporter` terminal-rendering logic (not just types)
  lives in `node_modules/vitest/dist/chunks/index.UpGiHP7g.js`.
- `@vitest/runner@4.1.11` — resolved via pnpm's content-addressed store to
  `node_modules/.pnpm/@vitest+runner@4.1.11/node_modules/@vitest/runner`;
  `TaskMeta`, `TestAnnotation`, `Test` (aliased as `RunnerTestCase` by
  `vitest`'s own re-export), and the `context.annotate` implementation live
  here, split between `dist/tasks.d-DEYaIMIu.d.ts` (types) and
  `dist/chunk-artifact.js` (the actual `context.annotate`/`recordArtifact`
  runtime code).
- `@effect/vitest@4.0.0-rc.112` — resolved to
  `node_modules/.pnpm/@effect+vitest@4.0.0-rc.112_effect@4.0.0-rc.112_vitest@4.1.11.../node_modules/@effect/vitest`,
  read for Q4 (precedent).

vitest's own docs site (`vitest.dev`) was fetched for two pages
(`/guide/test-context`, `/guide/test-annotations`) purely as corroboration —
every claim below is grounded in the installed source/types first, docs
second.

Also read this repo's own emission code —
`packages/vitest/src/TestApi.ts`, `packages/vitest/src/VitestTestApi.ts`,
`packages/vitest/src/Step.ts` — to check where a `context.annotate`-shaped fix
would actually have to plug in, since that's directly relevant context for
the blocked design ticket #18.

---

## 1. Does vitest expose task-metadata attachment that a DEFAULT reporter then surfaces — or does custom failure-panel content require a full custom `Reporter`?

**Both exist in the API, and they behave very differently. Only one of them
is actually rendered by the built-in default reporter's failure panel.**

### 1a. `context.task.meta` / `TaskMeta` — NOT rendered generically by the default reporter

**Found:** `@vitest/runner`'s `dist/tasks.d-DEYaIMIu.d.ts:546`:

```ts
/**
* Custom metadata that can be used in reporters.
*/
interface TaskMeta {}
```

Deliberately empty — meant to be widened via TypeScript module augmentation
by a *reporter author*, not read generically by any built-in one. Grepping
vitest's actual terminal-rendering code
(`node_modules/vitest/dist/chunks/index.UpGiHP7g.js`) for every `.meta`
access confirms this: the only reads are `t.meta.benchmark` (benchmark
reporters), `entity.meta().typecheck` (the `TS` badge on typechecked tests,
line 2349), and the **JSON reporter** serializing `t.meta` verbatim
(line 3577-3582, `JsonReporter`). `DefaultReporter`/`BaseReporter`'s failure
panel (`printTaskErrors`, see §1b) never reads `task.meta` at all — attaching
data there is invisible to the panel a user actually sees on `vitest run`.
This matches `TaskMeta`'s own JSDoc: "JSON reporter will save this data" —
it says JSON reporter, not "the reporter," and that's literally true of the
shipped implementation.

### 1b. `context.annotate(...)` / `TestAnnotation` — IS rendered by the default reporter's failure panel, automatically

**Found:** `TestContext.annotate`'s real signature,
`@vitest/runner`'s `dist/tasks.d-DEYaIMIu.d.ts:1316-1320`:

```ts
/**
* Add a test annotation that will be displayed by your reporter.
* @see {@link https://vitest.dev/guide/test-context#annotate}
*/
readonly annotate: {
	(message: string, type?: string, attachment?: TestAttachment): Promise<TestAnnotation>;
	(message: string, attachment?: TestAttachment): Promise<TestAnnotation>;
};
```

producing a `TestAnnotation` (same file, line 1395-1400):

```ts
interface TestAnnotation {
	message: string;
	type: string;
	location?: TestArtifactLocation;
	attachment?: TestAttachment;
}
```

Traced the *runtime* wiring, not just the types, in three steps:

1. **`context.annotate`'s implementation** —
   `@vitest/runner`'s `dist/chunk-artifact.js:2368-2388` — builds the
   annotation (`message`, `type` defaulting to `"notice"`, optional
   `attachment`) and calls `recordArtifact(test, { type: "internal:annotation", annotation })`.
2. **`recordArtifact`** (same file, `dist/chunk-artifact.js:3333-3346`) —
   auto-injects `location` by parsing a fresh `new Error("STACK_TRACE").stack`
   against the test file's path (`findTestFileStackTrace`), so `location` is
   populated for free *if* the call site is inside the test file vitest
   already knows about — see the caveat in §4 for why that matters to this
   repo specifically.
3. **`BaseReporter.printTaskErrors`** (used by `DefaultReporter` — see below)
   — `node_modules/vitest/dist/chunks/index.UpGiHP7g.js:2645-2691` — for
   every failed task, after calling `this.ctx.logger.printError(error, ...)`
   it does:
   ```js
   if (tasks[0].type === "test" && tasks[0].annotations.length) {
   	const test = this.ctx.state.getReportedEntity(tasks[0]);
   	this.printAnnotations(test, "error", 1);
   	this.error();
   }
   ```
   `printAnnotations` (same file, line 2324-2343) groups annotations by
   `` `${file}:${line}:${column} ${type}` `` (or just `type` if no location)
   and prints each `message` indented underneath, directly under the
   `FAIL`/error block — in the same visual unit a developer reads when a test
   fails.

**Class hierarchy that makes this the actual default behavior, not an
opt-in:** `class DefaultReporter extends BaseReporter` (line 3085) and
`class DotReporter extends BaseReporter` (line 3138) — both inherit
`printTaskErrors`/`printAnnotations` unmodified. vitest's resolved config
default is `reporters: ["default"]`
(`node_modules/vitest/dist/chunks/defaults.9aQKnqFk.js:11`), which resolves to
`DefaultReporter`. This repo's `vitest.config.ts` does not override
`reporters`, so this is exactly the reporter this repo's `pnpm test` uses
today.

**Corroborated by vitest's own docs** (`vitest.dev/guide/test-annotations`,
fetched): *"The `default` reporter prints annotations only if the test has
failed"*, shown as `❯ example.test.js:9:15 notice` — matching
`printAnnotations`'s exact rendering read from source. Also: *"Vitest will
also automatically await any non-awaited annotation before the test
finishes"* — so a fire-and-forget `context.annotate(...)` call (no `await`)
is still safe to use inside a step body that then goes on to fail.

**One real constraint, found in source, not docs:** `context.annotate` throws
if called after the test's result state has left `"run"` —
`dist/chunk-artifact.js:2369-2371`:
```js
if (test.result && test.result.state !== "run") {
	throw new Error(`Cannot annotate tests outside of the test run. The test "${test.name}" finished running with the "${test.result.state}" state already.`);
}
```
So it must be called from inside the still-running test (e.g. in a
catch-and-rethrow around a step, or an `onTestFailed` hook), not after the
fact.

**Verdict for Q1: attaching structured metadata that the DEFAULT reporter
then surfaces in its failure output is real and shipped — via
`context.annotate(...)`, not `task.meta`. No custom `Reporter` implementation
is required to get this into the panel a developer actually sees on failure.**
`task.meta`/`TaskMeta` exists but is the wrong mechanism for this — it's
consumed by the JSON reporter and a couple of hardcoded internal badges, not
by the terminal failure panel.

---

## 2. Can a thrown error's own shape carry step info into the default panel, with zero reporter/annotation-API involvement?

Traced `printErrorInner`, the function that actually renders one error inside
the panel — `node_modules/vitest/dist/chunks/index.UpGiHP7g.js:1731-1789`.
Three independent mechanisms found, all driven purely by what the thrown
object looks like:

### 2a. `error.message` is always printed verbatim

`printErrorMessage` (line 1861-1872):
```js
function printErrorMessage(error, logger) {
	const errorName = error.name || "Unknown Error";
	if (!error.message) { logger.error(error); return; }
	...
	logger.error(c.red(`${c.bold(errorName)}: ${error.message}`));
}
```
Called unconditionally near the top of `printErrorInner` (line 1758). A
custom error (or a wrapper error) whose `.message` already contains
`"Given I have {int} apples (features/apples.feature:12)"` renders exactly
that, in the failure panel, with zero reporter or annotation involvement.

### 2b. `error.cause` is followed and re-rendered, recursively, if it has a `.name`

`printErrorInner` (line 1782-1790):
```js
if (typeof e.cause === "object" && e.cause && "name" in e.cause) {
	e.cause.name = `Caused by: ${e.cause.name}`;
	printErrorInner(e.cause, project, {
		showCodeFrame: false,
		logger: options.logger,
		parseErrorStacktrace: options.parseErrorStacktrace
	});
}
```
So throwing (or letting propagate) an error whose `.cause` is itself a
named object — e.g. `new Error("...", { cause: originalAssertionError })` —
gets that cause's own `printErrorMessage` (and diff, and stack) rendered as a
nested `"Caused by: <Name>"` block, purely from the error's own shape. This
is a real, general-purpose vitest mechanism (not something built for this
use case) that a wrapper error carrying step context could exploit: wrap the
original failure as `.cause`, put the step text/location in the wrapper's own
`.message`, rethrow the wrapper. Both the step context (top) and the original
assertion diff (nested "Caused by:") show up.

### 2c. `AssertionError`-shaped diff/frame properties (`.diff`, `.frame`, `.codeFrame`) print directly, but a caveat on custom properties

`printErrorInner` prints `e.diff` (line 1780, "E.g. AssertionError from assert
does not set showDiff but has both actual and expected properties" — comment
in source), and `e.frame`/`e.codeFrame` directly. **But** arbitrary *extra*
own properties on an error are suppressed specifically when the error's name
is `"AssertionError"`:

`getErrorProperties` (line 1848-1855):
```js
function getErrorProperties(e) {
	const errorObject = Object.create(null);
	if (e.name === "AssertionError") return errorObject;
	for (const key of Object.getOwnPropertyNames(e))
		...
		else if (key !== "stack" && !skipErrorProperties.has(key)) errorObject[key] = e[key];
	return errorObject;
}
```
This return value feeds `printStack`'s trailing "Serialized Error: {...}"
block (line 1901-1906) — so a plain custom `Error` subclass with e.g. a
`step` own-property WOULD get that property dumped into the panel as
"Serialized Error: { step: '...' }" with zero reporter code — but a genuine
`expect()`-produced `AssertionError` (the common case for a failing step)
will NOT show extra own-properties this way, because the check above
explicitly zeroes it out for that one `name`. `.message` (2a) and `.cause`
(2b) are unaffected by this `AssertionError` special-case — both still work
regardless of the error's `name`.

**Verdict for Q2: yes — real, achievable purely from the error-construction
side, no reporter/annotation API needed.** The reliable levers are
`error.message` (always printed) and `error.cause` (recursively printed as
"Caused by:" if it has a `.name`); the `getErrorProperties` "Serialized
Error:" dump is a viable third lever only for non-`AssertionError`-named
errors.

---

## 3. `Reporter`, `TaskMeta`, `RunnerTestCase`, `context.annotate` — actual installed types (vitest@4.1.11)

All four resolved and read directly, cross-checked against the module map so
citations are the real installed files, not guesses:

- **`Reporter`** — `node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:1041` (`interface Reporter { onInit?, onTestCaseResult?, onTestCaseAnnotate?, onTestRunEnd?, ... }`, ~30 optional lifecycle hooks). Re-exported publicly as `Reporter` from `vitest/reporters` (`node_modules/vitest/dist/reporters.d.ts`). Confirms: a *full* custom reporter is still a real, larger surface than `context.annotate` — but per §1, it is not the only way to get extra content into the panel.
- **`TaskMeta`** — `@vitest/runner`'s `dist/tasks.d-DEYaIMIu.d.ts:546`, `interface TaskMeta {}` — empty, module-augmentation-only, and (per §1a) not read by the default terminal reporter's failure block.
- **`RunnerTestCase`** — not a distinct type; it's `vitest`'s public re-export name for `@vitest/runner`'s `Test` interface: `node_modules/vitest/dist/index.d.ts:5` — `` Test as RunnerTestCase ``. Its `annotations: TestAnnotation[]` field (`dist/tasks.d-DEYaIMIu.d.ts:667`) is what `BaseReporter.printAnnotations` reads at report time.
- **`context.annotate`** — `TestContext.annotate` on `@vitest/runner`'s `dist/tasks.d-DEYaIMIu.d.ts:1316-1320` (types, quoted in §1b) and `dist/chunk-artifact.js:2368-2388` (runtime). `TestContext` itself is what `@effect/vitest`'s `Vitest.Test<R>`'s generator function receives as its final parameter (`TestFunction<A, E, R, [V.TestContext]>` — confirmed independently in this repo's own prior research, `research/effect-vitest-v4-api.md`, item 1) — so `it.effect`'s callback already has access to `annotate` today, at the `@effect/vitest` layer. Whether it's reachable from *this repo's* step-execution code is a separate question — see §4.

---

## 4. Precedent (or conflict) from `@effect/vitest` itself, and this repo's own runner seam

### `@effect/vitest` does not use `annotate`, `task.meta`, or any custom reporter

Grepped `@effect/vitest@4.0.0-rc.112`'s full `src/` for `annotate`, `task.meta`,
`TaskMeta`, `Reporter` — zero hits anywhere except one unrelated match. What
it does instead, in `internal/internal.ts:23-34` (`runPromise`):

```ts
const runPromise: <E, A>(...) => Promise<A> = Effect.fnUntraced(function*<E, A>(effect, _ctx) {
  const exit = yield* Effect.exit(effect)
  if (Exit.isFailure(exit)) {
    const errors = Cause.prettyErrors(exit.cause)
    for (let i = 0; i < errors.length; i++) {
      yield* Effect.logError(errors[i])
    }
  }
  return yield* exit
}, (effect, _, ctx) => Effect.runPromise(effect, { signal: ctx?.signal }))
```

On failure it logs `Cause.prettyErrors(exit.cause)` (console output, via
`Effect.logError` — separate from the panel) and then re-raises the failed
`Exit` through `Effect.runPromise`, which is what actually rejects the
Promise `it.effect`'s thunk returns. The object vitest's default reporter
sees for a failing `it.effect` test is therefore whatever `effect`'s own
runtime constructs for a rejected `Effect.runPromise` on a failed `Exit`
(effect's own `Cause`-derived failure wrapper) — **not** anything shaped by
`@effect/vitest` itself, and definitely not an annotation or `task.meta`.
This is exactly consistent with what RUN-06 observes: nothing in the
`@effect/vitest`-to-vitest boundary today does anything but propagate the
raw `Cause`; step/location context never enters either the `annotate` path
or the error-shape path described in §1/§2 at any point.

**No conflict** — nothing here needs to be undone to add `annotate` or
error-shape based context; `@effect/vitest` simply never touches either
mechanism, so a fix at either level is additive.

### This repo's own `TestApi` seam currently erases the `TestContext` a §1b fix would need

Read `packages/vitest/src/TestApi.ts:24-31` — the framework-agnostic seam
`Runner.ts` composes against:

```ts
export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
  readonly afterAll: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}
```

`self` is a zero-argument thunk — deliberately (the module header: "must
never import a framework," enforced by `scripts/verify-testapi-seam.sh`), so
it cannot reference vitest's `TestContext` type. `packages/vitest/src/VitestTestApi.ts`
is the one file allowed to import `@effect/vitest`/vitest, and it calls
`it.effect(name, self, emitOptions)` (`vitestTestApi`) — `@effect/vitest`'s
`it.effect` *would* hand a `TestContext` (with `.annotate`) into that
callback, but `VitestTestApi.ts` currently discards it (the callback it
passes through is the seam's zero-arg `self`, not a `(ctx) => ...` form), and
`packages/vitest/src/Step.ts`'s `register` (which wraps each step body with
`Effect.fn(pattern)`) has no path to a `TestContext` at all today.

This is offered as grounding for #18, not a design conclusion: a
`context.annotate`-based fix (§1b) is real and reachable in principle, but it
is not a one-line change in this codebase — it requires deciding how (or
whether) a `TestContext`/`annotate` capability crosses the deliberately
framework-agnostic `TestApi` seam, which #18 is exactly positioned to decide.
An error-shape-only fix (§2) has no such obstacle — it only requires
`Step.ts`/`ScenarioEffect.ts` to catch-and-rewrap a step failure before it
propagates, entirely inside the existing Effect pipeline, with no new type
crossing the `TestApi` boundary.

---

## Summary

| # | Question | Finding |
|---|----------|---------|
| 1 | Metadata attachment surfaced by the DEFAULT reporter, no custom `Reporter`? | **Yes, via `context.annotate(message, type?)`** — rendered automatically by `BaseReporter.printTaskErrors`/`printAnnotations`, which `DefaultReporter` (vitest's actual default, unconfigured in this repo) inherits unmodified. `task.meta`/`TaskMeta` is the wrong mechanism — real, but only read by the JSON reporter and two hardcoded badges, never the terminal failure panel. |
| 2 | Can error shape alone (no reporter/annotation API) carry context into the panel? | **Yes** — `error.message` is always printed; `error.cause` is recursively printed as a nested "Caused by:" block if it carries a `.name`. A third lever (extra own-properties via "Serialized Error:") is suppressed for errors named `"AssertionError"` specifically, so it's the least reliable of the three for typical assertion failures. |
| 3 | Real installed types (`Reporter`, `TaskMeta`, `RunnerTestCase`, `context.annotate`) | All confirmed against `vitest@4.1.11`/`@vitest/runner@4.1.11`'s actual shipped `.d.ts`/`.js`, file:line cited above. `RunnerTestCase` is `vitest`'s re-export name for `@vitest/runner`'s `Test`. |
| 4 | `@effect/vitest` precedent / conflict | **No conflict, and no precedent to build on** — `@effect/vitest`'s `runPromise` only calls `Cause.prettyErrors` for console logging and re-raises the raw failed `Exit`; it never touches `annotate`, `task.meta`, or a custom reporter. This repo's own `TestApi` seam (`packages/vitest/src/TestApi.ts`) currently erases the `TestContext` a `context.annotate` fix would need — a real integration cost for #18 to weigh, not a blocker for the underlying vitest capability. |

**Bottom line for #18:** a full custom `Reporter` implementing vitest's
`Reporter` interface is **not required** to fix RUN-06. Two independent,
composable, primary-source-confirmed levers exist without one: (a)
`context.annotate(...)`, rendered automatically by the default reporter but
requiring the `TestContext` to be threaded through this repo's currently
framework-agnostic `TestApi` seam, and (b) constructing/rethrowing the step
failure with step text and `.feature` location folded into `.message` (and/or
the original failure preserved as `.cause`), which needs no new type to cross
that seam at all. Which of these (or both) #18 should choose is a design
decision this research deliberately leaves open.
