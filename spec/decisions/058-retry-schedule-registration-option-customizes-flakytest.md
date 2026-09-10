# ADR-EC-058: `describeFeature` gains a `retry` registration option — customizes the `Schedule` a `@retry` Scenario retries with, extends ADR-EC-034

> **Status:** Accepted
> **Date:** 2026-09-10

## Context

[ADR-EC-034](034-retry-tag-wraps-flakytest-at-the-testapi-seam.md) gave a Scenario tagged `@retry` a
fixed policy: `@effect/vitest`'s own `flakyTest`, `Schedule.recurs(10)` capped at a 30s elapsed-time
budget, with no caller override. That ADR's own Consequences section named this a known, deliberately
deferred gap: a vitest-native, caller-configurable retry count was considered and set aside.

`flakyTest` itself takes a second parameter, but only an elapsed-time cap override — never a
`Schedule`. There is no way, today, for a consumer to ask for a different attempt count or backoff
strategy; every `@retry` Scenario in every Feature shares the identical policy.

## Decision

**`describeFeature`'s options gain a `retry?: Schedule.Schedule<any, any, never>` field** —
Feature-wide, the SAME schedule for every `@retry` Scenario one `describeFeature` call registers,
never per-Rule or per-Scenario:

```ts
describeFeature(feature, MainLayer, ({ Scenario }) => { ... }, {
  retry: Schedule.recurs(2)
})
```

**It customizes the POLICY a `@retry`-tagged Scenario retries with — it does not itself decide THAT a
Scenario retries.** `@retry` (ADR-EC-034) still owns that decision entirely; an untagged Scenario is
unaffected by this option regardless of whether it is set. The bare `@retry` tag with no option
present keeps today's exact `flakyTest` behavior, byte-for-byte unchanged.

**`EmitOptions` gains a sibling field, `retrySchedule: Schedule.Schedule<any, any, never> | null`**,
carried across the `TestApi` seam exactly like `retry`/`skip`/`timeout` already are — decided in
`Runner.ts` (here, simply threaded through from `describeFeature.ts`'s own normalisation, `options?.retry
?? null`, since it is Feature-wide rather than derived per-Scenario), never applied there.

**`VitestTestApi.ts`'s `withRetry` branches on it:**

```ts
const withRetry = (
  retry: boolean,
  retrySchedule: Schedule.Schedule<any, any, never> | null,
  self: Parameters<TestApi["effect"]>[1]
): Parameters<TestApi["effect"]>[1] => {
  if (!retry) return self
  if (retrySchedule === null) return () => flakyTest(self())
  return () => Effect.orDie(Effect.retry(Effect.sandbox(Effect.scoped(self())), retrySchedule))
}
```

`retrySchedule === null` keeps calling `flakyTest(self())` UNCHANGED. A non-null schedule builds the
identical `scoped → sandbox → retry → orDie` shape by hand, parameterised by the caller's own
`Schedule` instead of `flakyTest`'s internal default — `flakyTest` itself is not called in this
branch, since it accepts no `Schedule` parameter to hand one to.

**Constrained to `Schedule.Schedule<any, any, never>`** — no service requirement — mirroring
`shared`'s own `Layer<R, never, never>` constraint (ADR-EC-006) for the identical reason: a schedule
needing its own Layer would have nowhere to be provided from at the `TestApi` seam.

## Consequences

**Positive**:

- Closes the gap ADR-EC-034 itself named as deliberately deferred, without touching that ADR's own
  default behavior at all.
- `EmitOptions.retrySchedule` threads through both the Feature-level and Rule-level emission loops in
  `Runner.ts` identically — pinned by a reference-identity unit test (`Runner.test.ts`) proving the
  SAME `Schedule` value reaches every Scenario's own `EmitOptions`, tagged or not.
- Zero behavior change for any Feature that does not set the option: `retrySchedule` is `null`
  end-to-end, and `withRetry`'s `null` branch is exactly the pre-existing `flakyTest(self())` call.

**Negative**:

- Feature-level granularity only — no per-Rule or per-Scenario override yet. A Feature mixing
  fast-unit-style and slow-network-style `@retry` Scenarios must still pick one shared policy for all
  of them, or split them into separate `describeFeature` calls.
- The tag-string form some proposals for this feature considered (`@retry(3, "5s")`) is explicitly
  NOT part of this ADR: vitest's own tag config rejects tag names containing parentheses, and a
  bespoke encoding would be a change to committed `.feature` files, not TypeScript call sites — a
  different, harder-to-reverse category of change this ADR does not take on.

**Trade-off accepted**: Feature-wide granularity in exchange for a small, additive option — the same
scope ADR-EC-034 itself already operates at (a `@retry` Scenario's policy was always a Feature-author
decision, never a per-Scenario tuning knob, before or after this ADR).
