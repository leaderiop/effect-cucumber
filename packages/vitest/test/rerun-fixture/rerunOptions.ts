/**
 * Shared by all three `.steps.test.ts` files in this fixture: builds a `DescribeFeatureOptions`
 * fragment from environment variables, WITHOUT ever assigning `rerunManifestPath: undefined` on a
 * FRESH object literal — under `exactOptionalPropertyTypes`, that widens the field to a mandatory
 * `string | undefined`, which `DescribeFeatureOptions`'s own `rerunManifestPath?: string` rejects
 * (the identical shape of issue `VitestTestApi.ts`'s own `EmitOptions.tags` had, ADR-EC-038 §2).
 * `RERUN_MANIFEST_PATH` unset means "omit the key entirely" — exactly like the option being unset.
 */
import type { DescribeFeatureOptions } from "../../src/describeFeature.ts"

export const rerunOptionsFromEnv = (): DescribeFeatureOptions => ({
  rerunFailedOnly: process.env.RERUN_FAILED_ONLY === "1",
  ...(process.env.RERUN_MANIFEST_PATH !== undefined
    ? { rerunManifestPath: process.env.RERUN_MANIFEST_PATH }
    : {})
})
