---
"@effect-cucumber/vitest": minor
---

Add `scripts/templates/oxlint-ref-state/` (LINT-01): a copyable, real oxlint `jsPlugins` rule
(`ref-state-only`) enforcing the same INV-EC-006/ADR-EC-009 rule
`scripts/templates/verify-consumer-ref-state.sh` already enforces at CI time — a value one step
hands a later step in the same Scenario must live in a `Ref` obtained from a Layer-provided
service, never a `let`/`var` closure variable or a module-scope array/object mutated in place.

Not published to npm — same distribution model as this repository's own vendored
`tools/oxlint/effect/` rules, and as Effect's own unpublished `@effect/oxc` those were vendored
from (see ADR-EC-042): copy the directory into your own repository and wire it into your own
`.oxlintrc.json`'s `jsPlugins`. Gives inline, author-time editor feedback the shell-script route
can't; the shell script's carve-out roll-up stays useful too, and the two coexist rather than one
replacing the other. Documented in `packages/vitest/README.md`'s "Recommended lint and compiler
configuration" section, alongside `scripts/templates/oxlint-ref-state/README.md`'s own adoption
steps.
