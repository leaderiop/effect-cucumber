---
"@effect-cucumber/gherkin": minor
"@effect-cucumber/vitest": minor
---

Effect v4 is stable, so the supported range is now stable Effect v4: the `effect`, `@effect/platform-node`
and `@effect/vitest` peer ranges are `^4.0.0` (they were `^4.0.0-rc.116`, which also accepted release
candidates). Release candidates are no longer supported; install the stable release. The workspace's own
dev dependencies now follow npm's `latest` dist-tag instead of a pin, with the lockfile pinning the
installed build. No source changes in either package.
