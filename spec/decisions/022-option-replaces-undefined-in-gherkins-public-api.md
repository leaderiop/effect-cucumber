# ADR-EC-022: `Option<T>` replaces `T | undefined` throughout `@effect-cucumber/gherkin`'s public API

> **Status:** Accepted and implemented — amended: `cause` is exempt (see the amendment at the end)
> **Date:** 2026-08-28
> **Context:** the deep-analysis pass this session ran before touching any code —
> `.planning/research/effect-feature-adoption-report.md` — recommended `Option` as a real,
> verified-applicable candidate; this ADR is the decision and implementation record for
> extending that recommendation to gherkin's full public API, not just internal locals

## Context

The adoption report's own §3 scoped `Option` two ways: low-risk internal locals (`Correlate.ts`/`Validate.ts`'s `Map.get(...)` results and `=== undefined` checks) versus the public API surface (`LoadFeatureError`/`StepPatternError`'s optional fields, `Model.ts`'s optional fields, `ParameterTypeDefinition`'s optional fields), which it flagged as "a real, locked-decision-reopening redesign, not a drop-in" — specifically because the public fields are documented, locked `exactOptionalPropertyTypes` asymmetries (`Errors.ts`, `ParameterTypes.ts`, `Model.ts` all carry doc comments defending `T | undefined` explicitly).

Verifying the actual mechanism (not assumed) surfaced a real cost the report didn't anticipate: `Schema.OptionFromUndefinedOr` is a transformation (Encoded `T | undefined` → Type `Option<T>`), and a `Schema.TaggedError` constructor validates against the Type side. Confirmed by reproduction: omitting the key entirely fails construction outright — there is no "just don't pass it" ergonomic left, for `LoadFeatureError`/`StepPatternError` specifically. No custom constructor can paper over this: `@effect/tsgo`'s `overriddenSchemaConstructor` diagnostic (already encountered once this session, migrating these same two classes to `Schema.TaggedError` under ADR-EC-021) forbids any constructor override on a `Schema.TaggedError` subclass.

Given that real, confirmed cost, the choice of scope was put back to the user explicitly rather than assumed. The answer: full public API, accept the cost — consistent with the "most capable testing experience, complexity/risk explicitly not a deciding factor" priority already established this session for the `effect`-native migration.

## Decision

Every optional field on gherkin's public surface becomes `Option<T>`, never `T | undefined`:

- `Errors.ts`: `LoadFeatureError.line`/`.cause`, `StepPatternError.parameterTypeName`/`.pattern`/`.cause` — all `Schema.OptionFromUndefinedOr`, all constructor keys required (must pass `Option.some(x)`/`Option.none()` explicitly, confirmed no omission path exists).
- `Errors.ts`: `LoadFeatureWarning.line` — a plain interface field, not `Schema`-constrained (`LoadFeatureWarning` is data, not a `Schema.TaggedError`), so `makeWarning`'s own `line?: number` argument stays a friendly, omittable TS-optional parameter; the factory is the one place that converts to `Option.fromUndefinedOr(args.line)`.
- `Model.ts`: `ParsedStep.argument`, `ParsedScenario.ruleId` — both `Option<T>`, required fields (plain interfaces, no `Schema` involved, but made consistent with the rest of the surface rather than left as a TS-optional escape hatch).
- `ParameterTypes.ts`: `ParameterTypeDefinition.definedAt`/`.useForSnippets`/`.preferForRegexpMatch` — all `Option<T>`, required fields. Unwrapped via `Option.getOrUndefined` only at the one boundary that needs a plain value: `toUpstreamParameterType`'s call into `@cucumber/cucumber-expressions`' own constructor, which has no notion of `Option`.
- `loadFeature.ts`: `LoadFeatureOptions.parameterTypes` — the field is `Option<ParameterTypeStore>`; the outer `options?: LoadFeatureOptions` argument itself stays a plain, omittable TS-optional parameter (a function-call ergonomic, not a public data field the `Option` scope was ever meant to cover).
- `StepPatternMessages.ts#raiseStepPatternError` — not exported from `index.ts`, so it is explicitly **out of scope**: its own arguments stay plain `T | undefined` for internal call-site convenience, converting to `Option` only once, at the point it actually constructs the public `StepPatternError`.

## Consequences

**Positive**:

- One representation for "value or absence" everywhere a consumer of this package's data has to reason about it — no more `=== undefined` checks living alongside `Option.isNone` checks in the same call site, no more `exactOptionalPropertyTypes` asymmetry to explain in a doc comment.
- `Parser.ts`'s `loadFeatureError` helper — previously a ternary specifically to route around the `exactOptionalPropertyTypes` asymmetry — collapses to a single unconditional construction; the asymmetry it existed to handle no longer exists.
- `Correlate.ts`'s internal `ParsedStep`/`ParsedScenario` construction and `Validate.ts`'s warning-sorting comparator both read cleanly with `Option.fromUndefinedOr`/`Option.getOrElse`, matching the report's original "genuine value, low risk" assessment for the internal side of this same change.

**Negative**:

- Every construction site of `LoadFeatureError`/`StepPatternError` across the package (`Source.ts`, `Parser.ts`, `Pickles.ts`, `Correlate.ts`, `Validate.ts`, `loadFeature.ts`, `StepPatternMessages.ts` — 13+ sites) had to be rewritten to pass `Option.some(x)`/`Option.none()` explicitly; nothing shorter was available once `Schema.TaggedError` classes were in play (see Context).
- Every `ParameterTypeDefinition` object literal in the test suite (~30 across `ParameterTypes.test.ts` and `StepMatcher.test.ts` alone) needed `definedAt`/`useForSnippets`/`preferForRegexpMatch` added, since the type no longer permits omitting them.
- Any external consumer constructing these shapes directly (not just calling `loadFeature`) inherits the same "always explicit" requirement — there is no soft-landing compatibility path from the old `T | undefined` signatures.
- `spec/behaviors/04-loadfeature-parse-and-validation.md`'s worked example needed a real rewrite, not just a field-type note: it had never been updated for ADR-EC-021's `Effect`-returning `loadFeature` either, so this pass fixed both the `Effect`/`FileSystem` and the `Option` staleness together.

**Trade-off accepted**: the loss of "just omit the optional field" ergonomics at every construction site, in exchange for a uniform, `undefined`-free representation across the entire public surface — decided explicitly by the user after the real cost (not the report's original, incomplete estimate of it) was verified and disclosed.

## Verified, not assumed

- `Schema.OptionFromUndefinedOr(Schema.Number)` works standalone (`Schema.decodeUnknownSync`) but requires a real `Option` value, not a raw `number | undefined`, when used to construct a `Schema.TaggedError` instance directly — confirmed by reproduction against the installed `effect@4.0.0-rc.112`, including the "omit the key entirely" failure mode.
- `vitest`'s `toEqual`/`toStrictEqual` compare `Option` values structurally and correctly (`Option.some(12)` equals `Option.some(12)`, not `Option.some(13)`, not `Option.none()`) — confirmed by a standalone reproduction before rewriting any pinned test to rely on it.
- `Option.fromUndefinedOr`, `Option.getOrElse`, `Option.getOrUndefined`, `Option.getOrThrow`, `Option.match`, `Option.isSome`/`Option.isNone` all behave as documented against this build — used throughout the implementation, none flagged a further incompatibility the way `Schema`'s combinators did earlier this session.

## Amendment — `Error.cause` is exempt

> **Amends the Decision above; the body is left as written, per ADR-EC-014's precedent.**
> The `cause` field of `LoadFeatureError`, `StepPatternError`, `DataTableError` and
> `@effect-cucumber/vitest`'s `StepMatchError` is NOT an `Option<unknown>`. It is declared
> `Schema.optionalKey(Schema.Unknown)` — plain `unknown`, absent when there is nothing to
> attach — because `Error.cause` is a field the PLATFORM defines the semantics of: Node's
> `util.inspect`, Effect's `Cause.pretty`, and every error-chain tool read `err.cause`
> natively and would otherwise print an `{ _tag: "Some", value }` wrapper in place of the
> upstream error. Wrapping it traded a uniform representation for a broken error chain on
> every consumer's terminal, which was the wrong side of the trade. Every OTHER optional
> field on those classes (`line`, `parameterTypeName`, `pattern`, `row`, `column`,
> `suggestion`) keeps the `Option<T>` shape this ADR decided. Asserted by
> `packages/gherkin/test/Contracts.test.ts` and `packages/vitest/test/Errors.test.ts`, which
> check reference equality AND that `util.inspect(err)` contains the upstream message.
