# ADR-EC-043: the INV-EC-006 Ref-only gate excludes two named framework-level meta-tests — a scope bug fix, not a new carve-out

> **Status:** Accepted
> **Date:** 2026-09-04
> **Context:** fixes a scope bug in `scripts/verify-acceptance-ref-state.sh`, present since it was first built (audit remediation, before this ADR series reached ADR-EC-030), inherited by [ADR-EC-042](042-lint-01-ships-as-a-vendored-oxlint-plugin-template.md)'s Correction when `ref-state-only` was dogfooded against the same directory

## Context

`ref-state-only`, dogfooded against `packages/vitest/test/acceptance/` per ADR-EC-042's Correction, flagged 4 `records.push(...)` calls inside `pitfalls-checklist.test.ts`'s `makeRecordingApi()` — the same 4 spots `scripts/verify-acceptance-ref-state.sh`'s pre-existing `GATE-ALLOW-MUTATION` carve-outs already covered. The immediate instinct was to suppress the new hits with paired `// oxlint-disable-next-line` comments, matching the shell script's existing carve-out. On being told not to suppress without first finding the root cause, a closer look showed the carve-outs were never a genuine exception to a correctly-scoped rule — they were a symptom of the rule being scoped wrong from the start.

**The evidence, all pre-existing in this repository's own documents:**

- `spec/traceability.md`'s §4 Test file map already marks both `pitfalls-checklist.test.ts` and `negative-requirements.test.ts` **"Not a pair"** — its own term for "not a step module." Each drives `Runner.ts`'s internals (`loadFeature`, `collectFeature`, `buildScenarioEffect`, `emitFeature`) directly, to test the framework's _own_ registration/emission/failure-reporting plumbing — `pitfalls-checklist.test.ts` via a hand-rolled fake `TestApi` recording which synchronous callback `emitFeature` invoked, `negative-requirements.test.ts` via starved `.feature` fixtures under `acceptance/negative/` that are handed to no runner. Neither registers a real Scenario a Gherkin step could belong to.
- `spec/invariants.md`'s own INV-EC-006 section already _described_ the gate's scope as `packages/vitest/test/acceptance/*.steps.test.ts` — narrower than what `scripts/verify-acceptance-ref-state.sh` actually implemented (`SCANNED_TS` globbed every `.ts` file in the directory via `find "$ACCEPTANCE_DIR" -type f -name '*.ts'`, not just `*.steps.test.ts`). The spec was already right; the script never matched it.
- The `GATE-ALLOW-MUTATION` comments themselves already said as much, in the code: "the opposite of the module-scope holder INV-EC-006 forbids" (`pitfalls-checklist.test.ts`, pre-existing). That phrase describes a category mismatch, not an accepted violation.

INV-EC-006 ([ADR-EC-009](009-cross-step-state-lives-in-a-ref.md)) governs a value one Gherkin **step** hands a later **step** in the same Scenario. `pitfalls-checklist.test.ts`'s `records` array is registration-time test-harness bookkeeping — function-local to one `makeRecordingApi()` call, never shared across Scenarios, and never crossing a step boundary, because there is no step here at all. `TestApi`'s methods (`packages/vitest/src/TestApi.ts:44-56`) are plain synchronous `void`-returning functions, invoked synchronously by `Runner.ts`'s real `emitFeature` during one registration pass with no Effect runtime running — the existing carve-out comment's "a TestApi callback is synchronous and cannot yield a Ref update" was already correct on this point.

**Two alternatives were considered and rejected, not merely skipped:**

1. **Suppress with a disable comment** (the shell script's `GATE-ALLOW-MUTATION` marker, or oxlint's `// oxlint-disable-next-line`). Rejected: this documents a violation as accepted when the code was never a violation of what INV-EC-006 actually means — it launders a scope bug into what looks like a deliberate, ongoing exception.
2. **Rewrite `records` using `effect/MutableRef`** (a synchronous mutable-cell module) instead of `Array.prototype.push`. Technically this passes both gates' regex/AST checks — `MutableRef.update(ref, arr => [...arr, x])` isn't a `.push()` call and `MutableRef.make([])` isn't a `let`. But nothing about the underlying design changes: it is still an in-place update of a shared cell, spelled through a different API. `MutableRef` is used nowhere else in this codebase; introducing it here would add an unprecedented pattern for the sole purpose of satisfying a pattern-matcher that doesn't understand what it's looking at. Rejected as gaming the gate, not fixing anything — the actual mismatch (this file isn't step-module code) would remain unaddressed and undocumented.

## Decision

Both INV-EC-006 enforcement mechanisms exclude `pitfalls-checklist.test.ts` and `negative-requirements.test.ts` by name:

- `scripts/verify-acceptance-ref-state.sh` gains an explicit `EXCLUDED_FILES` array naming both, filtered out of `SCANNED_TS` before either scan runs, each checked to exist (so a rename fails the gate loudly rather than silently widening or narrowing what's excluded). `ALLOWED_MUTATIONS` drops from `4` to `0` — with the exclusion in place, the remaining 16 files (15 `*.steps.test.ts` pairs plus `step-modules.module.ts`, a genuine `defineSteps`-based shared step-definition module) are already clean.
- `.oxlintrc.json` gains a second `overrides` entry, later than the existing broad `packages/vitest/test/acceptance/**` one, naming the same two files with `effect-cucumber/ref-state-only: "off"`. oxlint's overrides are last-match-wins per file, verified empirically before relying on it.

**A named exclude list, not a narrowed `*.steps.test.ts` allowlist.** `step-modules.module.ts` carries real step bodies (registered via `defineSteps<R>`, reused across pairs via `.use(module)`) and has real INV-EC-006 exposure, despite not carrying the `.steps.test.ts` suffix. Switching the scan population to `*.steps.test.ts` only — the simpler-looking fix — would have silently dropped it from coverage, trading one scope bug for another. Verified directly: with the fix in place, a temporarily-inserted `let` in `step-modules.module.ts` is still flagged by `effect-cucumber(ref-state-only)`, reverted immediately after.

`pitfalls-checklist.test.ts`'s `records.push(...)` calls are unchanged — there was nothing wrong with them. The four repeated `GATE-ALLOW-MUTATION` comments and the four `oxlint-disable-next-line` comments are both removed, replaced by one comment at the `records` declaration explaining why this file sits outside the gates' scope.

`spec/invariants.md` and `spec/traceability.md` are corrected to describe the actual (now-fixed) scan population precisely — both already leaned narrower than the implementation, so this sharpens existing text rather than reversing it. `packages/vitest/test/acceptance/README.md` gains one sentence stating the same scope explicitly, closing an ambiguity that previously stated the Ref-only rule generically without saying whether non-pair files were in scope.

## Consequences

**Positive**:

- Zero suppression comments anywhere in the acceptance suite for this rule — every file the gates scan is genuinely, uncompromisingly clean.
- The fix makes the implementation match documentation that was already correct (`spec/invariants.md`'s pre-existing `*.steps.test.ts` framing), rather than requiring new design work.
- `step-modules.module.ts` — the one file a naive `*.steps.test.ts`-only fix would have silently dropped — stays covered and was verified to stay covered.
- The `GATE-ALLOW-MUTATION` mechanism (marker + `ALLOWED_MUTATIONS` count) remains available for a genuine future function-local-mutation case inside an actual step module; it is not weakened, only correctly un-applied here.

**Negative**:

- Two enforcement mechanisms (`EXCLUDED_FILES` in the shell script, the second `overrides` entry in `.oxlintrc.json`) must be kept in sync by hand if a third meta-test file is ever added to the acceptance directory — each carries a comment cross-referencing the other, but nothing mechanically ties them together.

**Trade-off accepted**: a small amount of manual-sync risk between two config surfaces, in exchange for a scan population that is finally accurate to what INV-EC-006 actually means, rather than "every `.ts` file in a directory" standing in for "every step module."
