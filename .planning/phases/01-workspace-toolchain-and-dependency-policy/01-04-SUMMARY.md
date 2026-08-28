---
phase: 01-workspace-toolchain-and-dependency-policy
plan: 04
subsystem: dependency-policy-and-packaging
tags: [pnpm-catalogs, peer-dependencies, publishConfig, esm-only, effect-v4-rc, packaging]

requires:
  - "01-01 (compiling two-package workspace, tsconfig.base.json, project references)"
  - "01-03 (dprint formats package.json — manifests must survive `dprint check`)"
provides:
  - "two-catalog version policy in pnpm-workspace.yaml: default catalog = exact pins (devDependencies), named `peer` catalog = ranges (peerDependencies)"
  - "a single one-line bump point for an Effect rc upgrade (ADR-EC-012)"
  - "both packages reshaped into publishable ESM-only form: exports + publishConfig.exports + files + sideEffects + engines, no main/types/private"
  - "dev-time exports point at ./src/index.ts; publishConfig.exports swaps to ./dist/index.js at pack time"
  - "@effect-cucumber/gherkin declares no `effect` in any dependency field (ADR-EC-015)"
  - "empirical proof that catalog:peer packs as a range and catalog: packs as a pin (Pitfall 20 defused)"
affects:
  - "01-05 (packed-tarball verification — the manifest shape it asserts against is now in place; see the pack-time-only failure mode below)"
  - "01-06 (CI — `pnpm pack` is the only check that validates named-catalog references; `pnpm install` does not)"
  - "every future Effect rc bump — edit pnpm-workspace.yaml's two catalogs, nothing else"
  - "packages/*/src — cross-package imports now resolve to source, not dist"

tech-stack:
  added: []
  patterns:
    - "peer ranges and dev pins live in separate catalogs — a catalog entry's shape is dictated by which dependency field consumes it, because `catalog:` expands verbatim at pack time"
    - "publishConfig.exports swap (STACK §4.2): dev-time exports at source, published exports at dist, no prepack script"
    - "workspace:^ over workspace:* so the packed range is a caret, not a bare version"
    - "packaging claims are proven by unpacking `pnpm pack` output, never by reading the source manifest"

key-files:
  created:
    - .planning/phases/01-workspace-toolchain-and-dependency-policy/deferred-items.md
  modified:
    - pnpm-workspace.yaml
    - package.json
    - packages/gherkin/package.json
    - packages/vitest/package.json
    - pnpm-lock.yaml

decisions:
  - "Named `peer` catalog kept (the plan's fallback to literal ranges was not needed). pnpm 10.26.1 accepts the `catalogs:` key and expands `catalog:peer` correctly at pack time — verified by unpacking the tarball, not by reading the source manifest."
  - "Dev-time `exports` point at `./src/index.ts` (the plan's primary path, not its `dist` fallback). `tsc -b --force` — a full non-incremental rebuild — exits 0, and `--traceResolution` confirms `@effect-cucumber/gherkin` resolves through the exports map to `packages/gherkin/src/index.ts`. No TS6307."
  - "Default catalog holds `vitest: ^4.1.0` / `typescript: ^7.0.2` / `@types/node: ^26.4.0` as ranges rather than literal pins, copied verbatim from the plan. Only `effect` and `@effect/vitest` — the rc-versioned packages ADR-EC-012 actually pins — are exact. Deviating to exact pins here would have rewritten already-locked resolutions for no stated benefit."
  - "`@types/node` sits in the catalog with no consumer yet. Left in place as the plan specified; pnpm neither errors nor warns on an unused catalog entry, and it becomes the pin the moment anything needs Node types."
  - "`\"license\": \"MIT\"` declared with no LICENSE file present anywhere. Logged to deferred-items.md rather than fixed — adding license text is a repo-hygiene change, not a manifest-shape one, and nothing publishes in this milestone."

duration: ~8m
completed: 2026-08-28
---

# Phase 01 Plan 04: Dependency Policy and Publishable Manifests Summary

**An Effect rc bump is now a two-line edit in `pnpm-workspace.yaml`, and the tarball that edit produces has been unpacked and read — `peerDependencies.effect` comes out `^4.0.0-rc.112`, not `4.0.0-rc.112`.**

## What Was Built

### The two-catalog policy

`pnpm-workspace.yaml` now carries two catalogs, and which one a dependency reads from is decided entirely by which manifest field consumes it:

| Catalog | Consumed by | Holds | Why |
|---|---|---|---|
| `catalog:` (default) | `devDependencies` only | `effect: 4.0.0-rc.112`, `@effect/vitest: 4.0.0-rc.112` | reproducible local dev — ADR-EC-012's exact-pin requirement |
| `catalogs.peer` | `peerDependencies` only | `effect: ^4.0.0-rc.112`, `vitest: ">=4.1.0 <5.0.0"` | Pitfall 20 — the value is what consumers get |

The `vitest` peer range is copied verbatim from `@effect/vitest@4.0.0-rc.112`'s own installed manifest, which was read off disk to confirm it (`{"vitest": ">=4.1.0 <5.0.0", "effect": "^4.0.0-rc.112"}`) rather than trusted from the research doc.

### Both manifests, reshaped

`main`, `types` and `private` are gone from both packages; the `exports` map is the only resolution surface. Both gained `files`, `sideEffects: false`, `engines.node >=20`, `license`, `description`, `keywords`, `repository`/`homepage`/`bugs`, and a `publishConfig` carrying `access`, `provenance` and the `dist`-pointing `exports` override. `@effect-cucumber/gherkin` has no `effect` entry in any dependency field. `@effect-cucumber/vitest` depends on it via `workspace:^`.

## Pitfall 20, Verified by Unpacking

The whole point of this plan is a property of the **packed tarball**, which the source manifest cannot show — `packages/vitest/package.json` says `catalog:peer` either way. So the tarball was packed and read:

```
"dependencies":     { "@effect-cucumber/gherkin": "^0.0.0" }
"peerDependencies": { "effect": "^4.0.0-rc.112",
                      "@effect/vitest": "^4.0.0-rc.112",
                      "vitest": ">=4.1.0 <5.0.0" }
"devDependencies":  { "effect": "4.0.0-rc.112", ... }
"exports":          { "./package.json": "./package.json", ".": "./dist/index.js" }
"publishConfig":    { "access": "public", "provenance": true }
```

Three things are visible here and nowhere else: the peer specifiers expanded to **ranges** while the dev specifiers expanded to **pins** from the same `catalog:` mechanism; `publishConfig.exports` was consumed by npm and the top-level `exports` was rewritten to `dist`; and `workspace:^` became `^0.0.0`.

Tarball contents are exactly the six intended entries — `package/package.json`, `package/src/index.ts`, and the four `dist` files. Before `files` was added, the same pack shipped `test/tsgo-gate/**`, `tsconfig.json` and `tsconfig.tsbuildinfo`.

## Finding: an invalid named catalog is invisible to `pnpm install`

The lockfile records only `catalogs.default` — peer dependencies are not written into `importers`, so the named `peer` catalog leaves **no trace in `pnpm-lock.yaml` at all**. That raised the question of whether pnpm validates `catalog:peer` references. Probed directly by mutating `peerDependencies.effect` to `catalog:typo`:

| Command | Result |
|---|---|
| `pnpm install` | **EXIT 0** — silent, "Already up to date" |
| `pnpm pack` | EXIT 1 — `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC No catalog entry 'effect' was found for catalog 'typo'` |

So a typo in a named-catalog reference behind a `peerDependency` survives install, lint and build untouched and only surfaces at pack time. It fails loudly when it does surface — but `pnpm install` exiting 0 is not evidence the catalog reference is valid. This is the same class of trap as 01-02's tsgo gate and 01-03's Mutation C: the check that everyone runs is blind to the failure. It is a direct argument for 01-06 putting `pnpm pack` in the merge gate, not only in a release job.

The manifest was restored from git and confirmed byte-identical to `d37ac5c` (`diff` against `git show HEAD:...`), and `pnpm install` re-run clean afterwards.

## The `exports`-at-source Risk That Did Not Materialise

The plan flagged that pointing dev-time `exports` at `./src/index.ts` while both packages are `composite` project references could produce TS6307 ("file is not listed within the file list of project"), with a documented fallback of keeping dev-time `exports` at `dist`.

It did not happen, and this was checked two ways rather than trusting an incremental `tsc -b`:

1. **`tsc -b --force`** — full non-incremental rebuild of both projects — **EXIT 0**. (Plain `tsc -b` would have been meaningless here; the tsbuildinfo predates the exports change.)
2. **`--traceResolution`** confirms the path actually taken:
   ```
   Using 'exports' subpath '.' with target './src/index.ts'.
   Resolving real path ... result '.../packages/gherkin/src/index.ts'.
   ```
   `node --input-type=module -e "import.meta.resolve('@effect-cucumber/gherkin')"` independently returns the same source file, so Node's resolver and TypeScript's agree.

The plan's fallback was therefore **not** taken: dev-time `exports` stay at source.

## Task Commits

1. **Task 1: two-catalog version policy** — `2da5869` (chore)
2. **Task 2: publishable ESM-only manifests** — `d37ac5c` (feat)

## Files Modified

- `pnpm-workspace.yaml` — default catalog (pins) + named `peer` catalog (ranges), with the reasoning inline as comments
- `package.json` — root `typescript` / `vitest` devDeps now read `catalog:`
- `packages/vitest/package.json` — full reshape; peers `catalog:peer`, devDeps `catalog:`, `workspace:^` on gherkin
- `packages/gherkin/package.json` — full reshape; cucumber deps unchanged, still no `effect`
- `pnpm-lock.yaml` — catalog resolutions recorded; `workspace:*` → `workspace:^`
- `.planning/phases/01-workspace-toolchain-and-dependency-policy/deferred-items.md` — new; two out-of-scope items

## Verification Results

| # | Check | Result |
|---|---|---|
| 1 | `pnpm install` | EXIT 0 |
| 2 | `pnpm-workspace.yaml` declares `catalogs:` | present |
| 3 | `peerDependencies.effect` is not a bare exact version | `catalog:peer`, packs to `^4.0.0-rc.112` |
| 4 | packed `peerDependencies` are ranges, packed `devDependencies` are pins | confirmed by `tar -xzO` |
| 5 | packed `exports["."]` is `./dist/index.js` (both packages) | confirmed |
| 6 | no `main` / `types` / `private` (both packages) | confirmed, source and packed |
| 7 | `files` / `sideEffects: false` / `engines.node` present | confirmed |
| 8 | gherkin has no `effect` in deps/devDeps/peerDeps/optionalDeps | confirmed |
| 9 | tarball contents = `package.json` + `src/index.ts` + 4 `dist` files | confirmed, both packages |
| 10 | `tsc -b --force` (full rebuild, exports pointing at source) | EXIT 0 |
| 11 | `pnpm lint` (oxlint + dprint check) | EXIT 0 |
| 12 | `pnpm verify:tsgo-gate` (01-02 regression) | EXIT 0 |
| 13 | `pnpm verify:oxlint-plugin` (01-03 regression) | EXIT 0 |
| 14 | `pnpm verify:spec` traceability | EXIT 0 |
| 15 | working tree clean apart from planning docs | confirmed |

Checks 12–14 were run because `packages/vitest/test/tsgo-gate/` is the 01-02 fixture tree and this plan changed how `packages/vitest` resolves — worth confirming the earlier gates survived. `tsconfig.json` `include: ["src"]` was not touched, so the fixture tree stays outside the build graph.

## Deviations from Plan

None — plan executed as written, and both of its pre-authorised fallbacks (literal peer ranges instead of a named catalog; dev-time `exports` at `dist` instead of source) went **untaken** because the primary path worked. Both non-triggers are recorded above with the evidence that settled them.

Two out-of-scope observations were logged to `deferred-items.md` rather than acted on: the absent `LICENSE` file, and the fact that `workspace:^` packs as `^0.0.0` (semantically exact while the version is `0.0.x`, by design — recorded so nobody reverts it to the strictly worse `workspace:*`).

## Known Gaps

- **`publishConfig.provenance: true` is untested.** It only takes effect under a real `npm publish` with OIDC; nothing in this milestone publishes.
- **The peer ranges are asserted against `@effect/vitest@4.0.0-rc.112` only.** Nothing checks that a future `effect` bump keeps the workspace's peer range consistent with what `@effect/vitest` itself declares. A drift check belongs in 01-06 if it is wanted.
- **`"license": "MIT"` with no LICENSE file** — see `deferred-items.md`.
- **Effect rc bumps remain a consumer-visible change** (STACK §3.3): the two-catalog setup makes the bump a one-line edit, but says nothing about changelogs. That is a changesets concern, out of scope here.

## Next Plan Readiness

01-05 verifies the packed tarball. Its subject now exists in final form, and this plan's pack runs are a preview of what it will assert — plus one finding it should absorb: `pnpm install` does not validate named-catalog references, so the pack check is the only thing standing between a `catalog:` typo and a broken publish.

## Self-Check: PASSED

- `pnpm-workspace.yaml`, `package.json`, `packages/gherkin/package.json`, `packages/vitest/package.json`, `pnpm-lock.yaml`, `deferred-items.md` — all present on disk.
- Commits `2da5869` and `d37ac5c` verified present in `git log`.
- Working tree byte-identical to `d37ac5c` for all source files after the catalog-typo probe was reverted.
