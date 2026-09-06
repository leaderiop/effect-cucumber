# ADR-EC-050: `dependency-cruiser` becomes the authoritative, declarative package-boundary gate — replaces `madge --circular` and closes a previously-unenforced deep-import gap

> **Status:** Accepted
> **Date:** 2026-09-06
> **Context:** a pure tooling/CI change — no runtime behavior changes, so no `spec/behaviors/` update is
> needed (same shape as [ADR-EC-044](044-effect-vitest-is-a-devdependency-of-gherkins-own-test-suite.md),
> confirmed by reading that ADR first)

## Context

Two mechanisms enforced package-boundary rules before this ADR:

- `pnpm circular` (`madge --circular --extensions ts packages/*/src`) — no import cycle across
  `packages/*/src`.
- `scripts/verify-no-runner-dep.sh` — a hand-rolled, grep-based script asserting
  `@effect-cucumber/gherkin` never imports a test runner or a concrete platform implementation
  ([ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md)), on BOTH the source-import
  side (`packages/gherkin/src/**/*.ts`) and the `package.json` manifest side (`dependencies` /
  `optionalDependencies` / `bundledDependencies` / `peerDependencies`).

Neither mechanism, nor anything else in this repository, checked that `packages/vitest/src` reaches
`@effect-cucumber/gherkin` only through its public barrel (`packages/gherkin/src/index.ts`).
`@effect-cucumber/gherkin`'s `package.json` `exports` map publishes only `"."` and `"./package.json"`
(`packages/gherkin/package.json`), so a Node-resolved subpath import (`@effect-cucumber/gherkin/DataTable`)
is already impossible — but a plain **relative** import that bypasses package resolution entirely
(`../../gherkin/src/DataTable.ts`) was not caught by anything. This is a real, previously-unenforced gap
this ADR closes.

This ADR adopts `dependency-cruiser` as one declarative, authoritative tool covering both the existing
circular-import check and the new deep-import rule, consolidating two of the three package-boundary
mechanisms into one config file while leaving the third (`scripts/verify-no-runner-dep.sh`'s
manifest-side check) in place, because `dependency-cruiser` — an import-graph tool — has no way to
inspect `package.json` fields.

## Decision

`.dependency-cruiser.cjs` at the repo root declares four rules, run via
`pnpm verify:package-boundaries` (`depcruise --config .dependency-cruiser.cjs --output-type err
packages/*/src/*.ts`):

1. **`no-circular`** (error) — no import cycle anywhere in `packages/*/src`. Supersedes `pnpm circular`
   (madge), after an equivalence proof (below).
2. **`gherkin-no-runner-dep`** (error) — `packages/gherkin/src/**` may not import `vitest`,
   `@effect/vitest`, or `@effect/platform-{node,bun,deno}`. Defense in depth alongside
   `scripts/verify-no-runner-dep.sh`'s source-side assertion; that script's separate manifest-side
   assertion has no dependency-cruiser equivalent and is **kept** (see below).
3. **`no-deep-import-across-package`** (error) — `packages/vitest/src/**` may not resolve to anything
   under `packages/gherkin/src/**` except `index.ts`. The new rule; closes the gap described in Context.
4. **`no-orphans`** (warn, non-gating) — secondary hygiene check for a module with zero incoming AND zero
   outgoing edges. `index.ts`/`.d.ts` files are excluded from ever being flagged.

`package.json` gained `"dependency-cruiser": "18.2.0"` (devDependency, exact-pinned like every other
tool version in this repo) and the `verify:package-boundaries` script; `.github/workflows/check.yml`'s
`package` job step `- run: pnpm circular` was replaced with `- run: pnpm verify:package-boundaries`.
`"circular"` and `"madge": "8.0.0"` were removed from `package.json` in the same commit as the CI diff,
only after the equivalence proof below passed.

### Empirical findings this ADR's Red→Green work surfaced (all fixed before Green was trusted)

This job followed Red→Green→Refactor: before trusting a clean run, a temporary fixture proving
detection was built and run for **every** rule (not only the two the originating task explicitly named),
because early testing surfaced enough surprising behavior from this tool that "the two named rules were
tested" was not enough confidence to extend to the untested two. Three real, silent-failure-shaped bugs
were found and fixed as a direct result — each one would otherwise have shipped a rule that looked wired
but never actually fired:

1. **The CLI invocation must pass an explicit file glob, not a directory.** `dependency-cruiser@18.2.0`
   refuses to treat `typescript@7.0.2` (this repo's pinned compiler — `tsconfig.base.json` via the
   `typescript` catalog entry) as a "compatible TypeScript compiler" (`>=2.0.0 <7.0.0` is the range it
   accepts; `pnpm depcruise --info` confirms `.ts: available: false` as a direct consequence). Passing a
   **directory** (`packages/*/src`, as originally drafted) makes `depcruise` enumerate files by that same
   extension-availability table, so it silently discovers **zero** `.ts` files — `0 modules, 0
   dependencies cruised`, a clean-looking exit 0 that verified nothing at all. Passing an explicit file
   glob (`packages/*/src/*.ts`, verified safe: both packages' `src/` are flat, no subdirectories) bypasses
   that discovery filter and parses every file correctly (verified: 95 real modules / 195 real
   dependencies on the pre-existing codebase). `verify:package-boundaries`'s script value was changed
   accordingly — a deviation from the task's literal `packages/*/src` text, made necessary by this
   empirical finding.
2. **The default `exclude` pattern silently deleted almost every external dependency edge.** The
   originally-drafted `exclude: { path: "(^|/)(test|dist)/" }` was meant to skip this repo's own
   `packages/*/test/` and `packages/*/dist/` directories. Unanchored, it also matches a `/dist/` segment
   **anywhere in a resolved path** — and virtually every npm package (including `vitest` itself, which
   resolves to `node_modules/.../vitest/dist/index.js`, and `effect`, to
   `node_modules/.../effect/dist/Effect.js`) ships its build output under a `dist/` directory. The result:
   a `gherkin/src` file importing `vitest` produced a clean, silent pass — not because the source was
   clean, but because the one edge the rule exists to catch had already been erased from the graph before
   `gherkin-no-runner-dep` ever evaluated it. Caught by this job's own Red-phase fixture. Fixed by
   anchoring: `exclude: { path: "^packages/[^/]+/(test|dist)/" }`, which can never match a
   `node_modules/...`-rooted path.
3. **`dependency-cruiser` does not read `package.json` `"exports"` maps unless told to.**
   `enhancedResolveOptions.exportsFields` defaults to `[]`. Every package this ruleset needs to resolve —
   `@effect/vitest`, `@effect/platform-{node,bun,deno}`, `effect`, and both of this repo's own workspace
   packages — declares only an `exports` map (no legacy `main` field), so without this option every one
   of them stayed an unresolved bare specifier, never touching a real `node_modules/...` path, and
   `gherkin-no-runner-dep`'s `to.path` regex could never match three of its four named specifiers (only
   `vitest`, which happens to also carry a compatibility `main` field, resolved without this fix). Caught
   by Red-phase fixtures for `@effect/platform-node` and `@effect/vitest`, both of which stayed silently
   Green until `enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "types",
   "node", "default"] }` was added to `options`.

After all three fixes, a Red-phase fixture was built and independently proven to trigger **every** rule
branch: `no-circular` (a mutual-import pair under `packages/gherkin/src`), `no-deep-import-across-package`
(a relative import from `packages/vitest/src` into `packages/gherkin/src/DataTable.ts`), and
`gherkin-no-runner-dep` for all four forbidden specifiers individually (`vitest`, `@effect/vitest`,
`@effect/platform-node`, and confirmed by inspection that the `@effect/platform-(bun|deno)` regex
alternation is structurally identical and untestable further only because neither package is installed in
this workspace). Every fixture was deleted before Green was trusted; the final Green run
(`pnpm verify:package-boundaries`) reports zero violations across 98 modules / 211 dependencies.

**A residual, informational limitation, accepted rather than fixed:** `dependency-cruiser@18.2.0` still
emits `missing-typescript-transpiler` on every run (non-fatal, does not affect exit code) because
`typescript@7.0.2` sits outside its supported range. This is a real, current, upstream limitation (its
own message: "Support for typescript@>=7 will follow when its API is published and stable") with no
workaround short of installing a second, non-canonical `typescript` version purely to satisfy one tool —
rejected as introducing more risk than it removes, since this repo deliberately pins `typescript` via
`@effect/tsgo` for its actual build ([ADR-EC-016](016-effect-tsgo-language-service-plugin.md) area).
The Red-phase fixtures above prove the rules still detect real violations despite this warning; it is
tracked here as a known, accepted gap rather than silently ignored.

**`no-orphans`'s actual semantics, verified against `dependency-cruiser`'s own source
(`src/analyze/derive/orphan/is-orphan.mjs`):** "orphan" means zero dependencies **and** zero dependents —
a truly isolated module. A barrel/entry file like `packages/vitest/src/index.ts` re-exports many other
modules, so it always has outgoing edges and can **never** be flagged as an orphan by this rule,
regardless of whether anything outside the package imports it. On the real, current codebase the rule
reports zero orphans — which is the expected clean result, but for a narrower reason than "nothing
besides the entry point is unreferenced": nothing in `packages/*/src` is a true zero-in/zero-out island,
full stop. This rule remains valuable for its documented purpose (catching a genuinely abandoned file
that neither imports nor is imported), but it structurally cannot answer "does anything outside this
package use this package's own entry point" — that is not a question an import-graph tool scoped to
`packages/*/src` can ask at all, since the answer requires knowing about code outside that scope.

### `scripts/verify-testapi-seam.sh` — re-examined, verdict: NOT redundant

`scripts/verify-testapi-seam.sh` asserts that `packages/vitest/src/Runner.ts` and `TestApi.ts` never
import `vitest` or `@effect/vitest`, in any form (including `import type`), to protect the injected
TestApi seam those two modules exist to provide. On the surface this looks like it could fold into
`gherkin-no-runner-dep` or a fourth dependency-cruiser rule, since both are "forbid importing a test
framework from certain files." They are a different concern:

- **Scope.** `gherkin-no-runner-dep` is a _package_-boundary rule: `@effect-cucumber/gherkin` as a whole
  must not reach a runner. `verify-testapi-seam.sh` is a _file_-level DI-seam rule scoped to exactly two
  named files **inside** `@effect-cucumber/vitest` — a package whose whole purpose is integrating with
  `vitest`, and which correctly imports `vitest`/`@effect/vitest` everywhere else
  (`VitestTestApi.ts`, `describeFeature.ts`). A package-boundary tool has no vocabulary for "forbidden
  everywhere in this package except these two named files are additionally forbidden while the rest of
  the package is fine" without becoming a second, parallel file-level rule anyway — at which point it is
  not simplifying anything, just relocating the same assertion.
- **What would be lost.** `verify-testapi-seam.sh`'s own positive control (both target files import
  `effect/Scope`, proving the scan reaches real import lines) and its precondition checks (the target
  files still exist, so a rename or deletion cannot silently read as a pass) are hand-rolled safeguards
  with no direct dependency-cruiser equivalent for a two-file, same-package scope this narrow.
- **Uncosted scope creep.** No proof-of-detection fixture was built for `verify-testapi-seam.sh`'s
  specific assertion in this job — only the four rules this ADR names were Red/Green proven. Migrating it
  now, without that proof, would be exactly the kind of untested "looks equivalent" swap this job's own
  Red→Green discipline exists to prevent (see the three empirical findings above, every one of which
  would have shipped silently broken without a fixture).

**Verdict: not redundant, and out of scope for this job.** Recorded as a Follow-up, not a decision made
now.

## Consequences

**Positive**:

- One declarative config (`.dependency-cruiser.cjs`) is now the authoritative source for both existing
  cross-file boundary rules this repo enforced procedurally, plus the new deep-import rule — readable as
  data, not as bash string-matching.
- The previously-unenforced deep-import gap (`packages/vitest/src` reaching `packages/gherkin/src`'s
  internals via a relative path) is closed and proven to fire on a real fixture.
- `scripts/verify-no-runner-dep.sh` gets genuine defense in depth on its source-side assertion, backed by
  a second, independently-implemented tool reaching the same conclusion via a different mechanism
  (import-graph resolution vs. grep).
- One fewer devDependency (`madge`) and one fewer ad hoc script surface, after passing the equivalence
  proof and reducing the number of moving parts this repo needs to keep in sync manually.

**Negative**:

- `dependency-cruiser@18.2.0` does not (yet) recognize `typescript@7.0.2` as a compatible compiler,
  producing a permanent, non-fatal `missing-typescript-transpiler` warning on every run — accepted, not
  fixed (see above).
- `dependency-cruiser`'s default settings were unsafe for this specific, modern (`exports`-map-only,
  no-`main`-field) ESM package layout in three separate, independently-surprising ways (directory vs.
  file-glob discovery, an overly broad default-shaped `exclude`, and `exportsFields` defaulting to
  off) — none of which is obvious from the tool's own documentation, and all three needed a Red-phase
  fixture, not just a clean run, to notice.
- `dependency-cruiser` does not resolve a bare package specifier through pnpm's workspace symlinks all
  the way to the underlying `packages/gherkin/src` files without the `exportsFields` fix above — even
  with it, cross-package edges resolve to the real `packages/gherkin/src/*.ts` files (verified), but a
  genuinely reversed dependency (gherkin importing `@effect-cucumber/vitest` by package name) is not
  something this job specifically fixture-tested, since no such import exists in the current codebase and
  building one would require inventing an architecturally-nonsensical scenario. Documented as an
  unverified edge, not assumed safe.

**Trade-off accepted**: an additional devDependency and a second place (`.dependency-cruiser.cjs`
alongside `scripts/verify-no-runner-dep.sh`) that both encode a piece of ADR-EC-021's constraint, in
exchange for defense in depth and a genuinely new, previously-unenforced rule. The manifest-side half of
ADR-EC-021's constraint stays exclusively in `scripts/verify-no-runner-dep.sh`, which this ADR does not
touch.

## Follow-up (not decided by this ADR)

- Whether `scripts/verify-testapi-seam.sh`'s file-level DI-seam assertion should ever move onto
  dependency-cruiser (or a sibling declarative tool) — re-examined above, verdict NOT redundant and out
  of scope; revisit only with its own proof-of-detection fixture, not as a "looks similar" migration.
- Whether a future dependency-cruiser release that recognizes `typescript@7.x` changes any of the
  resolution behavior documented here — the three fixes in this ADR (file-glob invocation, anchored
  `exclude`, `enhancedResolveOptions.exportsFields`) should be re-verified against the fixtures rather
  than assumed to remain necessary, if that upgrade is ever made.
