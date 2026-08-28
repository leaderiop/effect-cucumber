import * as Effect from "effect/Effect"

// Valid TypeScript. Rejected only by @effect/tsgo.
export const run = (): void => {
  Effect.sync(() => 1)
}
