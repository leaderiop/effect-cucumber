# Phase 1: Workspace, Toolchain, and Dependency Policy - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The two-package workspace builds, lints, formats, and type-checks under the
Effect v4 ecosystem convention, and `@effect/tsgo`'s Layer diagnostics
(`missingLayerContext`/`missingEffectContext`) are a real build gate, not
advisory. No library source code is written in this phase — it's pure
tooling/CI/dependency policy, enabling every phase after it.

</domain>

<decisions>
## Implementation Decisions

### Code style conventions
- No semicolons (ASI) — `semiColons: "asi"`, matching Effect's own
  `dprint.json` exactly (verified byte-identical across `effect-ts/effect`
  and `effect-machine`).
- Copy Effect's `dprint.json` wholesale — inherit every setting (quote
  style, line width, trailing commas, everything), not a cherry-picked
  subset. Maximum ecosystem consistency.
- `dprint --check` is a CI merge gate, not just editor-integration
  discipline — matches Effect's own `"lint": "oxlint -f unix && dprint
  check"` pattern.
- No other style deviations from Effect's convention (naming, import order,
  comment style) — inherit everything as-is, consistent with `AGENTS.md`'s
  existing import conventions.

### Vendored Effect lint rules (`tools/oxlint/effect/`)
- Adopt: commit the currently-untracked `tools/oxlint/effect/` and wire it
  into the oxlint config (`jsPlugins: [{ name: "effect", specifier:
  "./tools/oxlint/effect/index.ts" }]`, per `STACK.md` §5.1a).
- A vendored-rule violation fails CI (not warn-only) — consistent with the
  dprint/tsgo enforcement decisions above.
- Keep all 4 vendored rules (`no-bigint-literals`,
  `no-import-from-barrel-package`, `no-js-extension-imports`,
  `no-opaque-instance-fields`) — `no-unused-internal` stays excluded (its
  `typescript <7.0.0` peer range is incompatible with this project's TS 7).
  `no-import-from-barrel-package` is the one with real teeth here: it's the
  mechanical enforcement of `AGENTS.md` §3's namespace-import rule, which is
  currently just prose with nothing checking it.
- Re-sync policy: manual and occasional (run the resync command in
  `tools/oxlint/effect/ATTRIBUTION.md` when it seems worth it) — not
  automated. Low-traffic rules, low risk of drift mattering much before a
  manual check would catch it anyway.

### CI scope for this phase
- Node matrix: **22 and 24** — 24 as Active LTS primary, 22 kept for
  broader compatibility signal.
- The weekly `effect@rc` canary CI job (checking for breakage against a
  newer rc before it's otherwise noticed) is **deferred**, not built in this
  phase — it's research's own prescription, not an ecosystem convention (no
  comparable project does this). Revisit once the core test suite exists
  and is worth protecting against a moving prerelease.
- pnpm stays on the currently-installed **10.26.1** — no forcing function
  to bump to 11.x yet (`pnpm install` already succeeds, workspace linking
  already verified).
- Set up **pnpm catalogs** for the `effect`/`@effect/vitest`/`vitest`/
  `typescript` version pins in this phase — one bump point across both
  packages instead of duplicated pins. The catalog entry for the peer
  dependency (`effect`, `@effect/vitest` in `@effect-cucumber/vitest`) must
  hold a **range** (`^4.0.0-rc.112`), not the exact rc pin — a catalog entry
  gets baked verbatim into the published peer range at pack time (Pitfall
  20), and an exact pin there would be wrong for consumers.

### Additional tooling adoption
- **publint**: adopt now — directly validates the `publishConfig.exports`
  swap this phase is already setting up; cheap, high-signal, catches
  publish-time footguns before they ship.
- **madge** (circular import detection): adopt now, even though no source
  files exist yet — wired into CI from the very first source file in Phase
  2 onward, rather than retrofitted later.
- **pkg-pr-new** (preview releases per PR): adopt now, set up alongside the
  rest of CI in this phase.

### Claude's Discretion
- Exact `oxlint`/`dprint`/CI config file structure and script wiring
  (`package.json` scripts, GitHub Actions workflow YAML shape) — the
  *what* (settings, tools, versions) is decided above; the *how* (file
  layout, script names) is implementation detail.
- Exact wording/structure of any README install-instruction changes needed
  to carry `@rc` explicitly (Pitfall 19).

</decisions>

<specifics>
## Specific Ideas

No specific product/behavior references — this is a tooling phase, decisions
above are the concrete specifics. The guiding principle throughout: copy the
Effect v4 ecosystem's own conventions (its `main` branch, `effect-machine`,
`effect-mq`) verbatim wherever a convention already exists, rather than
inventing a bespoke one.

</specifics>

<deferred>
## Deferred Ideas

- The weekly `effect@rc` canary CI job — not this phase; revisit once the
  core test suite exists.
- pnpm 11.x bump — not forced now; revisit if a real need arises.
- Everything in `spec/roadmap.md` § Planned / `.planning/ROADMAP.md` §
  Deferred to Next Milestone (REUSE-01, OUTLINE-01, RETRY-01, LINT-01,
  publishing to npm) — out of this phase's domain entirely, already tracked
  elsewhere.

</deferred>

---

*Phase: 01-workspace-toolchain-and-dependency-policy*
*Context gathered: 2026-08-28*
