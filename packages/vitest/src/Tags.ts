/**
 * The reserved tag names and the registration-time tag filter — the two pure values every other
 * module in RUN-05's chain reads, and the ONLY definition of either in this package.
 *
 * `ParsedScenario.tags` arrives from `@effect-cucumber/gherkin` already flattened by `compile()` in
 * feature → rule → scenario → examples order, with the literal `@` prefixes retained
 * (`packages/gherkin/src/Model.ts`'s own field comment: "Do not recompute inheritance"). Nothing
 * here parses, splits, normalises or re-derives a tag. This module answers exactly two questions
 * about an already-built tag array: is this Scenario reserved-`@skip`, and does this Scenario
 * survive the caller's `includeTags`/`excludeTags` filter.
 *
 * Four things about this module are not visible from the code.
 *
 * (a) **This is a module and not a private helper inside `Runner.ts`.** Two independent reasons, and
 *     either alone is sufficient. `spec/traceability.md` §1's row for behavior doc 02 already names
 *     `packages/vitest/src/Tags.ts` as this behavior's source module — the row predates the file, so
 *     creating it satisfies the matrix as written rather than requiring the matrix to be edited to
 *     match wherever the code happened to land. And `TestApi.ts`'s closing paragraph forbids any
 *     runtime value at all in that file ("no `const`, no function, no runtime value"), so the seam
 *     module — the other place a tag predicate might plausibly go, since tags end up in a framework
 *     option object — cannot hold it. `ScenarioKey.ts` is the precedent for a leaf that exists so two
 *     stages can agree on one encoding without either importing the other.
 *
 * (b) **An empty array means NO FILTER, never "match nothing".** `undefined` and `[]` are treated
 *     identically by `makeTagFilter`, and `shouldEmit` treats an empty `include` as "every Scenario
 *     passes the include half". This is 09-CONTEXT.md's resolved "Empty-array filter semantics"
 *     bullet, and the reason is a failure mode rather than a taste: a consumer computing
 *     `excludeTags` from a variable — an environment flag, a `.filter()` over some list — that
 *     happens to come out empty must get their whole suite back, not silence, and `includeTags: []`
 *     read as "match nothing" would delete an entire suite from existence behind a GREEN run, since
 *     D-03 makes an excluded Scenario never become a test node at all. Zero tests emitted and zero
 *     tests failed look the same to a reporter. `describeFeature.ts`'s `scenarioLayers` field comment
 *     sets the precedent for writing an absence down as the contract instead of leaving it to read as
 *     an optimisation.
 *
 * (c) **`onlyTag` is deliberately inert, and has a named constant anyway.** NOTHING in this package
 *     branches on it: D-06 makes `@only` a plain pass-through tag, never routed to the test
 *     framework's `only` mode, because that mode fails a CI run by design. The constant exists so the
 *     omission is recorded in the source rather than inferred from the absence of a branch — the same
 *     reason `Errors.ts`'s notes and `TestApi.ts` note (b) write down what was left out. Running a
 *     single Scenario locally is a caller-side `--tagsFilter '@only'` choice (ADR-EC-020), which is
 *     why the `@` prefix is part of the constant's value: that is the string the CLI has to match.
 *
 * (d) **This module is INTERNAL and is not re-exported from `packages/vitest/src/index.ts`.** A test
 *     author writes tags in a `.feature` file and passes `includeTags`/`excludeTags` as plain string
 *     arrays to `describeFeature`; they never construct a `TagFilter` or call `shouldEmit`. Plan 09-07
 *     owns whatever barrel decision this phase ends up needing — nothing here should be added to
 *     `index.ts` ahead of that plan. `Registry.ts`, `TestApi.ts`, `Plan.ts`, `Runner.ts` and
 *     `ScenarioKey.ts` all set the same precedent, and `Errors.ts`'s closing paragraph is the
 *     convention being followed.
 *
 * This module imports NOTHING — no test framework, no `effect/*`, no local module — and must stay
 * that way. It is a leaf precisely so that `Plan.ts`, `Runner.ts` and `describeFeature.ts` can each
 * reach it without regard to the Register → Plan → Emit direction the rest of the package's edges
 * follow, exactly as `ScenarioKey.ts` does.
 */

/**
 * The one reserved tag with behavior: a Scenario carrying it is emitted as a SKIPPED test, not
 * omitted (D-05). `isSkipped` is the only reader.
 *
 * The literal `@` prefix is part of the value and is not stripped anywhere — D-04 makes the prefix
 * the contract, because it is what a `--tagsFilter '@skip'` invocation has to match and what
 * `ParsedScenario.tags` actually contains.
 */
export const skipTag = "@skip"

/**
 * The other reserved tag — reserved, named, and deliberately INERT. See note (c): `@only` is emitted
 * as a plain tag and is never routed to the framework's `only` mode, which fails a CI run by design
 * (D-06). Nothing in this package branches on this constant; it records the decision.
 */
export const onlyTag = "@only"

/**
 * A normalised registration-time tag filter: two required arrays, both possibly empty, where empty
 * means "this half filters nothing" — note (b).
 *
 * Both fields are required so that a consumer of this type cannot forget one, and so `Runner.ts` and
 * `describeFeature.ts` can declare a `TagFilter` parameter REQUIRED rather than optional. Build one
 * with `makeTagFilter` from the two optional public options, or use `noTagFilter`.
 */
export interface TagFilter {
  /** Emit a Scenario only if it carries at least one of these. Empty means every Scenario passes. */
  readonly include: ReadonlyArray<string>
  /** Do not emit a Scenario carrying any of these. Empty means no Scenario is excluded. */
  readonly exclude: ReadonlyArray<string>
}

/**
 * The "no filter at all" sentinel — every Scenario survives it.
 *
 * It exists so a caller that filters nothing passes a NAMED value rather than an optional argument
 * they might simply have forgotten, which lets the filter parameter be required at every call site
 * that takes one. `Hook.ts`'s `emptyHookSet` is the precedent, including its safety argument: both
 * fields are `ReadonlyArray`s and nothing in this package mutates a `TagFilter` in place, so no
 * consumer can observe another consumer's use of this shared value.
 */
export const noTagFilter: TagFilter = {
  include: [],
  exclude: []
}

/**
 * Normalise the two OPTIONAL public options into the required `TagFilter` the rest of the phase
 * passes around.
 *
 * `undefined` and `[]` are the same input and both mean NO FILTER for that half — note (b). This is
 * the single most plausible thing to "tighten" into `includeTags: []` meaning "match nothing", and it
 * must not be: a caller computing either array from a variable that happens to come out empty would
 * then have their whole suite deleted from existence behind a green run, because D-03 makes a
 * filtered-out Scenario never become a test node at all. A suite that emits zero tests and a suite in
 * which zero tests failed are indistinguishable in a reporter.
 *
 * No de-duplication and no sorting: `shouldEmit` uses set semantics (`includes`/`some`), so a
 * repeated entry is already inert and normalising it away would only hide what the caller wrote.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
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
 * Whether a Scenario carrying `tags` should be REGISTERED at all (D-03) — `true` to emit it, `false`
 * to skip emission entirely, as if the Scenario were absent from the `.feature` file.
 *
 * A Scenario must survive BOTH halves:
 *
 * - the INCLUDE half passes when `filter.include` is empty (note (b)) or the Scenario carries at
 *   least one included tag;
 * - the EXCLUDE half passes when the Scenario carries NONE of the excluded tags.
 *
 * EXCLUDE WINS a conflict. A tag named in both arrays excludes the Scenarios carrying it, because the
 * exclude half is evaluated as its own conjunct rather than as a fallback — an author writing the
 * same tag into both lists has contradicted themselves, and the safe reading of a contradiction is
 * the one that runs fewer tests than expected (visible in a test count) rather than more.
 *
 * Set semantics via `includes`/`some`, deliberately: `ParsedScenario.tags` is a flattened
 * inheritance chain, so a tag written on BOTH a Feature and one of its Scenarios appears in that
 * array TWICE. Anything counting occurrences rather than testing membership would treat that
 * perfectly ordinary document differently from the identical one that wrote the tag once.
 *
 * Matching is exact-string and CASE-SENSITIVE, the Cucumber tag convention. No case-insensitive or
 * prefix matching was requested (09-CONTEXT.md, Claude's Discretion), and adding either would make
 * `@Skip` and `@skip` — or `@wip` and `@wip-only` — silently interchangeable, which is a filter
 * quietly matching more than the author wrote.
 *
 * @param filter - a normalised filter from `makeTagFilter`, or `noTagFilter`
 * @param tags - the Scenario's fully flattened `ParsedScenario.tags`, `@` prefixes intact
 */
export const shouldEmit = (filter: TagFilter, tags: ReadonlyArray<string>): boolean =>
  (filter.include.length === 0 || filter.include.some((tag) => tags.includes(tag))) &&
  !filter.exclude.some((tag) => tags.includes(tag))

/**
 * Whether a Scenario carrying `tags` is reserved-`@skip` (D-05).
 *
 * Exact-string, case-sensitive membership, for `shouldEmit`'s reason above: `@Skip` is NOT `@skip`,
 * and `@skipped` is not `@skip` either — both are ordinary pass-through tags (D-07). A prefix or
 * case-insensitive test here would make a Feature author's unrelated tag silently disable their
 * Scenario.
 *
 * This is the only predicate in this package that treats a tag specially at all; every tag other than
 * the two constants above is a plain pass-through with no library-defined behavior beyond being
 * filterable (D-07).
 *
 * @param tags - the Scenario's fully flattened `ParsedScenario.tags`, `@` prefixes intact
 */
export const isSkipped = (tags: ReadonlyArray<string>): boolean => tags.includes(skipTag)
