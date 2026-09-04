# ADR-EC-044: `@effect/vitest` is a `devDependency` of `@effect-cucumber/gherkin`'s own test suite — does not conflict with ADR-EC-021

> **Status:** Accepted
> **Date:** 2026-09-04
> **Context:** settles a boundary question raised while converting `packages/gherkin/test/` to be
> Effect-native (`it.effect` + `assert`, zero `Effect.runPromise`/`Effect.runSync` used as a
> boundary-crossing convenience) — a pure test-implementation-style change, not a behavior change

## Context

[ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md) states `@effect-cucumber/gherkin`
"depends on no concrete test runner" and is enforced by `scripts/verify-no-runner-dep.sh`. Read
loosely, that sentence could be taken to forbid `@effect/vitest` anywhere in this package,
including its own test suite — which would block converting `packages/gherkin/test/` off plain
`it`/`describe` from `"vitest"` onto `@effect/vitest`'s `it.effect`/`assert`, the convention
`AGENTS.md` §5 and `packages/vitest/test/` already use throughout.

Reading the actual enforcement script rather than the ADR's prose settles this:

- **Assertion 2** (source-side gate) scans only `packages/gherkin/src/**/*.ts` for imports of
  `vitest`, `@effect/vitest`, or `@effect/platform-{node,bun,deno}`. It never looks at `test/`.
- **Assertion 3** (manifest-side gate) scans only `dependencies`, `optionalDependencies`,
  `bundledDependencies`, and `peerDependencies` in `packages/gherkin/package.json` for those same
  packages. It does not scan `devDependencies` at all.

`gherkin`'s `package.json` already carries plain `vitest` as a `devDependency` — used to run this
package's own suite — and that has passed this gate since before this session. `@effect/vitest` is
architecturally identical to plain `vitest` from the gate's point of view: a tool this package uses
to test itself, never imported from `src/`, never present in any consumer-facing manifest field,
never shipped (`files` in `package.json` lists only `src/**/*.ts` and `dist`; no `test/`, no
`devDependencies`, ever reaches an installer).

ADR-EC-021's own Decision section, read in full rather than as one sentence, already draws this
exact distinction: "gherkin stays runtime-agnostic even though it is no longer Effect-agnostic" is
about the package a consumer installs, not about how this repository chooses to test that package.
Nothing in ADR-EC-021 was written with the test suite's own tooling in mind — this is a genuinely
new question, not a reversal of that ADR's decision, so per this repository's convention (cited in
ADR-EC-021's own header) it gets its own ADR rather than a correction appended to that one.

## Decision

`packages/gherkin/package.json` declares `"@effect/vitest": "catalog:"` under `devDependencies`,
the same catalog entry `packages/vitest/package.json` already uses. It is imported only from
`packages/gherkin/test/**/*.ts`, never from `src/`. `scripts/verify-no-runner-dep.sh` needs no
change — its two gates already scope exactly the boundary this decision relies on (`src/`-only
imports, four consumer-facing manifest fields only), and continue to pass unchanged.

## Consequences

**Positive**:

- `packages/gherkin/test/` can adopt `it.effect`/`assert`, matching `AGENTS.md` §5's convention
  and `packages/vitest/test/`'s existing practice, instead of being permanently stuck on plain
  `it`/`describe` + manual `Effect.runPromise`/`Effect.runSync` escape hatches merely because of a
  loose reading of ADR-EC-021's prose.
- No change to `scripts/verify-no-runner-dep.sh`'s enforced boundary — this decision fits inside
  it exactly as already written, verified by rerunning the script after the dependency was added.

**Negative**: none identified. This adds a `devDependency` a consumer never sees or installs.

**Trade-off accepted**: none — this is not a trade-off, it is confirming an existing enforcement
mechanism already permits what it was designed to permit.

## Note: the two deliberate exceptions this migration still leaves in place

Converting `packages/gherkin/test/` off `Effect.runPromise`/`Effect.runSync` as a
boundary-crossing convenience does not mean the suite never calls those functions again.
`test/loadFeature.test.ts` keeps exactly two direct calls, both because the call itself is the
literal subject of the assertion, not a convenience:

- `Effect.runSync(loadFeature(path).pipe(Effect.provide(NodeFileSystem.layer)))` is asserted to
  **throw** `AsyncFiberError` — proving the real `NodeFileSystem.layer` suspends internally
  (ADR-EC-021's second Correction). You cannot assert what `Effect.runSync` does to an Effect
  without calling `Effect.runSync`, the same way asserting `JSON.parse` throws requires calling
  `JSON.parse`.
- `Effect.runPromise(loadFeature(path).pipe(Effect.provide(NodeFileSystem.layer)))` is kept as a
  public-API interop smoke test: it proves `gherkin`'s Effect-returning API resolves to a plain,
  correctly-shaped object via Effect's own canonical execution entry point — exactly how a real
  consumer who is an Effect program but not `@effect-cucumber/vitest` itself (the case
  ADR-EC-013/ADR-EC-021 both name) would actually call it.

Every other `Effect.runPromise`/`Effect.runSync` call this migration found — in the other 8
migrated files' `load`/`parse` helpers and local unwrap-only helpers — was a convenience with no
such reason, and is gone. `test/loadFeature.test.ts`'s module-top-level proof (that `loadFeature`
has no observable effect on the test run before any test executes) no longer needs a Promise at
all: it now runs against a synchronous, `Effect.sync`-backed `FileSystem` test double built with
`effect/FileSystem`'s own `layerNoop`, not the real (suspending) `NodeFileSystem.layer` — see that
file for the implementation. `Effect.sync` wraps a synchronous thunk; it is not a Promise
conversion.
