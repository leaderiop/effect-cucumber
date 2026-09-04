# ADR-EC-042: LINT-01 ships as a vendored, copyable oxlint plugin template — reverses the "wait for oxlint's plugin API to leave alpha" posture

> **Status:** Accepted
> **Date:** 2026-09-04
> **Context:** reverses the deferral recorded in `spec/roadmap.md`'s former "Under consideration" entry for an oxlint plugin for LINT-01; that deferral itself traced to [tickets #15/#16](https://github.com/leaderiop/effect-cucumber/issues/15) under the resolved [gap-decisions map](https://github.com/leaderiop/effect-cucumber/issues/11), which chose the shell-script route ([`scripts/templates/verify-consumer-ref-state.sh`](../../scripts/templates/verify-consumer-ref-state.sh)) specifically because oxlint's `jsPlugins` API was alpha

## Context

INV-EC-006 / [ADR-EC-009](009-cross-step-state-lives-in-a-ref.md) requires cross-step Scenario state to live in a `Ref` from a Layer-provided service, never a closure variable or an in-place mutation — a rule `pnpm test` cannot catch, since a leak only surfaces across a retry, a re-run, or a narrowed `-t` selection. Tickets #15/#16 surveyed the distribution options for enforcing this in a CONSUMER'S repository and chose a shell-script template over a real oxlint rule, reasoning that oxlint's JS/TS custom-plugin API (`jsPlugins`) was too immature upstream to build a public-facing rule on top of.

That reasoning was already half-contradicted at the time it was written: this repository's own `tools/oxlint/effect/` (vendored from `Effect-TS/effect`, wired since Phase 0 commit `9e9f71c`) has been running four real `jsPlugins` rules in this repository's own CI, on every push, since before ticket #15/#16 were even opened. The "alpha, therefore not safe to build on" framing was never really about whether the API worked — it demonstrably does, proven daily — it was about whether _this project_ should be the one making a semver promise about it to the public via a published npm package.

Re-examining that: Effect's own `@effect/oxc` — the exact rules this repository vendors — makes no such promise either. It is `"private": true` in the Effect monorepo, never published to npm (`npm view @effect/oxc` returns 404), and consumed only by vendoring the source and loading it via a local-path `jsPlugins` specifier. Effect itself, on its own `main` branch, already trusts this "alpha API, vendored not published" shape for its own real production tooling. This project adopted that exact pattern once already (`tools/oxlint/effect/`) without hesitation. There was no principled reason to hold LINT-01 to a stricter bar than the rules this repository already depends on for its own linting.

## Decision

LINT-01 ships as [`scripts/templates/oxlint-ref-state/`](../../scripts/templates/oxlint-ref-state) — a real oxlint rule (`ref-state-only`, covering both the `let`/`var` check and the in-place-mutator check the shell script already performs), structured identically to `tools/oxlint/effect/`'s rules (a `CreateRule` object against `@oxlint/plugins`' `ESTree` types), with its own unit tests (`test/ref-state-only.test.ts`, mirroring `tools/oxlint/effect/test/`'s harness) and its own real-`oxlint`-invocation proof script (`scripts/verify-ref-state-oxlint-plugin.sh`, mirroring `scripts/verify-oxlint-plugin.sh`), wired into this repository's own CI so a regression to the template itself is caught.

**Not published to npm.** Same as `@effect/oxc` upstream and `tools/oxlint/effect/` in this repository: a consumer copies the directory into their own repository and wires it into their own `.oxlintrc.json`. This is not a downgrade from "real package" — it is the deliberate shape that lets this project depend on an alpha upstream API without ever making a semver promise about it to someone else's CI.

**Both routes stay.** The shell-script template is not replaced or deprecated. The oxlint rule gives inline, author-time editor feedback the shell script structurally cannot; the shell script's carve-out count gives a CI-time roll-up across an entire tree that an oxlint disable comment doesn't centralize. `packages/vitest/README.md`'s "Recommended lint and compiler configuration" section presents both, not one over the other.

## Consequences

**Positive**:

- A consumer gets real-time feedback on the LINT-01 violation instead of discovering it only when CI runs the shell script.
- No public npm package, so no semver promise this project cannot keep against an alpha upstream API — the exact risk the original deferral was trying to avoid, still avoided.
- Proven against real `oxlint` output (not just unit-tested visitor functions) via `scripts/verify-ref-state-oxlint-plugin.sh`, matching this project's established "prove it against real output, not just in-process assertions" discipline.

**Negative**:

- A vendored template has no dependency-bot update path — a consumer must manually re-copy the directory when this project's own copy changes. `scripts/templates/oxlint-ref-state/README.md` states this plainly, same as `tools/oxlint/effect/ATTRIBUTION.md` already does for the rules this repository itself vendors.
- Two enforcement routes for the same rule (shell script + oxlint plugin) means two places to keep in sync if `INV-EC-006`'s scope ever changes. Both derive from the same two regex-equivalent checks today; a future change updates both deliberately, not automatically.

**Trade-off accepted**: the risk of building on an alpha upstream API is accepted again here, on the same basis this project already accepted it once for `tools/oxlint/effect/` — vendoring, not publishing, is what makes that acceptable.

---

> **Correction (2026-09-04, same day, before this ADR was acted on downstream):** the Decision section above understated the parity with `tools/oxlint/effect/` — that directory isn't only vendored, it's also **dogfooded**: wired into this repository's own `.oxlintrc.json` and run against this repository's own source on every `pnpm lint`, on top of the standalone proof `scripts/verify-oxlint-plugin.sh` gives it. `ref-state-only` originally got only the standalone proof (`scripts/verify-ref-state-oxlint-plugin.sh`), not the continuous dogfooding — an asymmetry with no principled reason behind it, raised directly and closed the same day.
>
> `.oxlintrc.json` now carries a second `jsPlugins` entry (`{ "name": "effect-cucumber", "specifier": "./scripts/templates/oxlint-ref-state/index.ts" }`) and a second `overrides` block scoping `effect-cucumber/ref-state-only: "error"` to `packages/vitest/test/acceptance/**` — not global, since the rest of this repository's own source legitimately uses `let` and in-place mutation outside the INV-EC-006 boundary this rule polices. Run for real against this repository's own acceptance suite, it flagged exactly the four spots `scripts/verify-acceptance-ref-state.sh`'s existing `GATE-ALLOW-MUTATION` carve-outs already document (`packages/vitest/test/acceptance/pitfalls-checklist.test.ts`) — no false positives, no scope surprises — each now also marked with a paired `// oxlint-disable-next-line effect-cucumber/ref-state-only` comment alongside its existing `GATE-ALLOW-MUTATION` comment. The two gates (`verify-acceptance-ref-state.sh` and the oxlint rule) now run side by side over the identical directory, agreeing by construction since they check the same two regex-equivalent conditions.
>
> `scripts/verify-ref-state-oxlint-plugin.sh` stays exactly as it was — it proves something dogfooding alone cannot: that the template is genuinely self-contained and portable via a standalone probe config, independent of this repository's own `.oxlintrc.json`, which is the actual experience a consumer gets copying it fresh. Dogfooding and the standalone proof are complementary, not redundant.

---

> **Second correction (2026-09-04, same day):** the paragraph above's "flagged exactly the four spots `GATE-ALLOW-MUTATION` carve-outs already document" and the paired `oxlint-disable-next-line` comments it describes are superseded. Those four hits turned out to be a scope bug in `scripts/verify-acceptance-ref-state.sh` — `pitfalls-checklist.test.ts` was never a step module INV-EC-006 describes, and this repository's own `spec/traceability.md` already said so ("Not a pair"). Fixed by excluding it (and the same-shaped `negative-requirements.test.ts`) by name from both gates, not by suppressing — see [ADR-EC-043](043-ref-only-gate-excludes-framework-level-meta-tests.md) for the full root-cause analysis. No disable comments remain anywhere in the acceptance suite for this rule.
