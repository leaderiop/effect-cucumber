# Deferred Items — Phase 01

Out-of-scope discoveries logged during execution. Not fixed in the plan that
found them.

---

## No `LICENSE` file anywhere in the repo (found during 01-04, Task 2)

Both `packages/*/package.json` now declare `"license": "MIT"` (as 01-04 Task 2
specified), but there is no `LICENSE` file at the repo root or in either package
directory, so neither packed tarball contains license text. npm auto-includes a
`LICENSE` from the *package* directory regardless of the `files` array, so the
fix is a `LICENSE` file per package (or a root one plus symlinks/copies).

Not fixed in 01-04: adding a license text file is a legal/repo-hygiene change,
not a manifest-shape change, and nothing publishes in this milestone. Note that
`tools/oxlint/effect/` vendors MIT-licensed Effect code, so the attribution
question is already live independent of publishing.

**Suggested owner:** 01-06 (CI/release scaffolding) or whichever plan first
scaffolds a release workflow.

---

## `workspace:^` packs as `^0.0.0`, which is an exact match (found during 01-04, Task 2)

`packages/vitest` depends on `@effect-cucumber/gherkin` via `workspace:^`, which
expands at pack time to `"^0.0.0"`. Under semver, a caret on `0.0.x` allows only
`0.0.0` — so today this behaves identically to an exact pin. It becomes a real
range as soon as the packages leave `0.0.0`, and the intended changesets `fixed`
group (STACK §5.7) versions both packages in lockstep anyway.

No action needed; recorded so nobody "fixes" `workspace:^` back to `workspace:*`
(which packs as a bare `0.0.0`, strictly worse) on the strength of the packed
output looking pinned.

---

## `madge` cannot follow cross-package imports (found during 01-05, Task 1)

`pnpm circular` reports `Skipped 1 file` — run it with `--warning` and the
skipped file is named: `@effect-cucumber/gherkin`, the bare specifier
`packages/vitest/src/index.ts` imports. madge's resolver (`filing-cabinet`)
does not follow an `exports` map, so it cannot see through the workspace link
and treats the import as an unresolvable external.

Consequence: `pnpm circular` covers **intra-package** cycles only. A cycle
*between* `@effect-cucumber/gherkin` and `@effect-cucumber/vitest` would be
invisible to it.

Not fixed in 01-05, for two reasons. First, the cross-package case is already
covered elsewhere: `tsc -b` rejects circular project references outright, so
`pnpm build` is the gate for that direction, and the dependency is
architecturally one-way anyway (gherkin is the leaf — ADR-EC-015). Second, the
obvious lever does not work: `madge --ts-config tsconfig.base.json` crashes with
`TypeError: Cannot read properties of undefined (reading 'readFile')` on
madge 8.0.0, which declares `typescript@^5.4.4` as a peer while this repo is on
7.0.2 (pnpm warns about the unmet peer at install time).

**Suggested owner:** revisit when madge supports TS 7, or drop madge for a
resolver that honours `exports` if intra-package coverage ever stops being
enough.
