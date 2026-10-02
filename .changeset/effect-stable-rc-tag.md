---
"@effect-cucumber/gherkin": patch
"@effect-cucumber/vitest": patch
---

Effect v4 is stable (`effect`, `@effect/platform-node` and `@effect/vitest` all have `4.0.0` as their
npm `latest`). The workspace's dev catalog now follows the `rc` dist-tag instead of an exact pin
(`pnpm-lock.yaml` still pins what is installed, currently `4.0.0-rc.118`), and the peer range stays
`^4.0.0-rc.116`, which accepts every later rc and stable `4.0.0`. The README install lines drop
the `@rc` tags: a bare `pnpm add effect @effect/platform-node @effect/vitest` now installs v4.
No source changes in either package.
