/**
 * ADR-EC-040's real cross-run proof, half 2 — BEH-EC-017's "if BeforeAllScenarios fails, that SAME
 * failure is reported by EVERY Scenario individually, not by a single Feature-level failure with
 * zero Scenario results" guarantee, proven under REAL concurrent execution
 * (`sequence.concurrent: true`, this fixture's own `vitest.config.ts`), not merely sequential.
 * `scripts/verify-concurrent-execution.sh` asserts, from the real `--reporter=json` output, that
 * BOTH Scenarios below appear as two individually FAILED assertion results carrying the identical
 * message — never vitest's own "one suite failure, every sibling skipped" shape, which is exactly
 * what a real `beforeAll` that itself THROWS would produce (the naive version of this fix, rejected
 * by the ADR in favor of capturing the Exit instead).
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

const featurePath = fileURLToPath(new URL("./failing-beforeall.feature", import.meta.url))
const feature = await loadFeature(featurePath)

describeFeature(feature, Layer.empty, ({ BeforeAllScenarios, When }) => {
  BeforeAllScenarios(function*() {
    yield* Effect.fail("BeforeAllScenarios blew up (deliberate, ADR-EC-040 proof)")
  })

  When("nothing happens", function*() {
    yield* Effect.void
  })
})
