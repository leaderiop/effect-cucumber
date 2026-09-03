---
"@effect-cucumber/vitest": minor
---

Add `scripts/templates/verify-consumer-ref-state.sh` (LINT-01): a copyable, generalized version of
this repository's own `scripts/verify-acceptance-ref-state.sh` for a consumer's own step modules.

Enforces the same rule ADR-EC-009/INV-EC-006 require of this repository's own acceptance suite: a
value one step hands a later step in the same Scenario must live in a `Ref` obtained from a
Layer-provided service, never a `let`/`var` closure variable or a module-scope array/object mutated
in place as a stand-in for one. `pnpm test` cannot catch a violation — it passes on a clean single
run and only leaks across a retry, a re-run, or a narrowed `-t` selection.

The step-modules directory/glob and the number of `GATE-ALLOW-MUTATION` carve-outs are CLI
arguments (or env vars) instead of hardcoded constants, and the positive control proving the regex
still matches a real declaration is a synthetic fixture generated on the fly rather than a path into
this repository's own source — the copy needs nothing about a consumer's module layout to run.
Documented in `packages/vitest/README.md`'s "Recommended lint and compiler configuration" section.
