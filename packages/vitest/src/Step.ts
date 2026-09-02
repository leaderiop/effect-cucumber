/**
 * Normalises a step body: a bare generator is wrapped with `Effect.fn(pattern)`; an already-wrapped
 * body is returned BY IDENTITY. Wrapping unconditionally type-checks and double-spans every
 * already-wrapped step, which only a reference-identity assertion notices (`test/Step.test.ts`).
 */
import * as Effect from "effect/Effect"

const isGeneratorFn = <Params extends ReadonlyArray<any>, A, E, R>(
  f:
    | ((...p: Params) => Effect.gen.Return<A, E, R>)
    | ((...p: Params) => Effect.Effect<A, E, R>)
): f is (...p: Params) => Effect.gen.Return<A, E, R> =>
  Object.prototype.toString.call(f) === "[object GeneratorFunction]"

/**
 * Normalise a step body registered under `pattern` into the `(...params) => Effect` shape.
 *
 * @param pattern - the cucumber-expression source, used verbatim as the span name
 */
export const register = <Params extends ReadonlyArray<any>, A, E, R>(
  pattern: string,
  fn:
    | ((...p: Params) => Effect.gen.Return<A, E, R>)
    | ((...p: Params) => Effect.Effect<A, E, R>)
): (...p: Params) => Effect.Effect<A, E, R> =>
  // Do NOT simplify this to an unconditional wrap.
  isGeneratorFn(fn) ? Effect.fn(pattern)(fn) : fn
