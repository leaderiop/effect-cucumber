import * as Gherkin from "@effect-cucumber/gherkin"

/**
 * Public entry point for `@effect-cucumber/vitest`.
 *
 * Placeholder: this package has no behavior yet. Phase 5 replaces this file's
 * contents with the `Feature` / `Scenario` / `Step` surface. The re-export
 * below exists so the cross-package project reference is exercised by the
 * build.
 */
export const packageName = "@effect-cucumber/vitest" as const

export const gherkinPackageName: Gherkin.PackageName = Gherkin.packageName
