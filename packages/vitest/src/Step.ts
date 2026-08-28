/**
 * The step-registration seam: turn whatever a test author passed to `Given`/`When`/`Then` into the
 * uniform `(...params) => Effect` shape the runner will execute.
 *
 * ADR-EC-005 gives a step body two accepted forms, and this module is the only place that tells
 * them apart. A bare generator function is auto-wrapped so the step text becomes the span name; an
 * already-wrapped function is accepted "unchanged" — read
 * [ADR-EC-005](../../../spec/decisions/005-effect-fn-for-step-and-hook-bodies.md) before changing
 * anything below, especially the reasoning behind the pass-through branch.
 *
 * Three things about this module are not visible from the code.
 *
 * (a) **The runtime discriminator is the ONLY thing separating correct from silently-wrong.** The
 *     two accepted forms are indistinguishable at the type level: Effect v4's `Effect.fn` overloads
 *     accept a generator body and an Effect-returning body alike, with no cast, so
 *     unconditionally wrapping both type-checks perfectly (RESEARCH.md Finding 7, reproduced). The
 *     damage from wrapping an already-wrapped function is not a compile error and not a test
 *     failure — it is a second span nested inside the author's own, with the step text appearing
 *     twice in every trace of that step. Nothing in the type system, the linter or the build can
 *     catch that. `test/Step.test.ts`'s reference-identity assertion is the only guard, and it is
 *     load-bearing rather than decorative.
 *
 * (b) **The step-function union below repeats `Dsl.ts`'s order instead of importing it, and the
 *     order is load-bearing in both places.** The generator branch MUST be listed first: with the
 *     Effect-returning branch first, TypeScript reports "a Generator is not an Effect" against a
 *     step that requires an unprovided service, and `@effect/tsgo` has no reason to read that shape
 *     mismatch as a context problem, so `effect(missingEffectContext)` stops firing while the step
 *     is still rejected and every test stays green. See `Dsl.ts` note (a) and RESEARCH.md Finding 2,
 *     which reproduced it across four permutations. The duplication is deliberate: aliasing the
 *     union into a shared exported type would make its member ORDER an implementation detail of a
 *     name, one edit away from being reordered by someone who never sees this constraint. Written
 *     out twice, each copy carries its own warning. If you change one, change the other.
 *
 * (c) **The wrap carries the bare step text and nothing else** (D-05). No span attributes are
 *     attached for a step's resolved `{int}`/`{string}` argument values; that is explicitly
 *     deferred out of this phase, not an omission to be helpfully filled in.
 *
 * `register` is internal. It is deliberately NOT re-exported from `packages/vitest/src/index.ts` —
 * `describeFeature`'s registrars are its only caller, and publishing it would freeze this seam into
 * the package's public contract. This follows `@effect-cucumber/gherkin`'s precedent, where
 * `Parser`/`Pickles`/`Correlate` are internal and only `loadFeature` is published.
 */
import * as Effect from "effect/Effect"

/**
 * Whether `f` is a bare generator function, and therefore still needs wrapping.
 *
 * A type predicate rather than a plain `boolean`, so the caller's two branches narrow to the two
 * union members without a cast — the check is the only evidence available, and saying so in the
 * type is more honest than asserting it away at the use site.
 *
 * `Object.prototype.toString` is the discriminator. The obvious alternative — sniffing the function's
 * own source text via `Function.prototype.toString` for a leading `function*` — is wrong twice over:
 * it does not survive minification, and it misses the async and method-shorthand spellings of a
 * generator. Both failures are silent, and both fail in the SAME direction: a real generator is
 * mistaken for an already-wrapped function, passed through unwrapped, and quietly loses its span.
 */
const isGeneratorFn = <Params extends ReadonlyArray<any>, A, E, R>(
  f:
    | ((...p: Params) => Effect.gen.Return<A, E, R>)
    | ((...p: Params) => Effect.Effect<A, E, R>)
): f is (...p: Params) => Effect.gen.Return<A, E, R> =>
  Object.prototype.toString.call(f) === "[object GeneratorFunction]"

/**
 * Normalise a step body registered under `pattern` into the `(...params) => Effect` shape.
 *
 * A bare generator is wrapped with the step text as its span name (ADR-EC-005), so a failure inside
 * the step is attributable to the step in a trace. An already-wrapped function is returned BY
 * IDENTITY — the same object, not a re-binding and not a wrapper closure.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
 *
 * @param pattern - the cucumber-expression source, used verbatim as the span name
 * @param fn - the step body; generator branch FIRST, per note (b)
 */
export const register = <Params extends ReadonlyArray<any>, A, E, R>(
  pattern: string,
  fn:
    | ((...p: Params) => Effect.gen.Return<A, E, R>)
    | ((...p: Params) => Effect.Effect<A, E, R>)
): (...p: Params) => Effect.Effect<A, E, R> =>
  // Do NOT simplify this to an unconditional wrap. It type-checks — that is precisely the trap
  // (note (a)) — and it double-spans every step an author already wrapped themselves.
  isGeneratorFn(fn) ? Effect.fn(pattern)(fn) : fn
