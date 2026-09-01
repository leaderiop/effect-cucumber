/**
 * The one tag universe, shared by the root `vitest.config.ts` and `packages/vitest/vitest.config.ts`.
 *
 * The helper is imported from `./packages/vitest/src/GherkinTags.ts`, the concrete module, and
 * deliberately NOT from the `@effect-cucumber/vitest` barrel: that barrel re-exports
 * `describeFeature.ts`, which imports `@effect/vitest`, and a config file is loaded outside any
 * test context. `GherkinTags.ts` is a leaf whose only imports are `node:fs`, `node:path` and
 * `tinyglobby`, which is what makes it safe to reach from here. The root config's notes (d) and
 * (e) explain every hand-written entry below and the reserved `@undeclared-on-purpose` tag that
 * must never join them.
 */
import { gherkinTags } from "./packages/vitest/src/GherkinTags.ts"

/**
 * The hand-written half of the tag universe. These WIN a name collision against the derived half,
 * so a tag that appears in both places keeps whatever this entry says about it rather than being
 * flattened to a bare `{ name }`.
 */
export const declaredByHand = [
  { name: "@skip" },
  { name: "@only" },
  { name: "@slow" },
  { name: "@wip" },
  { name: "@featuretag" },
  { name: "@ruletag" },
  { name: "@scenariotag" },
  { name: "@exampletag" }
]

/**
 * The whole universe for a run rooted at `repositoryRoot`: the hand-written half plus every tag any
 * acceptance `.feature` file carries, read from the files themselves and de-duplicated by `name`
 * against the hand-written half. `packages/vitest/test/acceptance/` is the only directory in the
 * repository whose `.feature` files may carry an acceptance tag (`spec/scripts/verify-traceability.sh`
 * check 4). Passing the root as `cwd` is what makes the list independent of `process.cwd()`.
 */
export const declaredTags = (repositoryRoot: string): ReadonlyArray<{ readonly name: string }> => {
  const derived = gherkinTags("packages/vitest/test/acceptance/**/*.feature", { cwd: repositoryRoot })
    .filter((entry) => !declaredByHand.some((hand) => hand.name === entry.name))
  return [...declaredByHand, ...derived]
}
