# Research: `@effect/vitest`'s actual v4-rc API surface

> Resolves GitHub issue [#4](https://github.com/leaderiop/effect-cucumber/issues/4)
> (child of the wayfinder map, issue #1).

## Method

Installed the actual packages in a throwaway scratch directory outside this
repo (`/tmp/effect-v4-research`, not committed) and read the installed
`.d.ts`/`.ts` source directly, then wrote real `.ts` files exercising each
assumed API shape and type-checked them with `tsc --noEmit` against the
installed types (TypeScript 7.0.2). One file was also actually executed with
`vitest run` for runtime confirmation.

Versions checked (via `npm view <pkg> dist-tags`, 2026-08-28 — `rc` had not
moved past what the map's Notes cite):

- `effect@4.0.0-rc.112` (`rc` dist-tag; `beta` dist-tag is `4.0.0-beta.107`, older/less current — `rc` is correct)
- `@effect/vitest@4.0.0-rc.112`
- `vitest@4.1.11` (`latest`; satisfies `@effect/vitest@rc`'s peer range `>=4.1.0 <5.0.0`)

All five items below **MATCH** the specs' assumptions — no conflicts found.

---

## 1. `it.effect`, `it.effect.skip`, `it.effect.only`

**Verifies:** ADR-EC-004 (`spec/decisions/004-one-it-effect-per-scenario.md`), ADR-EC-012.

**Assumption:** `it.effect(name, () => Effect.gen(...))` exists, runs one Scenario as
one vitest test, and gets `TestClock`/`TestConsole`/a fresh `Scope` automatically;
`.skip`/`.only` modifiers exist the way plain vitest `it.skip`/`it.only` do.

**Found:** `node_modules/@effect/vitest/src/index.ts`:

```ts
export const effect: Vitest.Tester<Scope.Scope> = internal.effect

export interface Tester<R> extends Vitest.Test<R> {
  skip: Vitest.Test<R>
  skipIf: (condition: unknown) => Vitest.Test<R>
  runIf: (condition: unknown) => Vitest.Test<R>
  only: Vitest.Test<R>
  each: <T>(cases: ReadonlyArray<T>) => ...
  fails: Vitest.Test<R>
  prop: ...
}

export interface Test<R> {
  <A, E>(
    name: string,
    self: TestFunction<A, E, R, [V.TestContext]>,
    timeout?: number | V.TestOptions
  ): void
}
```

So `it.effect: Tester<Scope.Scope>` — `Scope.Scope` is baked into the
requirement type automatically (confirming the "fresh `Scope` closed at test
end" claim), and `.skip`/`.only`/`.skipIf`/`.runIf`/`.each`/`.fails`/`.prop`
all exist as siblings with the same `(name, effectFn, timeout?)` signature.

Wrote and type-checked (`tsc --noEmit`, zero errors) and ran with
`vitest run` (passed at runtime):

```ts
it.effect("basic effect test", () => Effect.gen(function* () { ... }))
it.effect.skip("skipped effect test", () => Effect.gen(function* () { ... }))
it.effect.only("only effect test", () => Effect.gen(function* () { ... }))
```

**Verdict: MATCH.** Exact shape ADR-EC-004 assumes.

---

## 2. `layer(...)` and `it.layer(...)`

**Verifies:** ADR-EC-006 (`spec/decisions/006-two-layer-scopes-only.md`).

**Assumption:** top-level `layer(SomeLayer)((it) => {...})` builds a Layer once
and shares it (with correct teardown via its own `Scope`) across nested
`it.effect` calls; a nested `it.layer(...)` form exists for narrower sharing
within that group.

**Found:** `node_modules/@effect/vitest/src/index.ts`:

```ts
export const layer: <R, E>(
  layer_: Layer.Layer<R, E>,
  options?: {
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.Input
    readonly excludeTestServices?: boolean
  }
) => {
  (f: (it: Vitest.MethodsNonLive<R>) => void): void
  (name: string, f: (it: Vitest.MethodsNonLive<R>) => void): void
} = internal.layer
```

And on `Vitest.Methods<R>` (the shape of `it` itself, i.e. what's passed into
`layer(...)`'s callback):

```ts
export interface Methods<R = never> extends MethodsNonLive<R> {
  readonly live: Vitest.Tester<Scope.Scope | R>
  readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.Input
    readonly excludeTestServices?: boolean
  }) => {
    (f: (it: Vitest.MethodsNonLive<R | R2>) => void): void
    (name: string, f: (it: Vitest.MethodsNonLive<R | R2>) => void): void
  }
}
```

i.e. `it.layer(...)` is the same combinator, callable a second time on the
`it` handed into the first `layer(...)` block — nesting is structural, not a
separate mechanism. The package's own JSDoc example (which we copied
verbatim into a type-checked, vitest-executed test) is:

```ts
layer(Foo.layer)("layer", (it) => {
  it.effect("adds context", () => Effect.gen(function*() {
    const foo = yield* Foo
    assert.strictEqual(foo, "foo")
  }))

  it.layer(Bar.layer)("nested", (it) => {
    it.effect("adds context", () => Effect.gen(function*() {
      const foo = yield* Foo
      const bar = yield* Bar
      assert.strictEqual(foo, "foo")
      assert.strictEqual(bar, "bar")
    }))
  })
})
```

This type-checked with zero errors and ran successfully under `vitest run`
(inner services resolved as expected). Build-once/shared-teardown behavior is
implemented in `internal.layer` (`node_modules/@effect/vitest/src/internal/internal.ts`)
via vitest's own `beforeAll`/`afterAll` plus a `Layer.MemoMap`, which is what
ADR-EC-006 delegates to rather than reimplementing.

**Verdict: MATCH.** Both the top-level `layer(...)` and nested `it.layer(...)`
forms exist with exactly the signature and memoization/sharing semantics
ADR-EC-006 assumes.

---

## 3. `TestClock`

**Verifies:** ADR-EC-012 (`spec/decisions/012-effect-v4-beta.md`), BEH-EC-012
(`spec/behaviors/03-rules-outlines-and-testclock.md`).

**Assumption:** `TestClock` is importable from `effect/testing` (not
`@effect/vitest` or `effect/TestClock` as in v3), and `TestClock.adjust` takes
a duration and returns `Effect<void>`, advancing the simulated clock
deterministically.

**Found:** `node_modules/effect/package.json` declares the exports subpath:

```json
"./testing": "./dist/testing/index.js",
```

`node_modules/effect/src/testing/index.ts`:

```ts
export * as TestClock from "./TestClock.ts"
```

`node_modules/effect/src/testing/TestClock.ts`:

```ts
export const adjust = (duration: Duration.Input): Effect.Effect<void> =>
  testClockWith((testClock) => testClock.adjust(duration))
```

Wrote `yield* TestClock.adjust("1 hour")` (matching the spec's
`` yield* TestClock.adjust(`${hours} hours`) `` usage) inside an `it.effect`
body — type-checked with zero errors and executed successfully at runtime
under `vitest run`.

**Verdict: MATCH.** `effect/testing` is a real subpath export in v4-rc.112,
and `TestClock.adjust(duration: Duration.Input): Effect.Effect<void>` is
exactly the signature BEH-EC-012's worked example assumes.

---

## 4. `Effect.fn`

**Verifies:** ADR-EC-005 (`spec/decisions/005-effect-fn-for-step-and-hook-bodies.md`).

**Assumption:** `Effect.fn(name)(function* (...args) {...})` — a named string
first argument, curried, then a bare generator function — producing
`(...params) => Effect<A, E, R>`.

**Found:** `node_modules/effect/src/Effect.ts`:

```ts
export const fn: fn.Traced & {
  (name: string, options?: SpanOptionsNoTrace): fn.Traced
} = internal.fn
```

`Effect.fn` is an intersection type: callable directly on a bare generator
function (`fn.Traced`'s own call signatures, for the unnamed/inline form), OR
callable with `(name: string, options?)` first, returning another `fn.Traced`
— i.e. the exact curried `Effect.fn(name)(generatorFn)` shape ADR-EC-005
assumes. `fn.Traced`'s call signatures accept
`body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>)`
and return `(...args: Args) => Effect<AEff, E, R>` with `E`/`R` inferred from
the yielded effects — matching "its output shape … is exactly a step
definition's shape" from the ADR.

Wrote and type-checked (zero errors) and ran at runtime:

```ts
const stepBody = Effect.fn("Given I have {int} apples")(function* (n: number) {
  yield* Effect.log(`apples: ${n}`)
  return n * 2
})
const result: Effect.Effect<number, never, never> = stepBody(3)
```

**Verdict: MATCH.** Named curried form still works exactly as ADR-EC-005
describes.

---

## 5. `Context.Service`

**Verifies:** ADR-EC-002 (`spec/decisions/002-world-is-a-context-service.md`).

**Assumption:**

```ts
class World extends Context.Service<World, {
  readonly apples: Ref.Ref<number>
}>()('World') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    return World.of({ apples: yield* Ref.make(0) })
  }))
}
```

— i.e. the two-stage `Context.Service<Self, Shape>()('Id')` class form, a
`.of(...)` static-ish helper on the resulting class, and
`Layer.effect(this, ...)` referencing the class itself (via `this` in a
static field initializer) as the Layer's Context key.

**Found:** `node_modules/effect/src/Context.ts`:

- The two-stage class form is real:
  `<Self, Shape>(): <const Identifier extends string, ...>(id, options?) => ServiceClass<Self, Identifier, Shape> & ...`
- `ServiceClass<Self, Identifier, Shape> extends Service<Self, Shape>`, and
  `Service<Identifier, Shape> extends Key<Identifier, Shape>` declares:
  ```ts
  export interface Service<in out Identifier, in out Shape> extends Key<Identifier, Shape> {
    of(this: void, self: Shape): Shape
  }
  ```
  So `.of(...)` is inherited on every class-style service — confirmed it's
  not v3-only or removed.
- `Layer.effect`'s signature (`node_modules/effect/src/Layer.ts`) takes a
  `Context.Tag`-shaped key as its first argument; `this` inside a static
  field initializer resolves to the class itself (which *is* that key, per
  `ServiceClass`), so `Layer.effect(this, ...)` type-checks identically to
  `Layer.effect(World, ...)`.

Wrote and type-checked (zero errors) and ran at runtime, exactly reproducing
ADR-EC-002's snippet verbatim:

```ts
class World extends Context.Service<World, {
  readonly apples: Ref.Ref<number>
}>()("World") {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    return World.of({ apples: yield* Ref.make(0) })
  }))
}
```

Note: `@effect/vitest`'s own JSDoc example in `src/index.ts` (for its
`layer(...)` helper) uses `Layer.effect(Bar, ...)` (class name, not `this`) —
both forms compile; ADR-EC-002's `this`-based form is not the only style used
in the ecosystem but is fully valid.

**Verdict: MATCH.** `.of(...)` exists, `static readonly layer = Layer.effect(this, ...)`
compiles against the real v4-rc types, exactly as ADR-EC-002 describes.

---

## Summary

| # | API | Spec doc | Result |
|---|-----|----------|--------|
| 1 | `it.effect`/`.skip`/`.only` | ADR-EC-004 | MATCH |
| 2 | `layer(...)` / `it.layer(...)` | ADR-EC-006 | MATCH |
| 3 | `TestClock` from `effect/testing` | ADR-EC-012, BEH-EC-012 | MATCH |
| 4 | `Effect.fn(name)(gen)` | ADR-EC-005 | MATCH |
| 5 | `Context.Service` + `.of` + `this`-layer | ADR-EC-002 | MATCH |

No ADR or behavior document needs amending. All five API assumptions hold
against the literal installed `effect@4.0.0-rc.112` /
`@effect/vitest@4.0.0-rc.112` / `vitest@4.1.11` types, confirmed both by
`tsc --noEmit` type-checking and by actually running the exercised code under
`vitest run`.
