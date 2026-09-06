// Used ONLY by `src/runners.ts`'s own spawned `vitest run <fixture> --config vitest.config.ts`
// invocations — never discovered implicitly by `pnpm test` at the repo root, which finds and uses
// the ROOT `vitest.config.ts` for `benchmarks/test/*.test.ts` (matching its default include glob
// unchanged, per that file's own note (c)).
//
// This file's `include` is broadened on purpose, and ONLY here: the effect-cucumber step modules
// under `effect-cucumber/**/*.steps.ts` are deliberately named `.steps.ts`, not `.steps.test.ts`
// (`packages/vitest/test/acceptance/README.md`), so vitest's default include glob — and the root
// config's untouched default — never collects them. Widening the ROOT config's include instead
// would defeat that naming convention repo-wide; widening it here, in a config the harness alone
// passes via `--config`, keeps the isolation real (ADR-EC-051).
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["effect-cucumber/**/*.steps.ts"],
    allowOnly: false
  }
})
