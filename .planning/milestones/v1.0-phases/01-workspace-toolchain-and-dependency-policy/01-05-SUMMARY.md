---
phase: 01-workspace-toolchain-and-dependency-policy
plan: 05
subsystem: packaging-verification-and-install-docs
tags: [publint, madge, pack-verification, pitfall-19, pitfall-20, esm-only, readme, effect-v4-rc]

requires:
  - "01-04 (publishable ESM-only manifests, two-catalog version policy — the shape this plan asserts against)"
  - "01-03 (dprint formats markdown — the three READMEs must survive `dprint check`)"
  - "01-01 (`pnpm build` == `tsc -b`; the tarball is only as correct as `dist/`)"
provides:
  - "`pnpm verify:pack` — builds, packs and unpacks both packages, then asserts the PUBLISHED manifest shape (11 assertions per package)"
  - "an executable Pitfall 20 guard, proven non-vacuous by mutation: an exact peer pin fails by name while `pnpm install` still exits 0"
  - "an executable ADR-EC-015 guard: gherkin declares no `effect` key in any dependency field of the packed manifest"
  - "publint wired against the extracted tarball directory, output now completely silent (no errors, no suggestions)"
  - "`pnpm circular` — madge over `packages/*/src`, wired before the first source file exists"
  - "three READMEs; the two whose install line pulls in Effect carry `effect@rc` and `@effect/vitest@rc` plus the Pitfall 19 explanation"
  - "empirical proof that npm ships README.md in the tarball regardless of the `files` array"
affects:
  - "01-06 (CI — `verify:pack` and `circular` are merge-gate candidates; `pnpm pack` is still the ONLY command that catches a broken named-catalog reference)"
  - "every future Effect rc bump — `verify:pack` now fails loudly if the bump is made in the wrong catalog"
  - "Phase 2 onward — `pnpm circular` is already wired, so the first real source file inherits it"
  - "the npm package pages — README.md is now in both tarballs"

tech-stack:
  added:
    - "publint 0.3.24 (root devDependency, exact pin)"
    - "madge 8.0.0 (root devDependency, exact pin)"
  patterns:
    - "packaging claims are asserted against an unpacked tarball, never against the source manifest — the source manifest is byte-identical whether the catalog behind `catalog:peer` holds a range or a pin"
    - "a guard is only trusted after a mutation test shows it failing for the right reason (same method as 01-02's tsgo gate and 01-03's Mutation C)"
    - "JSON assertions run in `node -e` with the document passed as argv — no `jq` (undeclared dependency), no `require`/`import` (agnostic to how node evaluates `-e`)"
    - "install instructions carry the dist-tag explicitly wherever `latest` points at the wrong major"

key-files:
  created:
    - scripts/verify-pack.sh
    - README.md
    - packages/gherkin/README.md
    - packages/vitest/README.md
  modified:
    - package.json
    - packages/gherkin/package.json
    - packages/vitest/package.json
    - pnpm-lock.yaml
    - .planning/phases/01-workspace-toolchain-and-dependency-policy/deferred-items.md

decisions:
  - "Task order swapped: the READMEs (plan Task 2) were written and committed BEFORE the script (plan Task 1). Task 1's script asserts README presence in the tarball, so executing in plan order would have left an intermediate commit where `pnpm verify:pack` fails. Swapping keeps both commits green with no change to either task's content."
  - "No manifest change was needed to ship the READMEs. `files: [\"src/**/*.ts\", \"dist\"]` does not name README.md, but npm always includes it — verified by packing and listing the tarball rather than trusting the documented behaviour. The script asserts it rather than assuming it."
  - "`repository.url` canonicalised to `git+https://...` in both packages (publint's only standing suggestion). Fixed rather than tolerated so publint's output is silent — a check with one permanently-ignored line trains people to ignore the next one."
  - "`madge --ts-config` NOT used: it crashes madge 8.0.0 on TypeScript 7.0.2. The plain `--circular --extensions ts` invocation from the plan stands; madge's inability to follow the cross-package import is logged to deferred-items.md with the reason it is acceptable."
  - "The Pitfall 20 guard tests `/^[0-9]/` (a bare exact version) rather than whitelisting a caret. A pin is the specific failure mode Pitfall 20 describes; `>=x <y`, `^x` and `~x` are all legitimate peer ranges and none should trip the guard."

duration: ~14m
completed: 2026-08-28
---

# Phase 01 Plan 05: Packed-Tarball Verification and Install Instructions Summary

**`pnpm verify:pack` unpacks both tarballs and asserts eleven properties of the manifest consumers actually receive — and pinning the peer catalog proves it fails by name, at a point where `pnpm install` is still exiting 0.**

## What Was Built

### `scripts/verify-pack.sh`

Builds, then for each package: packs into a temp dir, extracts it, and asserts against `package/package.json` and the `tar -tzf` listing. Temp dir removed by `trap`. One `✓` per assertion, `pack shape: OK` at the end.

| # | Assertion | Failure reason it names |
|---|---|---|
| 1 | `exports["."]` ends with `dist/index.js` | "publishConfig.exports did not apply" |
| 2 | no `main` / `types` / `typings` | exports map must be the only resolution surface |
| 3 | no `require` condition anywhere in `exports` (recursive walk) | "ESM-only violated" |
| 4 | no `.cjs` in the tarball listing | "ESM-only violated" |
| 5 | `dist/index.js` + `dist/index.d.ts` present in the tarball | exports points at a file that is not shipped |
| 6 | `README.md` present in the tarball | "the npm page would be blank" |
| 7 | no `catalog:` / `workspace:` in any of the four dependency fields | "unexpanded protocol in published manifest" |
| 8 | **vitest only** — `peerDependencies.effect` not `/^[0-9]/` | Pitfall 20, by name |
| 9 | **vitest only** — `peerDependencies["@effect/vitest"]` not `/^[0-9]/` | Pitfall 20, by name |
| 10 | **gherkin only** — no `effect` key in any dependency field | ADR-EC-015 |
| 11 | `publint` against the extracted directory | publint's own output |

The manifest assertions run in `node -e` with the JSON passed as `argv` — no `jq` (not a declared dependency of this repo, and absent on plenty of CI images), and no `require`/`import`, so the program does not care whether node evaluates `-e` as ESM or CJS under the root `"type": "module"`.

A method note at the top of the script explains why every assertion reads an unpacked tarball, and states plainly that an assertion rewritten to read `packages/*/package.json` is vacuous.

### The three READMEs

Root, `packages/vitest`, `packages/gherkin`. All three carry a Status section saying plainly that nothing is published to npm and no library code has shipped, and point at `spec/roadmap.md` as the built-vs-specified source of truth (AGENTS.md §4). No usage examples were invented for an API that does not exist.

The root and `packages/vitest` READMEs carry:

```sh
pnpm add -D @effect-cucumber/vitest effect@rc @effect/vitest@rc vitest
```

followed by the call-out explaining that `latest` for `effect` is still the v3 line, and the requirements line naming Effect `4.0.0-rc.112` or newer and vitest `>=4.1.0 <5.0.0`. `packages/gherkin/README.md` carries `pnpm add @effect-cucumber/gherkin`, no call-out, and a Node-only requirements line — it names neither `effect` nor `@effect/vitest` anywhere, matching the package's no-Effect-dependency invariant.

## The Mutation Test: the Pitfall 20 Guard Is Not Vacuous

A guard that has never been seen failing is not a guard. `pnpm-workspace.yaml`'s `peer` catalog was temporarily flipped to the exact pin:

```yaml
peer:
  effect: 4.0.0-rc.112     # was ^4.0.0-rc.112
```

| Command | Result |
|---|---|
| `pnpm install` | **EXIT 0** — silent |
| `pnpm verify:pack` | **EXIT 1** |

with exactly this output, after the `@effect/vitest` peer passed on the line above it — so the check discriminates, it does not blanket-fail:

```
  ✓ peerDependencies.@effect/vitest = ^4.0.0-rc.112  (a range, not a pin)

  ✗ peerDependencies.effect is an exact pin (4.0.0-rc.112) -- Pitfall 20: the catalog
    expanded a pin into the published peer range; consumers on a different rc cannot
    resolve this package. Fix the `peer` catalog in pnpm-workspace.yaml, not this
    package.json.
```

`pnpm-workspace.yaml` was then restored and confirmed byte-identical to `HEAD` (`git diff --stat` empty), and `pnpm install` re-run clean.

This reproduces 01-04's finding in executable form: the failure is invisible to `pnpm install`, invisible to `lint`, invisible to `build`, and invisible in the source manifest — which reads `catalog:peer` in both the passing and the failing run.

## Finding: npm Ships README.md Regardless of `files`

`files` is `["src/**/*.ts", "dist"]` on both packages and does not name `README.md`. The README is shipped anyway — npm always includes `package.json`, `README`, `LICENSE` and the main entry. Confirmed by packing after writing the READMEs:

```
package/package.json  package/README.md  package/src/index.ts
package/dist/index.js  package/dist/index.js.map
package/dist/index.d.ts  package/dist/index.d.ts.map
```

This was checked rather than assumed, because the carried-forward note into this plan said the opposite (that anything shipped must be named in `files`). The script asserts the README's presence rather than relying on the behaviour, so if pnpm's packing ever diverges from npm's it fails loudly instead of publishing a package with a blank npm page.

## Task Commits

| Task | Name | Commit | Type |
|---|---|---|---|
| 2 (run first) | Root and per-package READMEs with `@rc` install instructions | `688f643` | docs |
| 1 (run second) | `scripts/verify-pack.sh` and the circular-import check | `46b75e1` | feat |

## Verification Results

| # | Check | Result |
|---|---|---|
| 1 | `pnpm verify:pack` | EXIT 0 — 11 assertions × 2 packages |
| 2 | Pitfall 20 guard fails on an exact peer pin | EXIT 1, named message (above) |
| 3 | `pnpm install` during that same mutation | EXIT 0 — the guard is the only thing that catches it |
| 4 | `publint` on both extracted tarballs | no errors, and now no suggestions either |
| 5 | `pnpm circular` | EXIT 0, "No circular dependency found!" |
| 6 | root + `packages/vitest` READMEs grep `effect@rc` and `@effect/vitest@rc` | both present in both files |
| 7 | `packages/gherkin/README.md` has its own install line, names neither package | confirmed (`grep` for `` `effect` ``/`@effect/vitest` returns nothing) |
| 8 | `README.md` present in both tarballs | confirmed by `tar -tzf` |
| 9 | `pnpm lint` (oxlint + dprint check, markdown included) | EXIT 0 |
| 10 | `pnpm build` | EXIT 0 |
| 11 | `pnpm verify:tsgo-gate` (01-02 regression) | EXIT 0 |
| 12 | `pnpm verify:oxlint-plugin` (01-03 regression) | EXIT 0 |
| 13 | `pnpm verify:spec` (traceability regression) | EXIT 0 |
| 14 | `pnpm-workspace.yaml` byte-identical to HEAD after the mutation test | confirmed |
| 15 | no file deletions across either commit | confirmed (`git diff --diff-filter=D`) |
| 16 | `scripts/verify-pack.sh` committed executable | confirmed, mode `100755` |

## Deviations from Plan

### 1. [Rule 3 - Blocking] Task order swapped

- **Found during:** reading Task 1 against Task 2.
- **Issue:** Task 1's script asserts `README.md` is in the tarball, but the READMEs are Task 2's output. Task 1's stated verification (`pnpm verify:pack` → `EXIT=0`) is unsatisfiable in plan order — the commit would have been red until the next one landed.
- **Fix:** executed Task 2 first, then Task 1. Neither task's content changed; only the order.
- **Commits:** `688f643` (Task 2), `46b75e1` (Task 1).

### 2. [Rule 2 - Correctness] `repository.url` canonicalised in both manifests

- **Found during:** Task 1, first clean `verify:pack` run.
- **Issue:** publint's only remaining output on both packages was a suggestion that `repository.url` should be the full git URL (`git+https://...`). Not an error — `verify:pack` passed with it — but it meant the newly-adopted check shipped with a permanently-ignored line in its output.
- **Fix:** `https://github.com/leaderiop/effect-cucumber.git` → `git+https://github.com/leaderiop/effect-cucumber.git` in both packages. publint is now completely silent.
- **Files modified:** `packages/gherkin/package.json`, `packages/vitest/package.json`. These are outside the plan's `files_modified` list (01-04 owns them), which is why it is recorded here.
- **Commit:** `46b75e1`.

### 3. [Rule 3 - Blocking] `madge --ts-config` abandoned

- **Found during:** Task 1, investigating madge's `Skipped 1 file` warning.
- **Issue:** `madge --ts-config tsconfig.base.json` crashes with `TypeError: Cannot read properties of undefined (reading 'readFile')` — madge 8.0.0 declares `typescript@^5.4.4` as a peer and this repo is on 7.0.2 (pnpm warned about the unmet peer at install time).
- **Fix:** kept the plan's plain `madge --circular --extensions ts packages/*/src`, which works and reports no cycles. The resulting coverage limit is logged to `deferred-items.md` with the argument for why it is acceptable.
- **Commit:** `46b75e1`.

## Known Gaps

- **`pnpm circular` covers intra-package cycles only.** madge skips the one cross-package bare import (`@effect-cucumber/gherkin`) because its resolver does not follow an `exports` map. A cycle *between* the two packages would not be reported — but `tsc -b` rejects circular project references outright, and the dependency is architecturally one-way (ADR-EC-015), so that direction is covered by `pnpm build`. Full reasoning in `deferred-items.md`.
- **`verify:pack` does not check the `dist` output itself**, only that the files exist and are not CJS. Nothing asserts that `dist/index.js` is importable or that `dist/index.d.ts` resolves for a consumer. A real install-and-import smoke test against the tarball belongs in 01-06 or later; `publint` covers the static half of this.
- **The `@rc` install lines will go stale.** They are correct while `effect@latest` is on the v3 line; once `4.0.0` ships stable, all three READMEs and the call-out need revisiting. Nothing checks this — the tag advice is prose, not an assertion.
- **`publishConfig.provenance: true` is still untested** (carried from 01-04) — it only takes effect under a real `npm publish` with OIDC.
- **Still no `LICENSE` file** (carried from 01-04, `deferred-items.md`). `verify:pack` deliberately does not assert one, since asserting a file nobody has written would just be a permanently red check.

## Next Plan Readiness

01-06 (CI) inherits two ready-made merge-gate candidates, `verify:pack` and `circular`, alongside the three verify scripts from 01-02/01-03. The argument for putting `verify:pack` in the *merge* gate rather than a release job is now demonstrated rather than asserted: during the mutation test, `pnpm install`, `pnpm lint` and `pnpm build` all passed against a workspace that would have published a broken peer range.

## Self-Check: PASSED

Files verified present on disk:

- `scripts/verify-pack.sh` — FOUND (mode 100755)
- `README.md` — FOUND
- `packages/gherkin/README.md` — FOUND
- `packages/vitest/README.md` — FOUND

Commits verified present in `git log`:

- `688f643` — FOUND
- `46b75e1` — FOUND

Working tree clean apart from this plan's planning docs.
