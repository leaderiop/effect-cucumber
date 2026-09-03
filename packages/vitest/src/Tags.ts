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
