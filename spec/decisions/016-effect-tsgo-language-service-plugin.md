# ADR-EC-016: Wire `@effect/tsgo` as the `tsc` language-service plugin, errors gating the build

> **Status:** Accepted
> **Date:** 2026-08-28
> **Context:** requested directly, cross-referenced against `Effect-TS/effect`'s own configuration

## Context

`INV-EC-003` ("a step's Effect can only use services the ambient Layer provides") is currently enforced only by ordinary TypeScript structural typing — real, but easy to get subtly wrong in a DSL that infers a step's `R` against an ambient Layer's output type (exactly the kind of variance bug GSD Architecture/Pitfalls research flagged as a risk area). `@effect/tsgo` — Effect's own TypeScript-Go-based language service — ships type-aware diagnostics purpose-built for this: `missingLayerContext` and `missingEffectContext` detect exactly the class of bug INV-EC-003 exists to prevent, and `duplicatePackage` catches the failure mode [ADR-EC-015](015-effect-is-a-peer-dependency.md) was written to avoid in the first place.

Checked `Effect-TS/effect`'s own `tsconfig.base.json` (`main`, 2026-08-28) for the real plugin wiring — the installed package is `@effect/tsgo`, but the TypeScript plugin it registers is named `"@effect/language-service"` (a naming holdover from the project's earlier, non-tsgo incarnation).

## Decision

Add `@effect/tsgo` as a root devDependency and wire it into `tsconfig.base.json`:

```jsonc
"plugins": [{
  "name": "@effect/language-service",
  "namespaceImportPackages": ["effect", "@effect/*", "@effect-cucumber/*"],
  "includeSuggestionsInTsc": false,
  "ignoreEffectWarningsInTscExitCode": false,
  "ignoreEffectErrorsInTscExitCode": false
}]
```

`effect-ts/effect` itself sets both `ignoreEffect*InTscExitCode` flags to `true` — their own large, partially-legacy codebase doesn't want every tsgo finding to fail `tsc -b` yet. This project has no such legacy debt and Layer-checking is its entire value proposition, so both are set to `false` here: an `effect`-diagnostic error genuinely fails the build, deliberately diverging from upstream's own posture rather than copying it uncritically.

The root `package.json`'s `prepare` script runs `effect-tsgo patch`, matching `effect-ts/effect`'s own setup — this patches the native TypeScript install (`typescript@^7.0.2`, already a devDependency) so the Go-based language service is actually used; `@effect/tsgo` alone isn't sufficient without a compatible native TypeScript.

## Consequences

**Positive**:

- `missingLayerContext`/`missingEffectContext` give INV-EC-003 a second, type-aware enforcement mechanism beyond ordinary structural typing, specifically covering the Layer/Effect variance risk this DSL is most exposed to.
- `duplicatePackage` provides an automated backstop for [ADR-EC-015](015-effect-is-a-peer-dependency.md)'s peer-dependency decision.
- `floatingEffectInVitest` and `missingEffectServiceDependency` are directly relevant to this codebase's shape (a vitest-integration DSL, and `Context.Service`-heavy World/Layer patterns) and come for free once the plugin is wired.

**Negative**:

- Diverging from `effect-ts/effect`'s own `ignoreEffect*InTscExitCode: true` posture means this project's `tsc -b` can fail for reasons upstream's own wouldn't — acceptable here, but worth remembering if ever comparing build behavior against the framework's own repo.
- `@effect/tsgo` targets a specific, narrow TypeScript version range (`7.0.2`, `7.1.0-dev.*` per its own compatibility table) — a routine `typescript` bump could silently lose plugin compatibility until `@effect/tsgo` catches up.

**Trade-off accepted**: failing the build on an Effect-specific diagnostic is exactly the strictness this library's core value proposition calls for — the "second, independent enforcement mechanism" framing in `spec/invariants.md`'s `INV-EC-003` entry should be updated to name this plugin, not left describing structural typing as the only mechanism.
