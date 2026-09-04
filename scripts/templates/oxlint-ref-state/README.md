# LINT-01: a real oxlint rule for cross-step Scenario state

Enforces the same rule as [`scripts/templates/verify-consumer-ref-state.sh`](../verify-consumer-ref-state.sh)
— cross-step Scenario data must live in a `Ref` obtained from a Layer-provided service, never a
closure variable or an in-place mutation — but as a real, editor-integrated oxlint rule instead of
a CI-time shell script. See `packages/vitest/README.md`'s "Recommended lint and compiler
configuration" section for the full rationale (INV-EC-006).

## Why this exists as a copyable directory, not a published npm package

Same reason `tools/oxlint/effect/` in this repository exists as a vendored directory rather than a
dependency: oxlint's JS/TS custom-plugin API (`jsPlugins`) is still alpha upstream in the `oxc`
project. Effect's own equivalent tooling — `@effect/oxc`, vendored into `tools/oxlint/effect/` —
is `"private": true` in the Effect monorepo and has never been published to npm; it is loaded
there via a local-path `jsPlugins` entry, exactly the pattern below. This directory follows that
same precedent for `effect-cucumber`'s own rule: the API is stable enough to depend on directly
(this repo has run `tools/oxlint/effect/` in its own CI since Phase 0, and this directory's own
`scripts/verify-ref-state-oxlint-plugin.sh` proves this rule too), but not stable enough to promise
semver compatibility to a package other people's CI depends on. Vendoring sidesteps that promise
entirely — you own the copy, so an upstream API change only affects you when you choose to
resync.

## How to adopt it

1. Copy this whole directory into your own repository, e.g. `tools/oxlint/effect-cucumber/`.
2. Point your own `.oxlintrc.json` at it:

   ```jsonc
   // .oxlintrc.json
   "jsPlugins": [
     { "name": "effect-cucumber", "specifier": "./tools/oxlint/effect-cucumber/index.ts" }
   ],
   "rules": {
     "effect-cucumber/ref-state-only": "error"
   }
   ```

   If you also run the vendored Effect rules (`tools/oxlint/effect/`, see this repository's own
   `packages/vitest/README.md` for that separate recommendation), both entries coexist in the same
   `jsPlugins` array — they use different plugin `name`s (`"effect"` vs `"effect-cucumber"`) so
   their rule IDs never collide.

3. Scope it to your own step modules only, the same way `verify-consumer-ref-state.sh` takes a
   directory argument — oxlint's `overrides` does this per-glob:

   ```jsonc
   "overrides": [
     {
       "files": ["features/**/*.steps.test.ts"],
       "rules": { "effect-cucumber/ref-state-only": "error" }
     }
   ]
   ```

   Leaving it in the top-level `rules` block instead applies it everywhere, which will flag `let`
   and array mutation in ordinary application code that has nothing to do with a Scenario — the
   rule has no way to know it's looking at a step module unless your config tells it via `files`.

4. A deliberate, function-local mutation (an array built fresh inside a factory, never shared
   across steps) is the one case this rule cannot distinguish from a real leak by itself — same
   limitation `verify-consumer-ref-state.sh`'s `GATE-ALLOW-MUTATION` marker exists for. Suppress
   that one line with a standard oxlint disable comment and a reason, e.g.:

   ```ts
   // oxlint-disable-next-line effect-cucumber/ref-state-only -- fresh local buffer, never shared across steps
   buffer.push(chunk)
   ```

## Keeping the shell-script route too

Both routes enforce the same thing and can run side by side without conflict — the oxlint rule
gives inline editor feedback and fails fast at author time, the shell script's carve-out audit
(`scripts/templates/verify-consumer-ref-state.sh`'s printed `GATE-ALLOW-MUTATION` count) gives a
CI-time roll-up of every suppression in the tree, which an oxlint disable comment doesn't
centralize on its own. Neither supersedes the other; adopt whichever fits your pipeline, or both.

## Updating

There is no dependency-bot path for a vendored rule. Re-copy this directory from
`effect-cucumber`'s own `scripts/templates/oxlint-ref-state/` when a new `@effect-cucumber/vitest`
release notes a change to `ref-state-only.ts`.
