/**
 * The composite key a Scenario's own extra Layer is recorded under, and the ONLY definition of that
 * encoding in this package.
 *
 * `describeFeature.ts` WRITES `FeatureCollection.scenarioLayers` under this key at registration time;
 * `Runner.ts` READS it back at emission time. Both sides must agree byte-for-byte, and a `Map` gives
 * no help if they do not — a mismatched encoding is a silent `undefined`, which both sides then treat
 * as "this Scenario asked for no extra Layer of its own". Every Scenario-level Layer in the document
 * would be dropped, every service would still resolve (the ambient Layer provides the rest), and no
 * test that only checks a Layer's SERVICES would go red.
 *
 * That is the whole reason this two-line function is a module rather than a private helper in each
 * file. `Runner.ts` cannot import `describeFeature.ts` — `describeFeature.ts` already imports
 * `emitFeature`, so the edge back would close a cycle and fail `pnpm circular` — so the only two ways
 * to have both sides build the key are a shared leaf like this one, or two independently-written
 * copies. Two copies compile, type-check and lint while disagreeing, which is exactly the failure
 * above.
 *
 * This module imports NOTHING, and must stay that way: it is a leaf precisely so that every module
 * needing the encoding can reach it without regard to the Register → Plan → Emit direction the rest of
 * the package's edges follow.
 *
 * Not re-exported from `packages/vitest/src/index.ts` — the key is an internal join between two
 * stages of `describeFeature`, not something a test author names. `Hook.ts` note (e), `Registry.ts`
 * and `Plan.ts` all set the same precedent.
 *
 * Three things about the encoding are not visible from the code.
 *
 * (a) **The pair `(ruleId, name)` and never the name alone.** `packages/gherkin/src/Validate.ts`'s
 *     `uniquenessKey` is mirrored here deliberately, including its own note's argument: F22 makes a
 *     Scenario name unique PER SCOPE and no further, and its
 *     `duplicate-scenario-name-across-rules.feature` fixture is the executable proof that two Rules
 *     may each legally contain a `Scenario: happy path`. A name-keyed map would let one of them
 *     silently overwrite the other's entry, and the loser would then run against a Layer built for a
 *     DIFFERENT Scenario — a wrong service, not a missing one, so nothing fails loudly.
 *
 * (b) **NUL as the separator, not a space, a slash or a dash.** A `ParsedRule.id` is
 *     generator-produced digits, but `describeFeature.ts`'s `resolveRuleId` also produces an
 *     `unregistered-rule:${name}` sentinel, which carries an author-written Rule NAME and can
 *     therefore contain any printable character. With a printable separator the encoding of the pair
 *     stops being unambiguous the moment such a name contains it; with NUL it cannot, because neither
 *     half can contain a NUL. `Validate.ts`'s own note makes the identical argument on its side.
 *
 * (c) **`name` is the UN-INTERPOLATED AST name on the reading side.** `describeFeature.ts` writes the
 *     key from the string the author passed to `Scenario(...)`, which is the AST name by definition;
 *     `Runner.ts` must therefore read it back with `ScenarioPlan.astName` and never with
 *     `ScenarioPlan.name`. A Scenario Outline's rows share ONE `Scenario(...)` registration and
 *     therefore ONE entry, so keying the lookup on the interpolated Pickle name would miss on every
 *     Outline row while hitting on every plain Scenario — where the two strings are equal, which is
 *     every other fixture in the repo. `Runner.ts` note (d) and `Plan.ts` note (c) record the same
 *     trap from their own sides.
 */

/**
 * Encode the pair `(ruleId, name)` as one string — see notes (a), (b) and (c).
 *
 * @param ruleId - the enclosing Rule's id, or `null` for a Scenario declared at Feature level
 * @param name - the UN-INTERPOLATED Scenario name, i.e. what the author passed to `Scenario(...)`
 */
export const scenarioKey = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"}\u0000${name}`
