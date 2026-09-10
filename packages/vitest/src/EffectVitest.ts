/**
 * A thin, single-indirection re-export of the real `@effect/vitest` npm package.
 *
 * WHY THIS FILE EXISTS AT ALL rather than every internal module importing `@effect/vitest`
 * directly: from 2026-09-10 to 2026-09-10 this file (plus `EffectVitestInternal.ts` and
 * `EffectVitestTypes.ts`, since deleted) vendored a maintained-in-tree replacement for
 * `@effect/vitest`, because that package's last published release at the time, `4.0.0-rc.112`,
 * hard-capped its own peer range below vitest 5 (ADR-EC-059). `@effect/vitest@4.0.0-rc.113`
 * published a clean `vitest: ">=5.0.0 <6.0.0"` peer range the same day, closing that gap — see
 * ADR-EC-059's second Correction. `Testing.ts`/`VitestTestApi.ts` keep importing from
 * `./EffectVitest.ts` rather than `@effect/vitest` directly purely so a future re-vendor (or a
 * different upstream substitute) again touches one file, not every internal call site.
 *
 * @since 4.0.0
 */
export * from "@effect/vitest"
