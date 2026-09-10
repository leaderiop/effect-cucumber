---
"@effect-cucumber/vitest": minor
---

Un-vendors `@effect/vitest`, now that its `4.0.0-rc.113` release supports vitest 5 directly
(`peerDependencies.vitest: ">=5.0.0 <6.0.0"`). `it`, `layer`, `assert`, `flakyTest`,
`describeWrapped`, `addEqualityTesters`, `makeMethods` and vitest's own re-exported surface still
come from `@effect-cucumber/vitest` itself, exactly as before — but `@effect/vitest` is a real peer
dependency again, so it needs installing alongside `effect`, `@effect/platform-node`, and `vitest`:

```sh
pnpm add -D @effect-cucumber/vitest effect@rc @effect/platform-node@rc @effect/vitest@rc vitest
```

**Node `>=22.12.0` is now required** (`>=20` previously) — `@effect/vitest@4.0.0-rc.113` and
`vitest@5.0.0` itself both declare this floor. `effect`/`@effect/platform-node` move to the matching
`4.0.0-rc.113` line.

See ADR-EC-059's third Correction for the full rationale, including the real root cause of the
module-duplication bug that blocked this the first time it was attempted.
