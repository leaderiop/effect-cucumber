/**
 * SPIKE (issue #34) end-to-end demo: registers 3 Scenarios through the `describeFeature.rerun.ts`
 * copy, ONE of which fails deliberately whenever `SPIKE_RERUN_FAIL=1` (unset — the default, e.g.
 * under a plain `pnpm test` — it passes trivially, so this file is harmless in the normal suite),
 * and logs which Scenarios actually got REGISTERED+RUN to `SPIKE_RERUN_EXEC_LOG` so the driving
 * shell commands can assert on registration counts, not just pass/fail counts. See
 * research/rerun-failed-only-spike.md for the full write-up and the real `vitest run` output this
 * proved out.
 */
import { assert } from "@effect/vitest"
import * as Layer from "effect/Layer"
import * as fs from "node:fs"
import { fileURLToPath } from "node:url"
import { describeFeature } from "./describeFeature.rerun.ts"
import { loadFeature } from "../../src/loadFeature.ts"

const featurePath = fileURLToPath(new URL("./rerun-demo.feature", import.meta.url))
const feature = await loadFeature(featurePath)

const execLogPath = process.env.SPIKE_RERUN_EXEC_LOG
const logExecuted = (label: string): void => {
  if (execLogPath !== undefined) {
    fs.appendFileSync(execLogPath, `${label}\n`, "utf8")
  }
}

const rerunFailedOnly = process.env.SPIKE_RERUN_ENABLE === "1"
const rerunManifestPath = process.env.SPIKE_RERUN_MANIFEST

describeFeature(feature, Layer.empty, ({ Given, Scenario, Then }) => {
  Given("scenario A runs", function*() {
    logExecuted("A")
  })
  Given("scenario B runs", function*() {
    logExecuted("B")
  })
  Given("scenario C runs", function*() {
    logExecuted("C")
  })
  Then("it passes", function*() {
    assert.isTrue(true)
  })
  Then("it deliberately fails", function*() {
    if (process.env.SPIKE_RERUN_FAIL === "1") {
      assert.strictEqual(1, 2)
    } else {
      assert.isTrue(true)
    }
  })

  Scenario("Scenario A passes", () => {})
  Scenario("Scenario B fails", () => {})
  Scenario("Scenario C passes", () => {})
}, {
  rerunFailedOnly,
  ...(rerunManifestPath === undefined ? {} : { rerunManifestPath })
})
