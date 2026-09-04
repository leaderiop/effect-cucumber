/**
 * A STANDALONE config, used ONLY by `scripts/verify-concurrent-execution.sh` via `--config`. Both
 * the root `vitest.config.ts` and `packages/vitest/vitest.config.ts` deliberately EXCLUDE this whole
 * directory from the normal run — `failing-beforeall.steps.test.ts` fails on purpose, and this is
 * also the ONE place in the repository that opts into `sequence.concurrent: true`, which every other
 * suite deliberately does NOT (BEH-EC-002's document-order guarantee is a claim about a Feature's
 * OWN Scenario ordering, orthogonal to whether two Scenarios' fibers may run concurrently, but
 * flipping it on repo-wide would be a real, unnecessary change of posture for suites that don't need
 * it). `sequence.concurrent: true` is how a consumer opts a Feature's emitted Scenarios into
 * concurrent execution with this DSL (ADR-EC-040) — `describeFeature` itself never sets
 * `concurrent: false` on the blocks/tests it emits, so this ordinary vitest config option is all it
 * takes.
 */
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.steps.test.ts"],
    sequence: { concurrent: true }
    // Deliberately no `tags:` declaration here — this fixture never needs one. `@timeout-<ms>`'s
    // HYPHEN suffix (rather than the parenthesised `@timeout(<ms>)` shape this tag started with) is
    // itself the fix for a real problem discovered while building this exact fixture: a
    // parenthesised tag name is rejected by vitest's own `test.tags` config with a hard STARTUP
    // error ("Tag name ... is invalid. Tag names cannot contain ... '(', or ')'"), and this
    // repository's own `vitest.tags.ts` unconditionally scans and declares every tag any acceptance
    // `.feature` file carries — so a parenthesised form would have broken `vitest.config.ts` load for
    // the WHOLE repository, not merely this fixture (ADR-EC-040).
  }
})
