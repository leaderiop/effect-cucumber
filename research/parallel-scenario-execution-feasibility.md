# Research: is parallel Scenario execution feasible given the once-cell hook model

> Resolves GitHub issue [#36](https://github.com/leaderiop/effect-cucumber/issues/36)
> (part of the wayfinder map, issue [#11](https://github.com/leaderiop/effect-cucumber/issues/11)).
> Follows up on issue [#24](https://github.com/leaderiop/effect-cucumber/issues/24)'s
> [`research/cucumber-ecosystem-feature-survey.md`](https://github.com/leaderiop/effect-cucumber/blob/research/cucumber-ecosystem-feature-survey/research/cucumber-ecosystem-feature-survey.md)
> § 7d, which flagged this as worth its own ticket rather than diving in.

## Method

Read, before any new research: `packages/vitest/src/VitestTestApi.ts`, `packages/vitest/src/Runner.ts`,
`packages/vitest/README.md`, `spec/behaviors/07-hook-ordering-and-guarantees.md`, and
`spec/decisions/018-shared-layer-testclock-isolation.md` — so the mechanism, not the docs'
paraphrase of it, is what grounds every claim below. Then installed this repo's own pinned
dependencies (`pnpm install`, not a separate scratch directory this time, since the question is
about *this repo's* pinned `effect@4.0.0-rc.112` / `@effect/vitest@4.0.0-rc.112` / `vitest@4.1.11`
specifically) and read the real installed source for `Effect.cached`, `Deferred`, `Semaphore`,
`SynchronizedRef` and `Latch` in `effect`, and `layer(...)`'s real implementation in
`@effect/vitest`. Two things were additionally verified **empirically**, not just read: whether
`Runner.ts`'s hand-rolled once-cell is actually race-safe under `vitest`'s real
`sequence.concurrent` scheduler (not a paper argument about it), and what specifically breaks when
it isn't obviously safe. See § 2's "Empirical check" for the throwaway test file used (written
under `packages/vitest/test/`, run with `pnpm vitest run`, then deleted — never committed).

---

## 1. How do the frameworks that support parallel execution solve the once-cell race?

Issue #24's survey already established, per primary source, which of the five frameworks have a
global/suite-wide once-hook concept and which have real parallel execution. Re-reading those two
findings together, framework by framework:

| Framework | Has a global once-hook? | Has real parallel Scenario execution? | How the two interact |
|---|---|---|---|
| cucumber-js | Yes — `BeforeAll`/`AfterAll` | Yes — `--parallel <n>` | **Escape hatch, not a lock.** Default: each **worker process** gets its own separate `BeforeAll`/`AfterAll` run — there is no cross-worker "once" at all unless the hook author opts in. `{ on: HookTarget.COORDINATOR }` moves a specific hook onto a single dedicated coordinator process instead, which every worker process defers to. [`docs/support_files/hooks.md`](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/hooks.md) |
| cucumber-jvm | Yes — `@BeforeAll`/`@AfterAll` | Yes — JUnit 5 Platform parallel execution | **Relies on the host test engine's own hook-ordering contract**, not a mutex it implements itself: JUnit 5's `@BeforeAll` is guaranteed by the platform to complete before any of that class's test methods start, parallel or not. Notably fragile in practice, not a free guarantee — cucumber-jvm's own docs flag needing "Maven Surefire/Failsafe ≥3.0.0-M5 for correct ordering," i.e., there is a documented history of getting this wrong below that version. [`cucumber-java/README.md`](https://github.com/cucumber/cucumber-jvm/blob/main/cucumber-java/README.md) |
| behave | Yes — `before_all`/`after_all` | **No** — behave core has no built-in parallel Scenario execution; parallelism, where it exists, is a third-party plugin layered on top, not part of the framework's own execution model. | The race doesn't arise in behave's own model because the parallel side of the pairing doesn't exist there. [`docs/api.rst`](https://behave.readthedocs.io/en/latest/api/) |
| SpecFlow | Yes — `[BeforeTestRun]`/`[AfterTestRun]` | Yes — SpecFlow+ Runner | **Documented degradation, not a lock.** Runs once **per thread/AppDomain/process** under parallel execution — the same per-worker scoping as cucumber-js's *default*, but with no coordinator-style escape hatch found in the primary docs for recovering a true cross-worker "once." [`docs.specflow.org` — Bindings/Hooks](https://docs.specflow.org/projects/specflow/en/latest/Bindings/Hooks.html) |
| jest-cucumber | **No** — no library-specific once-hook concept at all; whatever "once" means is entirely Jest's own `beforeAll` | Jest parallelizes at the **file** level (separate worker processes); within one file, Jest's own `test.concurrent` is single-worker cooperative concurrency, same as vitest's | The race doesn't arise because jest-cucumber never introduces a once-per-suite hook of its own to race in the first place. [`bencompton/jest-cucumber` README](https://github.com/bencompton/jest-cucumber) |

**None of the five implements a lock, mutex, or leader-election protocol over shared memory for
this.** Every one of them either (a) gives up cross-worker sharing by default and requires an
explicit dedicated non-parallel phase to get it back (cucumber-js's coordinator), (b) leans
entirely on the host test framework's own "hooks complete before children start" contract instead
of building synchronization itself (cucumber-jvm/JUnit 5, jest-cucumber/Jest), or (c) just
documents a weaker "once per worker" semantic as the cost of parallelism (SpecFlow, cucumber-js's
non-coordinator default) — Q1's fourth option, "the race doesn't exist because the feature
doesn't", applies outright to behave and (for the once-hook half specifically) to jest-cucumber.

**This is not actually the same problem this library has, and that gap matters more than which
strategy each framework picked.** Every "parallel" flag surveyed above (`--parallel <n>`, JUnit 5
Platform parallel execution, SpecFlow+ Runner, Jest's file-level workers) means **OS-level worker
isolation** — separate processes or separate threads, each with its own heap. There is no
possibility of two pieces of code racing to mutate the *same* JS object at the *same* instant in
any of those models, because the workers don't share memory in the first place; the "once" problem
they're solving is purely about how to get a *single* execution to happen *somewhere* and have
every other worker learn about (or just not need) its result. What
`packages/vitest/README.md` means by "Scenarios must run sequentially... under
`sequence.concurrent: true`" is a **completely different kind of parallelism**: single-thread,
single-heap, cooperative fiber concurrency — `vitest`'s own concurrent-test scheduler runs every
concurrent test in one file on the *same* JS thread via `Promise.all`-style interleaving (confirmed
by reading `@vitest/runner`'s `runSuite`/`runSuiteChild`, which drives concurrent siblings through
`Promise.all(tasksGroup.map((c) => groupLimiter(() => runSuiteChild(c, runner))))` — one thread,
many interleaved Promises, never real parallel execution). That is a *narrower and more tractable*
problem than what any of the five surveyed frameworks solved, not a *harder* one — which is exactly
what § 2 confirms.

---

## 2. Is there a real Effect-native primitive that makes the once-cell race-safe without giving up "exactly once, same result for every racer"?

**Yes — and this library already uses one.** `Runner.ts`'s `makeOnce` is not a placeholder; read
in full, it is:

```ts
const makeOnce = (
  body: Effect.Effect<void, unknown, Scope.Scope>
): Effect.Effect<void, unknown, Scope.Scope> => {
  const deferred = Deferred.makeUnsafe<void, unknown>()
  let started = false
  return Effect.suspend((): Effect.Effect<void, unknown, Scope.Scope> => {
    if (started) {
      return Deferred.await(deferred)
    }
    started = true
    return Effect.flatMap(Deferred.into(body, deferred), () => Deferred.await(deferred))
  })
}
```

— a mutable JS flag, checked and set inside `Effect.suspend`'s callback, gating a `Deferred` every
later caller awaits. This is not a bespoke pattern invented for this library: it is **structurally
identical** to `effect`'s own built-in `Effect.cached` (`node_modules/effect/src/internal/effect.ts`,
the body of `cachedInvalidateWithTTL`, which `Effect.cached` is a TTL-infinity special case of):

```ts
// effect's own internal.ts — the SAME shape: a plain mutable flag (`running`), checked
// synchronously inside withFiber's callback, gating a Latch every other caller awaits.
const latch = makeLatchUnsafe(false)
let running = false
let exit: Exit.Exit<A, E> | undefined
...
withFiber((fiber) => {
  ...
  if (running || now < expiresAt) return exit ?? wait
  running = true
  latch.closeUnsafe()
  ...
})
```

Both rely on the same fact about the Effect runtime, not on any threading primitive: `Effect.suspend`
(and `withFiber`)'s callback executes as one synchronous JS function call, with no `yield*`/`await`
inside it, and JavaScript's single-threaded, run-to-completion execution model guarantees no other
code — including another fiber's own call into the *same* `Effect.suspend` node — can execute in
the middle of it. The check-and-set (`if (started) {…} started = true`) is therefore already
atomic with respect to concurrent fibers, with zero extra synchronization. `effect@4.0.0-rc.112`
also ships purpose-built primitives for the same job if you'd rather not roll it by hand:
`Deferred` (`effect/Deferred`, used above), `Latch` (`effect/Latch` — a real top-level module,
`Latch.make`, `.open`, `.await`, `.whenOpen`; used internally by `Effect.cached`), `Semaphore`
(`effect/Semaphore`, permit-based, for bounding concurrency rather than gating a one-shot), and
`SynchronizedRef` (`effect/SynchronizedRef` — **this is v4's real name for what the issue and v3
called `Ref.Synchronized`; there is no `Ref.Synchronized` sub-export in the installed v4-rc
source**, confirmed by reading `Ref.ts` — the type lives in its own top-level `SynchronizedRef.ts`
module instead, serializing effectful updates behind an internal `Semaphore`). None of `Effect.once`
by that literal name exists in v4 — `Effect.cached` is the real combinator that name would have
meant.

**Empirical check, because a paper argument about atomicity isn't the same as watching it hold
under vitest's real scheduler.** A throwaway test file
(`packages/vitest/test/scratch-once-cell-race.test.ts` — written for this research pass, run, and
deleted; never committed) copied `makeOnce`'s exact shape and raced it inside a real
`describe.concurrent` block under `vitest run`, with a **real** `setTimeout`-backed delay (`Effect.promise`
wrapping `setTimeout`, not `Effect.sleep` — `it.effect` gives every test its own simulated
`TestClock`, per `research/effect-vitest-v4-api.md` item 1, so `Effect.sleep` inside a shared
once-cell body never advances on its own and is the wrong tool for simulating a slow real-world
setup like a testcontainer boot):

- **Three Scenarios, one 150ms setup, all three with generous 2000ms `testTimeout`s, run under
  `describe.concurrent`: all three pass, and the setup's own build counter is `1`.** Exactly-once
  execution and a shared, correct result hold under real concurrent scheduling — not just in
  theory. This directly answers the question as posed: yes, the once-per-Feature guarantee
  survives concurrent racers with no loss of correctness, using nothing more than the primitive
  already in this codebase.
- **Two Scenarios, one 400ms setup, one Scenario with a short 100ms `testTimeout` and the other
  with a generous 2000ms `testTimeout`, run under `describe.concurrent`: BOTH fail.** The
  short-timeout Scenario times out as expected. But the long-timeout Scenario — whose own budget
  was never close to elapsing — **also** fails, with the exact same `InterruptError` the short one
  produced. Re-running the identical pairing under plain sequential `describe` (no concurrency at
  all) reproduces the *same* joint failure, which confirms this specific half is not a concurrency
  bug: it is `BeforeAllScenarios`'s own documented behavior working as designed — "its first exit…
  is what every later Scenario reports," interruption included (BEH-EC-017). What concurrency adds
  is **which Scenario's budget that shared fate gets pinned to becomes nondeterministic** instead
  of deterministically "whichever Scenario is first in document order." Under sequential execution
  only the literal first Scenario is ever exposed to the setup's duration against its own clock;
  every later Scenario starts only after the once-cell has already settled, so its own timeout is
  never at risk from the setup at all. Under concurrent scheduling, *multiple* Scenarios start
  their own `testTimeout` countdown at roughly the same instant while all racing the same
  in-flight setup — so whichever one happens to win the JS-level race (arbitrary, not
  document-order) becomes the setup's sole executor, and if a **different**, shorter-`testTimeout`
  sibling loses patience first, its interrupt cascades through the shared `Deferred`/`Latch` and
  fails every other concurrently-scheduled Scenario too — even ones whose own configured timeout
  was never in danger. That's real and reproducible, and it's the actual mechanism behind "two
  Scenarios could enter the once-cell together," not a vaguer worry about corrupted state.

So the answer to the literal question is: **yes, a real Effect-native primitive exists, this
codebase already uses one, and it is provably race-safe for the "exactly once / same result for
every racer" guarantee under real concurrent `vitest` scheduling** — that half of the problem was
never actually open. What concurrency breaks is a *different, narrower* thing: which Scenario's own
`testTimeout` the shared setup's duration gets charged against stops being predictable, and a
short-lived sibling can now externally kill a long-lived one's otherwise-fine wait. That is a
design/architecture problem (where `BeforeAllScenarios` executes and whose timeout wraps it), not a
missing-primitive problem.

---

## 3. Does `@effect/vitest`'s own `layer(...)` have documented — or even undocumented-but-safe — behavior under `sequence.concurrent`?

**Undocumented, in both directions.** A full grep of the installed `@effect/vitest@4.0.0-rc.112`
package — `src/index.ts`, `src/internal/internal.ts`, `README.md`, and every file under
`ai-docs/` — for the string `concurrent` returns **zero hits** outside two unrelated example
comments in the AI docs about `Effect`'s own request-batching and cluster modules. `@effect/vitest`
neither claims support for `sequence.concurrent` nor disclaims it; it simply never mentions the
setting. This is genuinely one level below this library, and the question "is the blocker actually
in `@effect/vitest`, unfixable from here" deserves a real answer rather than "it's silent, who
knows":

Reading `internal.ts`'s real `layer(...)` implementation (the exact one `sharedLayerTestApi` calls)
shows the shared-tier build is **already structurally safe** under concurrent test execution, for
two independent reasons that don't depend on `@effect/vitest` documenting anything:

1. **The build itself is wrapped in `Effect.cached`** (`internal.ts` line ~243: `Layer.buildWithMemoMap(...).pipe(Effect.orDie, Effect.cached, Effect.runSync)`) — the exact race-safe once-cell pattern § 2 just verified empirically. Whichever test's `beforeEach` (the one-argument form this library uses) or `beforeAll` (the named form) reaches it first triggers the real build; every other racer gets the memoized result, correctly, regardless of scheduling order.
2. **The build is gated by vitest's own hook lifecycle, not by this library's DSL.** In the one-argument form (what `sharedLayerTestApi` uses — see `VitestTestApi.ts`'s own comment: "the framework's one-argument `layer(...)` is called inside its factory so its hooks land on this block"), `internal.ts` attaches a real `V.beforeEach` to every collected test in the block, which triggers the (memoized) build before *that* test's body runs — vitest's own `beforeEach`/test ordering contract, not a hand-rolled flag, guarantees the build attempt happens before any Scenario's own steps, concurrent siblings included.

So `@effect/vitest`'s **own** shared-Layer memoization is not the blocker, and needs no upstream
change to survive concurrent Scenario execution — it was already built on the same primitive this
library's own `makeOnce` uses, independently. **The actual blocker identified in § 2 — cross-Scenario
`testTimeout` cascading through `BeforeAllScenarios`'s shared `Deferred` — is entirely this
library's own construction**, not `@effect/vitest`'s: it comes specifically from `Runner.ts`
weaving `BeforeAllScenarios`'s execution into the *first attempted Scenario's own `it.effect` body*
(`Effect.flatMap(beforeAllScenariosCell, () => buildScenarioEffect(...))`, wrapped by whatever
`testTimeout` that one Scenario happens to carry) rather than running it inside a real vitest
`beforeAll`/`beforeEach` the way the *shared Layer build* already does. `@effect/vitest` exposes
exactly the vitest-hook-based, timeout-independent pattern this library would need
(`internal.ts`'s own `hookTimeout(options?.timeout)`, a *separate* timeout budget from any
individual test's `testTimeout`) — this library's `BeforeAllScenarios` design just doesn't use it,
by original intent (README states the timeout-sharing explicitly as a stated precondition, not an
oversight). Nothing here is blocked one level down.

---

## 4. Honest bottom line

**Concurrent Scenario execution is realistically buildable on top of this library's current
architecture, with a bounded — not small, but bounded and self-contained — amount of new code. It
is not blocked on `@effect/vitest`, and it is not a rewrite.**

What has to actually change, stated plainly:

- **`BeforeAllScenarios` (and `AfterAllScenarios`'s "vacuous if nothing attempted" carve-out) needs
  to move off "runs inside whichever Scenario happens to attempt it first" and onto a real vitest
  `beforeAll`/`beforeEach`, the same lifecycle the shared Layer's own build already correctly uses
  (§ 3). That removes the demonstrated failure mode directly — the setup no longer inherits *any*
  individual Scenario's `testTimeout`, so a short-timeout sibling can no longer externally kill a
  long-timeout one's otherwise-successful wait — at the cost of giving `BeforeAllScenarios` its own
  independent timeout knob (`@effect/vitest`'s `hookTimeout` mechanism already models exactly this)
  instead of piggybacking on `testTimeout`, which is a real, deliberate behavior change from what
  `packages/vitest/README.md` currently documents ("runs inside the first attempted Scenario's
  timeout budget"), not a transparent internal fix.
- **The `AfterAllScenarios` "nothing was attempted" carve-out** (BEH-EC-017: "the decision is made
  AT RUN TIME, from whether any Scenario's body was invoked, because under a CLI filter it cannot
  be made at registration") currently depends on a Scenario's own thunk being the thing that flips
  `attempted = true`. Moving setup to a real `beforeAll` doesn't itself break this — `attempted` is
  a plain, idempotent boolean flip at the very top of every Scenario's own callback, before any
  yielding, so it stays correct under concurrent scheduling for the same single-threaded-atomicity
  reason § 2 relies on — but it does mean re-verifying that a real `beforeAll` for
  `BeforeAllScenarios` doesn't itself run in the all-Scenarios-filtered-out case, since vitest's own
  `beforeAll` for a block runs whenever the block has any registered child at all, filtered or not,
  which is a different trigger than "was any Scenario's body actually invoked." This needs its own
  guard, not a reuse of the existing one.
- **Which Scenario's ambient `TestClock`/`TestConsole` `BeforeAllScenarios`'s body observes** stops
  being deterministic (document order) and becomes "whichever Scenario's fiber wins the race" once
  execution moves off a single Scenario's own body entirely and onto vitest's real `beforeAll` (as
  above), this concern disappears on its own — `beforeAll` runs before any Scenario's own
  `Effect.provide(TestEnv)` wrapping exists at all, exactly matching how the shared *Layer* build
  already behaves per ADR-EC-018 note 6 ("the shared tier itself is built on the LIVE clock"). This
  is actually evidence *for* moving to a real hook, not an additional problem it introduces.
- **`Runner.ts`'s emission loop and `VitestTestApi.ts`'s `sharedLayerTestApi`/`vitestTestApi` split**
  need the new call site for `BeforeAllScenarios`/`AfterAllScenarios` threaded through the same
  `TestApi` seam the rest of the emission logic already goes through (`scripts/verify-testapi-seam.sh`'s
  existing constraint), which is genuine new code but is exactly the kind of change this seam was
  built to localize.
- **The plain (non-`shared`) Layer path** has no once-per-Feature *Layer* to worry about (only the
  DSL-level `BeforeAllScenarios` hook, if registered), so it needs the same `beforeAll`-based fix
  but none of § 3's Layer-memoization reasoning — smaller surface, same underlying change.
- **This does NOT require any change to `@effect/vitest`** (§ 3) and does NOT require inventing a
  new Effect concurrency primitive (§ 2) — both of the plausible "this is blocked upstream" outs
  are ruled out by what's actually installed and actually running today.

What this verdict is **not**: it is not a claim that flipping `sequence.concurrent: true` support
on is a documentation change, or that the existing README's "unsupported" line is simply wrong
today — it is accurate for the code as it stands right now, and the empirical failure in § 2 is
real, reproducible, and would bite a consumer immediately if the precondition were quietly dropped
without the `beforeAll`-based rework above. The gap between "unsupported" and "supported" is a
concrete, scoped, single-mechanism architecture change inside this codebase (move one hook's
execution site), not a research-grade unknown and not a wall.
