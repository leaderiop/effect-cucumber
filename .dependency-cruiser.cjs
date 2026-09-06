// .dependency-cruiser.cjs
//
// Authoritative, declarative package-boundary enforcement for packages/*/src, consolidating
// what `madge --circular` and part of scripts/verify-no-runner-dep.sh already checked plus one
// genuinely new rule. See ADR-EC-050.
//
// `.cjs` (not `.js`): root package.json declares "type": "module", so a plain `.js` file here
// would be parsed as ESM and `module.exports` would throw.
//
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "No import cycle across packages/*/src. Supersedes `pnpm circular` (madge) — ADR-EC-050. " +
        "Proven equivalent to madge's own output on this codebase before madge was retired.",
      from: {},
      to: { circular: true }
    },
    {
      name: "gherkin-no-runner-dep",
      severity: "error",
      comment:
        "@effect-cucumber/gherkin must never reach a test runner or a concrete platform " +
        "implementation from its source tree (ADR-EC-021). Defense in depth alongside " +
        "scripts/verify-no-runner-dep.sh, which additionally asserts the package.json manifest " +
        "side (dependencies vs peerDependencies) — a check this tool has no way to express, " +
        "since it only sees import graphs, never manifest fields. Do not retire that script.",
      from: { path: "^packages/gherkin/src/" },
      to: {
        path: "node_modules/(vitest|@effect/vitest|@effect/platform-(node|bun|deno))(/|$)"
      }
    },
    {
      name: "no-deep-import-across-package",
      severity: "error",
      comment:
        "packages/vitest/src may only reach @effect-cucumber/gherkin through its public barrel " +
        "(packages/gherkin/src/index.ts) — never a relative path into its internals. " +
        "@effect-cucumber/gherkin's own package.json exports map only publishes \".\" and " +
        "\"./package.json\", so a Node-resolved subpath import is already impossible; the real, " +
        "previously-unenforced gap this rule closes is a plain RELATIVE import that bypasses " +
        "package resolution entirely (e.g. `../../gherkin/src/DataTable.ts`).",
      from: { path: "^packages/vitest/src/" },
      to: {
        path: "^packages/gherkin/src/",
        pathNot: "^packages/gherkin/src/index\\.ts$"
      }
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "An orphan module under packages/*/src is likely dead code — secondary hygiene check, " +
        "not gating (severity: warn). Each package's own public entry point (index.ts) is a " +
        "known, deliberate exception.",
      from: {
        orphan: true,
        pathNot: ["(^|/)index\\.ts$", "\\.d\\.ts$"]
      },
      to: {}
    }
  ],
  options: {
    tsConfig: { fileName: "tsconfig.base.json" },
    doNotFollow: { path: "node_modules" },
    // dependency-cruiser's `exportsFields` defaults to `[]` — it does NOT read package.json
    // "exports" maps unless told to. Every package this ruleset needs to actually resolve
    // (`@effect/vitest`, `@effect/platform-{node,bun,deno}`, `effect`, and this repo's own two
    // workspace packages) is exports-map-only with no legacy "main" field, so without this line
    // every one of them stayed a bare, unresolved specifier — never touching a real
    // `node_modules/...` path — and `gherkin-no-runner-dep`'s `to.path` regex could never match.
    // Caught by this job's own Red-phase fixture (a `gherkin/src` file importing
    // `@effect/platform-node`, which stayed silently Green until this option was added). See
    // ADR-EC-050.
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "node", "default"]
    },
    // Anchored to `^packages/` on purpose — NOT the unanchored `(^|/)(test|dist)/` this started
    // as. That version matched a `/dist/` segment ANYWHERE in a RESOLVED path, which silently
    // deleted almost every external dependency edge from the graph: virtually every npm package
    // (including `vitest` itself, resolved to `node_modules/.../vitest/dist/index.js`, and
    // `effect`, resolved to `node_modules/.../effect/dist/Effect.js`) ships its build output under
    // a `dist/` directory. With the unanchored form, `gherkin-no-runner-dep`'s `to.path` never
    // matched anything — not because gherkin/src was clean, but because the one dependency
    // edge the rule exists to catch had already been erased before the rule ever ran. Caught by
    // this job's own Red-phase fixture (a `gherkin/src` file importing "vitest"): the unanchored
    // exclude produced a silent, incorrect Green. See ADR-EC-050.
    exclude: { path: "^packages/[^/]+/(test|dist)/" }
  }
}
