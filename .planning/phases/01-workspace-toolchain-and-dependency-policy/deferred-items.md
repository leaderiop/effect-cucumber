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
