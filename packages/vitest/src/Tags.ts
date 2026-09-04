/**
 * Reserved tags (`@skip`, `@only`, `@retry`) and the registration-time filter. `undefined` and `[]`
 * both mean no filter; where a tag is in both lists, exclude wins (BEH-EC-008, `test/Tags.test.ts`).
 */

/**
 * `isSkipped` is the only reader.
 */
export const skipTag = "@skip"

/**
 * The other reserved tag — reserved, named, and deliberately INERT.
 */
export const onlyTag = "@only"

/**
 * A Scenario carrying this tag is wrapped in `@effect/vitest`'s `flakyTest` at the `TestApi` seam
 * (ADR-EC-034, BEH-EC-026): `scoped → sandbox → retry(recurs(10), 30s cap) → orDie`, fixed at
 * `flakyTest`'s own defaults — no numeric parameter, consistent with `@skip`/`@only` carrying none.
 * `isRetried` is the only reader.
 */
export const retryTag = "@retry"

/**
 * `@timeout-<positive integer milliseconds>` — this Scenario's own real `it.effect` timeout,
 * reaching `@effect/vitest`'s real `TestOptions.timeout` at the `VitestTestApi.ts` seam
 * (ADR-EC-040, BEH-EC-032). Unlike every other reserved tag above, this one carries a REQUIRED
 * numeric parameter — the only reserved tag that does — because without it every Scenario in a
 * Feature is stuck sharing the Feature's one `testTimeout`, which is exactly what makes concurrent
 * Scenario execution (heterogeneous per-Scenario budgets) useless without it.
 *
 * The parameter is a HYPHEN suffix (`@timeout-5000`), not a parenthesised call (`@timeout(5000)`,
 * the shape this tag started with in design) — a real constraint discovered only by actually trying
 * to use the parenthesised form inside this repository's own acceptance suite (ADR-EC-040): vitest's
 * own `test.tags` config declaration rejects a tag NAME containing `(`/`)` with a hard startup error,
 * not a warning ("Tag name ... is invalid. Tag names cannot contain ... '(', or ')'"), and this
 * repository's `vitest.tags.ts` unconditionally scans and declares every tag any acceptance
 * `.feature` file carries — so a parenthesised `@timeout(...)` tag anywhere under
 * `packages/vitest/test/acceptance/` would have broken `vitest.config.ts` LOAD for the whole repo,
 * not merely degraded gracefully the way an undeclared tag does elsewhere. The hyphen form avoids
 * every character vitest's own tag-name grammar forbids (`!`, `*`, `&`, `|`, `(`, `)`).
 * `readScenarioTimeoutTag` is the only reader.
 */
const timeoutTagPattern = /^@timeout-(\d+)$/

/**
 * Read this Scenario's own `@timeout-<ms>` override, or `null` for "no override — let the Feature's
 * `testTimeout` apply, the same as every Scenario today." `tags` is the Scenario's already-flattened,
 * inherited tag list (Feature, Rule, Scenario, Examples, in that order — ADR-EC-026), so a tag
 * declared closer to the Scenario itself (its own tag, or an Examples-row tag on an Outline) is
 * LATER in the array than one inherited from its Feature/Rule — this function keeps the LAST
 * matching occurrence, so the most specific declaration wins over an inherited default.
 *
 * A tag that merely LOOKS like an attempt at this reserved tag — `@timeout` with no suffix, a
 * non-numeric or non-positive parameter — is a loud, located, registration-time throw rather than a
 * silent fall-through to "no override": the same "fail loudly rather than degrade unnoticed" posture
 * ADR-EC-019/ADR-EC-039 already established, because a consumer whose mistyped timeout silently had
 * no effect would have no way to discover it short of reading this source.
 */
export const readScenarioTimeoutTag = (tags: ReadonlyArray<string>): number | null => {
  let found: number | null = null
  for (const tag of tags) {
    if (!tag.startsWith("@timeout")) {
      continue
    }
    const match = timeoutTagPattern.exec(tag)
    if (match === null) {
      throw new Error(
        `Malformed @timeout tag ${
          JSON.stringify(tag)
        }: expected the exact shape "@timeout-<positive integer milliseconds>", e.g. "@timeout-5000".`
      )
    }
    const milliseconds = Number(match[1])
    if (milliseconds <= 0) {
      throw new Error(
        `Malformed @timeout tag ${JSON.stringify(tag)}: milliseconds must be a positive integer, got ${milliseconds}.`
      )
    }
    found = milliseconds
  }
  return found
}

export interface TagFilter {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
}

/**
 * The "no filter at all" sentinel — every Scenario survives it.
 */
export const noTagFilter: TagFilter = {
  include: [],
  exclude: []
}

/**
 * Normalise the two OPTIONAL public options into the required `TagFilter` the rest of the phase
 * passes around.
 *
 * @param options - the consumer's own `includeTags`/`excludeTags`, either or both absent
 */
export const makeTagFilter = (options: {
  readonly includeTags?: ReadonlyArray<string> | undefined
  readonly excludeTags?: ReadonlyArray<string> | undefined
}): TagFilter => ({
  include: options.includeTags ?? [],
  exclude: options.excludeTags ?? []
})

/**
 * @param filter - a normalised filter from `makeTagFilter`, or `noTagFilter`
 * @param tags - the Scenario's fully flattened `ParsedScenario.tags`, `@` prefixes intact
 */
export const shouldEmit = (filter: TagFilter, tags: ReadonlyArray<string>): boolean =>
  (filter.include.length === 0 || filter.include.some((tag) => tags.includes(tag))) &&
  !filter.exclude.some((tag) => tags.includes(tag))

/**
 * @param tags - the Scenario's fully flattened `ParsedScenario.tags`, `@` prefixes intact
 */
export const isSkipped = (tags: ReadonlyArray<string>): boolean => tags.includes(skipTag)

/**
 * @param tags - the Scenario's fully flattened `ParsedScenario.tags`, `@` prefixes intact
 */
export const isRetried = (tags: ReadonlyArray<string>): boolean => tags.includes(retryTag)
