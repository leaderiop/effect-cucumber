---
"@effect-cucumber/gherkin": patch
"@effect-cucumber/vitest": patch
---

Bumps `effect`/`@effect/platform-node`/`@effect/vitest` from `4.0.0-rc.115` to `4.0.0-rc.116`,
moving both packages' `peerDependencies.effect` range to `^4.0.0-rc.116` (and, for
`@effect-cucumber/vitest`, `@effect/platform-node`/`@effect/vitest` alongside it). No source changes
were needed — rc.116's only breaking changes are in the experimental
`effect/unstable/schema/*` JIT/AOT compiler internals (`SchemaGetter`/`SchemaTransformation`/
`SchemaAST`), which neither package uses; `@effect/vitest@4.0.0-rc.116` is a dependency-only patch
release.
