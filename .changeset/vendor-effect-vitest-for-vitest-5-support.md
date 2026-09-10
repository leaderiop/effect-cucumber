---
"@effect-cucumber/vitest": minor
---

Supports vitest 5. The `vitest` peer range moves from `>=4.1.0 <5.0.0` to `>=5.0.0 <6.0.0` —
**vitest 4 is no longer supported**, since `@effect/vitest`'s last published release hard-caps its
own peer range below vitest 5, and `@vitest/runner` has no stable vitest 5 release at all.

`@effect/vitest` and `@vitest/runner` are dropped as peer dependencies entirely.
`@effect-cucumber/vitest` now vendors and maintains its own replacement for the pieces of each it
actually needs — `it`, `layer`, `assert`, `flakyTest`, `describeWrapped`, `addEqualityTesters`,
`makeMethods`, plus vitest's own re-exported surface — tracking vitest 5 directly instead of
waiting on either upstream package. Consumers import all of this from `@effect-cucumber/vitest`
itself, exactly as before; only the `@effect/vitest`/`@vitest/runner` installs in `package.json`
become unnecessary and can be removed.

See ADR-EC-059 for the full rationale.
