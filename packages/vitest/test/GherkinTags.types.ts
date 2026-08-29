/**
 * The one claim `gherkinTags` makes that no runtime test can check: its result spreads directly into
 * a runner config's own `test.tags` array.
 *
 * That is the whole public promise of the helper. `GherkinTags.test.ts` proves WHICH tag names come
 * out of a `.feature` file; this file proves the SHAPE they come out in is the shape the config
 * expects, against the runner's real exported type rather than a copy of it. If
 * `TestTagDefinition` ever gains a required field, or `GherkinTagDefinition` ever loses `name`, the
 * spread below stops compiling — which is the only place that breakage would surface, since every
 * assertion in the runtime suite is about strings.
 *
 * The `.types.ts` suffix is load-bearing, following `packages/gherkin/test/StepArgs.types.ts`'s
 * precedent. vitest's default include glob is `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, so this file is
 * never collected as a suite — renaming it to `GherkinTags.test.ts` would make `pnpm test` fail
 * with "No test suite found". Meanwhile `packages/vitest/tsconfig.test.json` has
 * `include: ["src", "test"]`, so `pnpm typecheck:test` compiles it on every push. The file therefore
 * runs in CI without pretending to be a runtime suite.
 *
 * Nothing here may be widened with a type assertion: one `as` anywhere makes the assignment below
 * prove nothing.
 */
import type { TestTagDefinition } from "vitest/config"
import { gherkinTags } from "../src/GherkinTags.ts"

/**
 * The intended consumer call, verbatim, in a `vitest.config.ts`'s `test.tags` position.
 *
 * The annotation is what does the work — it is the runner's own array type, so this is an
 * assignability check against the real contract and not against anything this package declares. The
 * literal entry beside the spread is deliberate: it proves the two mix in one array literal, which
 * is how the helper is actually used (a consumer's own `@skip`/`@only` declarations sit alongside
 * the scanned ones) and is a stricter check than a bare spread, since TypeScript infers the array's
 * element type from every member.
 */
export const declaredTags: Array<TestTagDefinition> = [
  ...gherkinTags("features/**/*.feature"),
  { name: "@skip" },
  { name: "@only" }
]
