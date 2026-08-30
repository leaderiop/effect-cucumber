---
phase: 05-describefeature-type-surface
reviewed: 2026-08-29T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - packages/gherkin/src/index.ts
  - packages/vitest/README.md
  - packages/vitest/src/Dsl.ts
  - packages/vitest/src/Registry.ts
  - packages/vitest/src/Step.ts
  - packages/vitest/src/describeFeature.ts
  - packages/vitest/src/index.ts
  - packages/vitest/test/Registry.test.ts
  - packages/vitest/test/Step.test.ts
  - packages/vitest/test/describeFeature.test.ts
  - packages/vitest/test/tsgo-gate/src/layer-missing-rin.ts
  - packages/vitest/test/tsgo-gate/src/step-expect-error.ts
  - packages/vitest/test/tsgo-gate/src/step-missing-service.ts
  - packages/vitest/test/tsgo-gate/src/step-satisfied.ts
  - packages/vitest/test/tsgo-gate/src/world-undeclared-field.ts
  - packages/vitest/test/tsgo-gate/tsconfig.json
  - packages/vitest/test/tsgo-gate/tsconfig.layer-rin.json
  - packages/vitest/test/tsgo-gate/tsconfig.step-expect-error.json
  - packages/vitest/test/tsgo-gate/tsconfig.step-missing.json
  - packages/vitest/test/tsgo-gate/tsconfig.step-ok.json
  - packages/vitest/test/tsgo-gate/tsconfig.world-field.json
  - packages/vitest/tsconfig.test.json
  - scripts/verify-tsgo-gate.sh
  - spec/behaviors/01-steps-and-world.md
  - spec/invariants.md
  - spec/roadmap.md
  - spec/traceability.md
findings:
  critical: 2
  warning: 2
  info: 1
  total: 5
status: fixed
fixed_commit: 7fcebc2
---

**Post-review update:** CR-01, CR-02, and WR-01 were fixed inline (commit `7fcebc2`) per
the exact diffs below. WR-02's missing test was also added in that commit. IN-01 (dead
`RegistryShape` export) was left as-is — genuinely optional cleanup, not a correctness or
truthfulness issue. `pnpm typecheck:test`, `pnpm test` (427/427), and `pnpm lint` all pass
after the fixes.

# Phase 5: Code Review Report

**Reviewed:** 2026-08-29
**Depth:** standard
**Files Reviewed:** 26 (24 unique paths in scope; two spec files carry no code)
**Status:** issues_found

## Summary

This phase ships `describeFeature`'s compile-time type surface (`Dsl.ts`), the per-instance step
registry (`Registry.ts`), the generator auto-wrap (`Step.ts`), the two-overload entry point
(`describeFeature.ts`), the public barrel (`index.ts`), the nine-assertion `@effect/tsgo` compile
gate (`scripts/verify-tsgo-gate.sh` + `test/tsgo-gate/`), and the accompanying spec updates.

I read every file, then verified the empirical claims rather than trusting them: `pnpm --filter
@effect-cucumber/vitest test` (22/22 pass), `bash scripts/verify-tsgo-gate.sh` (all 9 assertions
pass), `pnpm typecheck:test`, `pnpm lint`, and `tsc -b --force` for `packages/vitest` (clean
declaration-emit build) all succeed. The runtime code — `Registry.ts`, `Step.ts`,
`describeFeature.ts`, `Dsl.ts` — is correct: the registrar closures, the scope stack's
push/pop/finally discipline, the reference-identity pass-through, the overload ordering, and the
Layer-merge collision rule all behave exactly as documented and as asserted by the fixture pairs.

The defects are all in the **documentation surface**, which is explicitly in scope (README and
spec files are source in this repository). Two of them are a real, checkable contract mismatch
that this exact phase's diff introduced or left uncorrected: both `packages/vitest/README.md` and
`spec/behaviors/01-steps-and-world.md` assert, in the present tense, that `@effect-cucumber/vitest`
re-exports a `loadFeature` — but `packages/vitest/src/index.ts` (also reviewed, also unchanged on
this point) exports only `describeFeature` and the four `Dsl.ts` types. `loadFeature` does not
exist anywhere under `packages/vitest/src`, and `@effect/platform-node` (needed to build the
`ManagedRuntime` ADR-EC-024 describes) isn't even a dependency of the package yet. A reader who
copies either document's example gets an unresolvable import. Given this project's own repeatedly
stated charter ("say only what is true", quoted verbatim in `invariants.md`, `roadmap.md`, and
`01-steps-and-world.md` itself), this is a real, provable regression in the artifact the phase is
supposed to finalize, not a nitpick.

## Critical Issues

### CR-01: README.md claims the package re-exports `loadFeature`, which it does not

**File:** `packages/vitest/README.md:6`
**Issue:** The package description states: "It depends on
[`@effect-cucumber/gherkin`](../gherkin) and re-exports `loadFeature` from it." This is false as
shipped. `packages/vitest/src/index.ts` (reviewed in this same phase) exports exactly
`describeFeature` and the `BackgroundDsl`/`FeatureDsl`/`ScenarioDsl`/`StepRegistrar` types — no
`loadFeature`, and there is no `packages/vitest/src/loadFeature.ts` file on disk. `git log` for
that path returns nothing. The package's own `package.json` doesn't even list
`@effect/platform-node` as a dependency, which ADR-EC-024 (cited by the spec, see CR-02) says is
required to build the `ManagedRuntime` the wrapped `loadFeature` needs. The "## Status" section
directly below — freshly rewritten in this very phase to state precisely what's real — is silent
on this point, so nothing in the file corrects the claim.
**Fix:** Either remove the "re-exports `loadFeature`" clause until `packages/vitest/src/loadFeature.ts`
ships, or add it explicitly to the "## Status" section's list of what's not yet built:
```diff
-Gherkin `.feature` file into ordinary vitest `describe`/`it` calls — no plugin and no custom reporter. It depends on
-[`@effect-cucumber/gherkin`](../gherkin) and re-exports `loadFeature` from it.
+Gherkin `.feature` file into ordinary vitest `describe`/`it` calls — no plugin and no custom reporter. It depends on
+[`@effect-cucumber/gherkin`](../gherkin). A wrapped, `ManagedRuntime`-backed `loadFeature`
+(ADR-EC-024) is planned but not yet exported — see "## Status" below.
```

### CR-02: The BEH-EC-013 worked example is labeled "real" but imports a `loadFeature` that isn't exported

**File:** `spec/behaviors/01-steps-and-world.md:253-255`
**Issue:** This phase's own diff (commit `e4aadff`, "docs(05-06): publish the shipped
describeFeature and step signatures") changed the worked example's guard comment from the
appropriately hedged "Pre-implementation reference — not yet compiled against a real API" to:
```ts
// The API below is real; this fence is still not compiled, because the doc-examples
// check is not wired yet (spec/roadmap.md). Nothing here emits a test until Phase 6.
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
```
`describeFeature` is real. `loadFeature` is not — see CR-01's evidence: no such export exists in
`packages/vitest/src/index.ts`, no such module exists on disk, and the `@effect/platform-node`
dependency ADR-EC-024 requires for it isn't installed. Since the doc-examples compile check is
confirmed "Not wired" by `spec/roadmap.md`'s own status table, nothing catches this claim being
false, and a reader has no signal other than trusting the (now incorrect) comment. This directly
contradicts the file's own stated policy one paragraph above ("the API below is real") and the
project-wide "say only what is true" charter this same file cites via `AGENTS.md` §2.
**Fix:** Scope the "real" claim to what actually shipped, and flag the still-planned half:
```diff
-// The API below is real; this fence is still not compiled, because the doc-examples
-// check is not wired yet (spec/roadmap.md). Nothing here emits a test until Phase 6.
+// describeFeature and the dsl below are real and compile-gated (this phase). The
+// `loadFeature` import is ADR-EC-024's planned ManagedRuntime wrapper, not yet shipped
+// from @effect-cucumber/vitest — see packages/vitest/README.md "## Status". This fence
+// is still not compiled either way; the doc-examples check is not wired yet (spec/roadmap.md).
 import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
```

## Warnings

### WR-01: `Dsl.ts`'s own `any`-count claim is wrong, undermining the file's central auditability guarantee

**File:** `packages/vitest/src/Dsl.ts:64`
**Issue:** Note (d) states: "The two `any`s below are the ONLY ones permitted in this module: one
`any` anywhere in a step body's declared type is assignable to everything and disables the whole
guarantee." Grepping the file's actual code (excluding comments) for `\bany\b` finds exactly **one**
occurrence — `Params extends ReadonlyArray<any>` on line 104 — not two. This module exists
specifically so a future reviewer can mechanically confirm "no stray `any` crept in" by counting;
a wrong baseline count in the file that makes that promise undermines the promise itself, and
directly contradicts `invariants.md`'s INV-EC-003 "Boundary condition" section, which leans on
this exact module's `any`-freedom claim.
**Fix:** Correct the count (or point at the actual second occurrence if one was intended
elsewhere and got lost in a prior edit):
```diff
-* `any`s below are the ONLY ones permitted in this module: one `any` anywhere in a step body's
+* `any` below is the ONLY one permitted in this module: one `any` anywhere in a step body's
```

### WR-02: No test asserts `Background`'s `finally`-guarded `popScope()` the way `Scenario`'s is asserted

**File:** `packages/vitest/test/describeFeature.test.ts:192-210`
**Issue:** `describeFeature.test.ts`'s header specifically calls out the `finally` pop as one of
four assertions "written more strictly than they look like they need to be" because the defect it
guards against is silent: "registering a step AFTER a `Scenario` callback throws... Without the
`finally`, the scenario frame stays on the stack." A test exists for exactly this
(`"returns to the feature root after a Scenario callback throws"`, lines 192-210) — but
`describeFeature.ts`'s `Background` branch (lines 148-159) has the identical
`pushScope`/`try`/`finally`/`popScope` structure, and no test exercises a `Background` callback
that throws. A regression that dropped `Background`'s `finally` specifically (leaving `Scenario`'s
intact) would pass every test in this file today.
**Fix:** Add the `Background` counterpart of the existing Scenario test:
```ts
it("returns to the feature root after a Background callback throws", () => {
  const collected = collectFeature(feature, Layer.empty, ({ Background, Given }) => {
    try {
      Background(() => {
        throw new Error("the define callback for this background threw")
      })
    } catch {
      // Swallowed here so collection continues, mirroring the Scenario case above.
    }
    Given("a step after the background throw", noop)
  })
  expect(scopeOf(collected, "a step after the background throw")).toEqual({ kind: "feature", name: "Checkout" })
})
```

## Info

### IN-01: `RegistryShape<Fn>` is exported but never referenced anywhere in the package

**File:** `packages/vitest/src/Registry.ts:143`
**Issue:** `export type RegistryShape<Fn> = ReturnType<typeof createRegistry<Fn>>` is not imported
by `describeFeature.ts` (which calls `createRegistry` directly and lets inference do the work), not
imported by any test, and not re-exported from `index.ts` (correctly — `Registry.ts` is
intentionally internal per its own note (d)). It is dead exported surface within an
already-internal module.
**Fix:** Either remove it until a consumer needs it, or, if it exists purely to document the
factory's return shape for a future `describeFeature.ts` refactor, say so in a comment so the next
reader doesn't file this as unused-export debt again.

---

_Reviewed: 2026-08-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
