# Stack Research

**Domain:** Small TypeScript library monorepo in the Effect v4 ecosystem (test-runner library, Node target)
**Researched:** 2026-08-28
**Confidence:** HIGH for the core recommendations (verified against live npm registry, the Effect monorepo `main` branch, and two published third-party Effect v4 libraries; one claim verified by running TypeScript 7.0.2 locally). MEDIUM only where explicitly flagged.

---

## 0. Scope: what is LOCKED vs. what this document decides

### LOCKED — do not re-open, no alternatives offered

These are already decided by ADR and verified against installed packages. This document does not re-litigate them.

| Locked choice | Version in repo | Authority |
|---|---|---|
| `effect` v4 (rc), exact-pinned | `4.0.0-rc.112` | ADR-EC-012 |
| `@effect/vitest` v4 (rc) | `4.0.0-rc.112` | ADR-EC-012 |
| `@cucumber/gherkin` | `^42.0.1` | ADR-EC-011 |
| `@cucumber/cucumber-expressions` | `^20.1.0` | ADR-EC-011, ADR-EC-007 |
| `vitest` v4 | `^4.1.0` | spec/overview.md |
| pnpm workspaces | `pnpm@10.26.1` | ADR-EC-013 |
| TypeScript + project references (`tsc -b`) | `typescript@^7.0.2` | tsconfig.json / tsconfig.base.json |
| Two packages under `@effect-cucumber` scope | — | ADR-EC-013 |
| Node as the runtime target | — | spec/overview.md |

**Version currency check on the locked set (npm registry, 2026-08-28):** `effect@rc` = `4.0.0-rc.112` (current), `@effect/vitest@rc` = `4.0.0-rc.112` (current), `@cucumber/gherkin` latest = `42.0.1` (current), `@cucumber/cucumber-expressions` latest = `20.1.0` (current), `vitest` latest = `4.1.11` (v5 is only beta/rc), `typescript` latest = `7.0.2`, `pnpm` latest = `11.24.0`. Every locked pin is at or one patch behind the current release. Nothing in the locked set is stale.

### OPEN — what this document decides

Build tooling beyond `tsc -b`, linting, formatting, package manifest / publishing shape, dependency-kind conventions, prerelease pinning mechanics, versioning & release tooling, CI structure, and type-level testing.

---

## 1. Reference projects used as evidence

I read the actual configuration files of four Effect-ecosystem repos, not blog posts about them.

| Project | What it is | Why it's evidence |
|---|---|---|
| [`Effect-TS/effect`](https://github.com/Effect-TS/effect) `main` | The Effect monorepo, currently on the v4 rc line (`packages/effect` is `4.0.0-rc.112`) | The convention-setter. `@effect/vitest` lives here as `packages/vitest` — a small, single-purpose, vitest-adjacent package, i.e. the *closest structural analogue to `@effect-cucumber/vitest` that exists*. |
| [`typeonce-dev/effect-machine`](https://github.com/typeonce-dev/effect-machine) | `@typeonce/effect-machine@0.27.1`, published, Effect v4 rc | **Closest overall analogue**: small third-party pnpm monorepo, a handful of packages, exact-pinned to `effect@4.0.0-rc.112`, published to npm, changesets. |
| [`TeamWarp/effect-mq`](https://github.com/TeamWarp/effect-mq) | `effect-mq@0.7.0`, published, Effect v4 rc | Second independent third-party datapoint; uses pnpm/bun **catalogs** to pin the rc, and treats `@effect/vitest` as an *optional* peer for its `/testing` entrypoint. |
| [`Effect-TS/language-service`](https://github.com/Effect-TS/language-service) + [`floydspace/effect-aws`](https://github.com/floydspace/effect-aws) | Older Effect libraries | Used as **counter-evidence**: they still run the v3-era ESLint + `@effect/build-utils` stack. Shows what the *legacy* pattern looks like so it can be explicitly rejected. |

**The single most important structural finding:** the Effect ecosystem's library tooling **bifurcated** between v3 and v4. The v3-era template (`@effect/build-utils` + `@effect/eslint-plugin` + `@effect/dtslint` + dual CJS/ESM output) is frozen — `@effect/build-utils` last published **2025-07-17** and `@effect/eslint-plugin` last published **2025-04-24**, neither appears anywhere in the Effect monorepo's current `main`. Because effect-cucumber targets v4, every recommendation below follows the **v4 pattern**, and most "obvious" answers a search would surface (ESLint, tsup, dual publishing) are the *legacy* answers.

---

## 2. Recommended Stack

### Core development tools

| Technology | Version | Purpose | Why recommended |
|---|---|---|---|
| **oxlint** | `1.80.0` | Linting | Effect's `main` runs `"lint": "oxlint -f unix && dprint check"` with `oxlint@^1.79.0`. `@effect/eslint-plugin` is frozen at `0.3.2` (Apr 2025) and is absent from Effect's current devDeps. effect-mq and foldkit are independently on oxlint. Rust-native, no per-rule TS program cost, single binary. |
| **dprint** | `0.56.1` | Formatting | Effect's `main` and effect-machine ship **byte-identical `dprint.json` configs** — the strongest convention signal found in this research. Adopting it verbatim makes effect-cucumber's source visually indistinguishable from Effect's own, which matters for a library whose users read its examples next to Effect's docs. |
| **`tsc -b`** (TypeScript 7.0.2) | already locked | The **entire** build. No bundler. | Effect: `tsc -b tsconfig.json && pnpm babel`. effect-machine: `tsc -b tsconfig.build.json`. effect-mq: `tsc -p tsconfig.build.json`. Nobody in Effect v4 land bundles a library. |
| **@effect/tsgo** | `0.38.0` | Effect-aware type diagnostics + type-aware lint under TS 7 | Published **2026-08-27** (yesterday), actively developed. Effect's root `prepare` script is `effect-tsgo patch`, and its `tsconfig.base.json` registers the plugin. Ships diagnostics that are *directly* about this project's core value proposition — `missingLayerContext`, `missingEffectContext`, `floatingEffectInVitest`, `duplicatePackage`, `outdatedApi` (flags v4-removed APIs). |
| **@changesets/cli** | `3.0.1` | Versioning + changelog + publish | Effect uses `3.0.1` + `@changesets/changelog-github@1.0.0`; effect-machine uses `2.31.0`. Universal across the ecosystem. |
| **tstyche** | `7.2.3` | Type-level tests | Effect: `"test-types": "tstyche --target '>=5.9'"` in a dedicated CI job. effect-machine: `"test:types": "tstyche"`. Replaces the v3-era `@effect/dtslint`. |
| **pnpm** | `11.24.0` (upgrade from `10.26.1`) | Package manager (kind is locked; **version** is open) | Effect `main` is on `pnpm@11.20.0`; foldkit and overengineeringstudio on `11.8.0`. pnpm 11 adds `verifyDepsBeforeRun: error` (fails a script if `node_modules` is stale — removes a whole class of "works on my machine"), and the modern `allowBuilds` map. |

### Supporting libraries / optional tools

| Library | Version | Purpose | When to use |
|---|---|---|---|
| `oxlint-tsgolint` | `7.0.2001` | Type-aware oxlint rules via typescript-go | Only if you want Effect's type-aware rules enforced in `pnpm lint` rather than in `tsc`. `@effect/tsgo@0.38.0` explicitly declares support for `oxlint 1.79.0 / 1.80.0` + `oxlint-tsgolint 7.0.2001`. Cheaper alternative: run diagnostics in the `tsc` pass via the plugin's `ignoreEffect*InTscExitCode` options (what Effect does). |
| `publint` | `0.3.24` | Validates the published `exports` map | Recommended **because** of the `publishConfig.exports` swap pattern (§4.2): the whole risk of that pattern is shipping a manifest that points at `src/` or at files not in `files`. One command catches it. Note honestly: no Effect project uses it — effect-machine hand-rolls `pack:check` + `test:consumer` scripts instead. |
| `madge` | `8.0.0` | Circular-dependency check | Effect runs a dedicated `circular` CI job; `Effect-TS/language-service` also uses it. Cheap. Worth it once `packages/vitest` starts importing across module boundaries. |
| `pkg-pr-new` | `0.0.88` | Per-PR/commit preview installs from npm | Effect's `snapshot.yml` publishes every PR this way. For a pre-1.0 library with **zero** published versions, this lets people (and you) `npm i` a branch without touching the registry. Genuinely useful for this milestone. |
| `@babel/cli` + `babel-plugin-annotate-pure-calls` | `^8.0.4` / `^0.5.0` | Adds `/*#__PURE__*/` for downstream tree-shaking | **Defer.** Effect core does this (`babel dist --plugins annotate-pure-calls`); effect-machine, a small library, does not. effect-cucumber runs in vitest at test time, never ships to a browser bundle — the tree-shaking benefit is ~zero and it adds three Babel devDeps to the build. |

### Explicitly NOT part of the stack

See §6 for the full rejection table with reasons.

---

## 3. The prerelease-dependency problem (the actually-hard question)

ADR-EC-012 says: *pin an exact v4 rc version.* With two packages that both depend on `effect`, a naive exact pin means every Effect rc bump is a multi-file edit that is easy to get half-right — and a half-right bump means two copies of `effect` in the tree, which silently breaks `Context` identity.

### 3.1 Use pnpm catalogs — one pin, one bump point

**Recommendation (HIGH confidence — this is exactly what effect-mq does):**

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"

verifyDepsBeforeRun: error

catalog:
  effect: 4.0.0-rc.112
  "@effect/vitest": 4.0.0-rc.112
  vitest: 4.1.11
  typescript: 7.0.2
  "@types/node": 26.2.0
```

Packages then write `"effect": "catalog:"`. Verified against pnpm's official docs: *"The `catalog:` protocol is removed when running `pnpm publish` or `pnpm pack`"* — it is substituted with the concrete version in the published manifest, so consumers and non-pnpm users are unaffected. Catalogs shipped in pnpm 9.5 and matured through 10.12/11.22, so they work on the currently-installed `pnpm@10.26.1` too; the pnpm 11 upgrade is independent.

This satisfies ADR-EC-012's exact-pin requirement *literally* while reducing an rc bump to a one-line diff.

### 3.2 `effect` must be a `peerDependency`, not a `dependency`

**This is the highest-value correction in this document. Confidence: HIGH.**

Current state in the repo:

```jsonc
// packages/gherkin/package.json AND packages/vitest/package.json
"dependencies": { "effect": "4.0.0-rc.112", ... }
```

Every comparable library does the opposite:

- `@effect/vitest@4.0.0-rc.112` (published manifest): `"peerDependencies": { "vitest": ">=4.1.0 <5.0.0", "effect": "^4.0.0-rc.112" }` — zero runtime `dependencies`.
- `@typeonce/effect-machine@0.27.1`: `"peerDependencies": { "effect": "4.0.0-rc.112" }` (exact-pinned peer), `effect` also in `devDependencies`.
- `effect-mq@0.7.0`: `"peerDependencies": { "effect": ">=4.0.0-rc <5", "@effect/vitest": ">=4.0.0-rc <5" }` with `@effect/vitest` marked `optional` via `peerDependenciesMeta`.

**Why it matters concretely here:** if a consumer has `effect@4.0.0-rc.113` and `@effect-cucumber/vitest` hard-depends on `4.0.0-rc.112`, npm/pnpm installs *both*. `Context.Service` tags are identity-keyed — a `Layer` built with one copy will not satisfy a requirement declared against the other, and the failure surfaces as an inscrutable type or runtime mismatch, not as "you have two Effects". `@effect/tsgo` has a dedicated `duplicatePackage` diagnostic precisely because this is a known Effect-ecosystem footgun.

This does **not** contradict ADR-EC-012, which decides *which version* to target, not *which dependency field* to use. Recommended shape:

```jsonc
// packages/vitest/package.json
"peerDependencies": {
  "effect": "4.0.0-rc.112",
  "@effect/vitest": "4.0.0-rc.112",
  "vitest": ">=4.1.0 <5.0.0"
},
"dependencies": {
  "@effect-cucumber/gherkin": "workspace:^"
},
"devDependencies": {
  "effect": "catalog:",
  "@effect/vitest": "catalog:",
  "vitest": "catalog:"
}
```

Note `vitest: ">=4.1.0 <5.0.0"` — copied verbatim from `@effect/vitest`'s own published peer range. **vitest 5 exists as beta/rc today and is NOT supported by `@effect/vitest@4.0.0-rc.112`.** Do not chase it.

For `packages/gherkin`: ADR-EC-011 scopes it to "parsing, no Effect logic". If that holds literally, it should have **no `effect` dependency at all** — only `@cucumber/gherkin` and `@cucumber/cucumber-expressions` as real `dependencies` (they are genuine runtime deps, correctly placed). If it does use Effect types, make it a peer like above.

### 3.3 An Effect rc bump is a consumer-visible breaking change

Because the peer range is exact-pinned, bumping `effect` changes what consumers must have installed. **Prescription (MEDIUM confidence — my recommendation; I found no ecosystem doc stating this rule):** while on `0.x`, ship a **minor** changeset for every Effect rc bump and say so in the changelog entry. Consumers on the old rc must not silently receive a version that cannot resolve.

### 3.4 CI against a *moving* prerelease — honest finding

**I found no Effect-ecosystem project that runs CI against a floating `effect@rc`.** Effect-machine, effect-mq, and Effect itself all pin exactly and bump deliberately; none of the four repos has a Renovate or Dependabot config (`.github/` contains only `workflows/`, `actions/`, and issue templates). Reporting this as a genuine gap rather than inventing a convention.

**My prescription (MEDIUM confidence, clearly marked as not-ecosystem-convention):** add one scheduled workflow that is *allowed to fail loudly and separately*:

```yaml
# .github/workflows/canary.yml  — weekly cron + workflow_dispatch
# pnpm up effect@rc @effect/vitest@rc --no-frozen-lockfile  (throwaway, never committed)
# then: pnpm check && pnpm test
# on failure: open/update a tracking issue
```

Rationale: with an exact pin and no canary, you discover a breaking rc change at *bump* time, which is exactly when you least want a surprise. A weekly canary converts that into a standing, low-priority signal. Keep it out of the required-checks set so a broken upstream rc never blocks a PR.

---

## 4. Publishing shape

### 4.1 ESM-only. Do not dual-publish CJS. (HIGH confidence — verified empirically)

I unpacked the actual published tarballs:

- `effect@4.0.0-rc.112`: `"type": "module"`, exports map contains only `./dist/*.js` — **no `require` condition, no `dist/cjs`**.
- `@effect/vitest@4.0.0-rc.112`: I ran `npm pack` and listed the tarball. Contents are `dist/*.js`, `dist/*.d.ts`, source maps, three `src/` files, `AGENTS.md`, `CLAUDE.md`, `ai-docs/`. **Zero `.cjs` files.**
- `@typeonce/effect-machine@0.27.1` and `effect-mq@0.7.0`: both `"type": "module"`, both with `import`-only export conditions.

This is a change from Effect v3, which was dual-published via `@effect/build-utils`. **v4 dropped CJS entirely.**

**And for effect-cucumber it isn't even a choice.** I checked the locked cucumber deps: `@cucumber/gherkin@42.0.1` and `@cucumber/cucumber-expressions@20.1.0` are **both `"type": "module"` with no CJS build**. A CJS build of `@effect-cucumber/gherkin` could not `require()` its own primary dependency. Dual publishing is not merely unconventional here — it is impossible without bundling, and bundling a library is itself rejected (§6).

Additionally, dual publishing would reintroduce the dual-package hazard on top of the peer-dependency identity problem in §3.2. Two reasons pointing the same way.

### 4.2 The `publishConfig.exports` swap pattern

Effect core and effect-machine both use this. Dev-time `exports` point at TypeScript **source**; `publishConfig.exports` overrides them with `dist` at pack time. Result: no build step needed for in-repo development, correct artifacts on npm.

```jsonc
{
  "name": "@effect-cucumber/vitest",
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./package.json": "./package.json",
    ".": "./src/index.ts"
  },
  "files": ["src/**/*.ts", "dist"],
  "publishConfig": {
    "access": "public",
    "provenance": true,
    "exports": {
      "./package.json": "./package.json",
      ".": "./dist/index.js"
    }
  }
}
```

Notes on the current manifests, which use the older `main` + `types` + static `dist` exports shape:
- Drop `"main"` and `"types"`. Both Effect v4 packages omit them; the `exports` map is authoritative for Node ≥ 12 and for `moduleResolution: NodeNext`, and a stale `main` is a common source of resolution surprises.
- Add `"sideEffects": false` (effect-machine, effect-mq) or `"sideEffects": []` (Effect core). Enables downstream DCE.
- Add `"files"` — currently absent, which means npm would ship whatever happens to be on disk.
- Ship `src/**/*.ts` alongside `dist` (all three reference projects do). Combined with `declarationMap`, this gives consumers go-to-definition into real source instead of `.d.ts`.
- `"publishConfig": { "access": "public", "provenance": true }` — all three reference projects.
- Add `"engines": { "node": ">=20" }` (effect-machine's floor).

**Alternative, rejected:** `prepack`/`postpack` scripts that rewrite the manifest (effect-mq's approach). It works, but it's imperative, needs two Node scripts, and breaks if a publish is interrupted. `publishConfig.exports` is declarative and handled by npm itself.

### 4.3 Emerging convention worth noting

`effect@4` and `@effect/vitest@4` **ship `AGENTS.md`, `CLAUDE.md`, and an `ai-docs/` tree inside the npm tarball**. Given that this project already maintains a normative `spec/` with a traceability discipline, shipping a distilled agent-facing doc in the package is a cheap, on-trend differentiator. Confidence HIGH that Effect does it; MEDIUM that it's worth doing here in this milestone.

---

## 5. Concrete configuration

### 5.1 `.oxlintrc.json`

Effect's own config extends `./packages/tools/oxc/oxlintrc.json` from `@effect/oxc`, which is marked `"private": true` and **is not published to npm** (confirmed 404). It is MIT-licensed, so the resolution is to **vendor it** — done, see §5.1a. The base rule set below merges effect-mq's public config with Effect's own `oxlintrc.json` tuning block.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
  "plugins": ["typescript", "import", "oxc", "eslint", "unicorn", "vitest"],
  "categories": { "correctness": "error", "suspicious": "error", "perf": "error" },
  "ignorePatterns": ["**/dist", "**/node_modules", "**/*.md"],
  "rules": {
    "eqeqeq": "error",
    "import/no-cycle": "error",
    "import/no-duplicates": ["error", { "preferInline": true }],
    "typescript/consistent-type-imports": ["error", { "fixStyle": "inline-type-imports" }],
    "typescript/no-import-type-side-effects": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "unicorn/prefer-node-protocol": "error",
    "vitest/no-focused-tests": "error",
    "vitest/no-identical-title": "error"
  }
}
```

The `vitest` plugin rules matter more than usual here: this library's own test suite *is* vitest, and `no-focused-tests` catches a committed `it.only` — a real hazard for a project whose acceptance tests are the traceability evidence (AGENTS.md §5).

### 5.1a Vendored Effect rules (`tools/oxlint/effect/`) — DONE

Since `@effect/oxc` cannot be installed, its rules are vendored into this repo at `tools/oxlint/effect/`, with provenance and rationale in `tools/oxlint/effect/ATTRIBUTION.md`. Rule sources are byte-identical to upstream `main`; only `index.ts` and test import specifiers were adapted.

**Four of upstream's five rules were copied. `no-unused-internal` was deliberately excluded**, and the reason is load-bearing rather than cosmetic: it is the only rule that imports the `typescript` compiler API as a *runtime value* (`import ts from "typescript"`), which is precisely why upstream's manifest declares `"peerDependencies": { "typescript": ">=5.0.0 <7.0.0" }` — **a range that excludes TypeScript 7, which this project uses.** It also enforces Effect's `@internal` JSDoc + `stripInternal` convention, which effect-cucumber does not adopt. Dropping it means every vendored rule is type-only against `@oxlint/plugins`, so the vendored directory carries no TypeScript version constraint at all.

Wire it by path (the pattern effect-mq uses for its local plugins), keeping the plugin `name` as `"effect"` so rule IDs match upstream and Effect's `oxlintrc.json` rule block can be copied verbatim:

```jsonc
// .oxlintrc.json — add to the config in §5.1
"jsPlugins": [
  { "name": "effect", "specifier": "./tools/oxlint/effect/index.ts" }
],
"rules": {
  "effect/no-import-from-barrel-package": ["error", {
    "checkPatterns": [
      "^effect$",
      "^effect/(.+/)?[a-z][a-z0-9]*$",
      "^@effect/[^/]+$",
      "^@effect/[^/]+/(.+/)?[a-z][a-z0-9]*$"
    ],
    "checkRelativeIndexImports": true
  }],
  "effect/no-js-extension-imports": "error",
  "effect/no-opaque-instance-fields": "error",
  "effect/no-bigint-literals": "error"
}
```

**Why this matters more than a generic lint win:** `effect/no-import-from-barrel-package` with the pattern block above is the machine enforcement of **AGENTS.md §3** — the submodule-namespace import convention (`import * as Effect from "effect/Effect"`, never from the `effect` barrel). That convention is currently prose in a conventions doc with nothing checking it. Vendoring converts it into a build-breaking rule before the first line of `packages/*/src` is written, which is the cheapest possible moment. `effect/no-js-extension-imports` similarly enforces the `./x.ts` specifier style that `rewriteRelativeImportExtensions` (§5.3) requires.

This closes the gap previously flagged in §10.2. Note the tradeoff it creates instead: vendored code has no dependency-bot update path, so `ATTRIBUTION.md` carries a resync command.

Upstream's tests for the copied rules were vendored alongside them (`tools/oxlint/effect/test/`), so the vendored code stays verifiable rather than becoming opaque inherited code — they run under the project's existing vitest.

Requires `@oxlint/plugins` (published, `1.80.0`) as a dev dependency, version-matched to `oxlint`.

The remaining Effect-specific coverage that upstream's *type-aware* tooling gives you — `missingLayerContext`, `missingEffectContext`, `floatingEffectInVitest`, `duplicatePackage` — comes from `@effect/tsgo` (§5.3), not from these AST rules. The two are complementary, not alternatives.

### 5.2 `dprint.json`

Copy Effect's verbatim (identical in Effect `main` and effect-machine):

```jsonc
{
  "$schema": "https://dprint.dev/schemas/v0.json",
  "incremental": false,
  "includes": ["**/*.{ts,tsx,js,jsx,json,md}"],
  "indentWidth": 2,
  "lineWidth": 120,
  "newLineKind": "lf",
  "typescript": {
    "semiColons": "asi",
    "quoteStyle": "alwaysDouble",
    "trailingCommas": "never",
    "operatorPosition": "maintain",
    "arrowFunction.useParentheses": "force"
  },
  "excludes": ["**/dist", "**/coverage", "**/*.tsbuildinfo", "**/CHANGELOG.md"],
  "plugins": [
    "https://plugins.dprint.dev/typescript-0.93.4.wasm",
    "https://plugins.dprint.dev/markdown-0.20.0.wasm",
    "https://plugins.dprint.dev/json-0.21.1.wasm"
  ]
}
```

One consequence worth stating up front because it surprises people: `"semiColons": "asi"` means **no semicolons**. That is Effect house style. Adopt it or don't, but adopt it consciously — mixing will churn the diff forever.

If you'd rather not take the dprint dependency, **Prettier is a defensible alternative** (foldkit, a v4-era Effect UI framework, uses it). It just costs you visual identity with Effect's own source.

### 5.3 `tsconfig.base.json` additions

The current base is already good (strict, composite, NodeNext, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). Effect's base adds these, and **I verified every one of them compiles under TypeScript 7.0.2 by building a two-package composite project reference locally**:

```jsonc
{
  "compilerOptions": {
    "outDir": "${configDir}/dist",          // removes per-package outDir/rootDir duplication
    "rootDir": "${configDir}/src",
    "incremental": true,
    "moduleDetection": "force",             // every non-.d.ts file is a module
    "verbatimModuleSyntax": true,           // supersedes isolatedModules
    "rewriteRelativeImportExtensions": true, // write `./x.ts`, emit `./x.js` — verified working
    "erasableSyntaxOnly": true,             // keeps sources runnable under `node --experimental-strip-types`
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "types": [],                            // no ambient @types/* leakage; opt in per package
    "plugins": [{
      "name": "@effect/language-service",
      "namespaceImportPackages": ["effect", "@effect/*"],
      "includeSuggestionsInTsc": false,
      "ignoreEffectWarningsInTscExitCode": true
    }]
  }
}
```

`namespaceImportPackages` is worth calling out: it enforces exactly the submodule-namespace import convention AGENTS.md §3 already mandates (`import * as Effect from "effect/Effect"`). The convention becomes machine-checked rather than aspirational.

`types: []` means `packages/vitest` must opt in explicitly (`"types": ["node"]`, as `packages/vitest/tsconfig.json` does in the Effect repo).

### 5.4 A myth to discard: "TypeScript 7 can't do build mode or declaration emit"

Multiple 2026 blog posts (and likely your own instinct) claim TS 7.0's Go-native compiler shipped **without** `--build` for project references and **without** `--declaration` emit. If true, that would invalidate the locked `tsc -b` + composite architecture.

**It is not true of `typescript@7.0.2`.** I built a two-package composite project-reference graph locally with the repo's installed `typescript@7.0.2`:

```
$ node node_modules/typescript/bin/tsc --version   → Version 7.0.2
$ node node_modules/typescript/bin/tsc -b --verbose
  Building project 'pkgA/tsconfig.json'...
  Building project 'pkgB/tsconfig.json'...
$ find . -name "*.d.ts" -o -name "*.js"
  ./pkgA/dist/index.js  ./pkgA/dist/index.d.ts  ./pkgA/dist/index.d.ts.map
  ./pkgB/dist/index.js  ./pkgB/dist/index.d.ts  ...
```

`-b`, `composite`, `declaration`, `declarationMap`, `sourceMap`, `${configDir}`, and `rewriteRelativeImportExtensions` (`./helper.ts` → emitted `./helper.js`) all work. Those blog claims describe the RC/early-GA state and are stale. Corroborating evidence: the Effect monorepo runs `typescript: "^7.0.2"` and `tsc -b tsconfig.packages.json`, shipping `dist/**/*.d.ts` in every published package. **The locked architecture is sound.**

### 5.5 CI — GitHub Actions

Structure from Effect's `check.yml`, sized down to this project. Effect splits into independent jobs (lint / types / build / test / circular) rather than one serial `check`; effect-machine runs a single `pnpm check`. For two packages, three parallel jobs is the right middle.

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
permissions: { contents: read }

jobs:
  lint:    # oxlint -f unix && dprint check
  types:   # tsc -b  (+ tstyche once type-level tests exist)
  test:    # vitest run   —  matrix node-version: [22, 24]
```

Shared setup step (Effect's composite action, inlined):

```yaml
- uses: actions/checkout@v6
- uses: pnpm/action-setup@v6
- uses: actions/setup-node@v7
  with: { node-version: 24, cache: pnpm }
- run: pnpm install --frozen-lockfile
```

**Node version guidance (verified against nodejs.org/dist, 2026-08-28):** Node **24.20.0 "Krypton" is the current Active LTS**; 26.8.1 is Current; 22 "Jod" is in maintenance. Effect's CI pins `26.4.0` (they need bleeding-edge for Deno/Bun parity work). effect-machine uses `24`. **Recommendation: `node-version: 24` as the primary, with a `[22, 24]` test matrix** — a testing library gets installed into whatever the consumer has, so cheap breadth is worth more here than for an app. Declare `"engines": { "node": ">=20" }`.

Pin third-party actions to SHAs if you want Effect's supply-chain posture (they pin every action to a full commit SHA with a `# v6` comment); effect-machine uses plain tags. Tags are fine for a project this size.

### 5.6 Release workflow

Recommended shape (effect-machine's, which is the right scale — Effect's is a 7-workflow apparatus including website deploys and bundle-size diffing):

```yaml
name: Release
on:
  push: { branches: [main] }
permissions:
  contents: write
  pull-requests: write
  id-token: write          # npm trusted publishing (OIDC)
jobs:
  release:
    environment: npm
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm, registry-url: https://registry.npmjs.org }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - uses: changesets/action@v1
        with:
          version: pnpm version-packages     # changeset version && dprint fmt
          publish: pnpm release              # pnpm build && changeset publish
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
```

**Use npm trusted publishing (OIDC), not an `NPM_TOKEN` secret.** It went GA in July 2025 and is now the preferred path; it requires `id-token: write` and **npm CLI ≥ 11.5.1**, which is why Effect's release job literally runs `npm install -g npm@11` before publishing. With trusted publishing, provenance attestations are generated automatically — no `--provenance` flag needed, though keeping `"provenance": true` in `publishConfig` is harmless and matches all three reference projects. effect-machine's release job uses OIDC with `environment: npm` and **no NPM_TOKEN at all**.

Note: this milestone's destination is "working and tested," not "published." The release workflow can be scaffolded and left un-triggered (or gated on a tag) — but the *manifest* decisions in §4 should be made now, because retrofitting `exports`/peer-deps after the first publish is a breaking change.

### 5.7 `.changeset/config.json`

Both Effect and effect-machine use a **`fixed` group** so their packages version in lockstep. For two tightly-coupled packages where `@effect-cucumber/vitest` depends on `@effect-cucumber/gherkin` via `workspace:*`, lockstep is clearly right:

```jsonc
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.2/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "leaderiop/effect-cucumber" }],
  "commit": false,
  "fixed": [["@effect-cucumber/gherkin", "@effect-cucumber/vitest"]],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

(effect-machine uses the plain `@changesets/cli/changelog`; the GitHub changelog plugin is nicer but adds a dep and needs a token. Either is fine.)

Also worth copying: effect-machine's `changeset-policy` CI job, which **fails a PR that has no changeset** (excepting the bot's own release PR). For a spec-disciplined project that already gates on traceability, this fits the existing culture exactly.

---

## 6. What NOT to use

| Avoid | Why | Use instead |
|---|---|---|
| **ESLint + `@effect/eslint-plugin`** | `@effect/eslint-plugin` last published **2025-04-24**, pinned at `0.3.2`, and does not appear in the Effect monorepo's current devDependencies. Effect migrated `main` to oxlint. Only the *legacy* v3-era repos (`Effect-TS/language-service`, `effect-aws`) still run it. | `oxlint@1.80.0` (§5.1) |
| **`@effect/build-utils` (`pack-v2`/`prepare-v2`)** | Last published **2025-07-17**. This was the v3 dual-CJS/ESM packaging tool. Absent from Effect v4. Following a tutorial that uses it will produce a CJS build that cannot load `@cucumber/gherkin`. | `tsc -b` + `publishConfig.exports` (§4.2) |
| **Dual CJS/ESM publishing** | Effect v4, `@effect/vitest` v4, `@cucumber/gherkin@42`, and `@cucumber/cucumber-expressions@20` are **all ESM-only** (verified by unpacking tarballs). A CJS build literally cannot `require()` the cucumber parser. Plus the dual-package hazard compounds the `Context` identity problem in §3.2. | ESM-only, `"type": "module"` |
| **tsup / tsdown / rollup / unbuild for the library output** | Zero adoption for library output across Effect v4 projects — Effect, effect-machine, and effect-mq all emit with `tsc` alone. Bundling a library breaks the `declarationMap` → source navigation that all three reference projects deliberately preserve (they ship `src/` in the tarball). (`Effect-TS/language-service` uses tsup, but it's a **TypeScript compiler plugin** that must load inside the TS host — a genuinely different constraint.) Effect uses rollup only for *bundle-size measurement*, never to produce shipped artifacts. | `tsc -b` |
| **`@effect/language-service@0.87.2` (the tsserver plugin)** | That's the TypeScript 5/6 plugin. This repo is on **TypeScript 7.0.2** (Go-native), which is a different host. | `@effect/tsgo@0.38.0` — same diagnostics, TS-7 host. Note: the *tsconfig plugin name* stays `"@effect/language-service"`; only the installed package differs. |
| **`@effect/dtslint`** | v3-era type-testing tool, superseded. | `tstyche@7.2.3` (used by both Effect and effect-machine) |
| **Nx / Turborepo / Lerna** | Effect (~40 packages) manages with plain `pnpm --recursive` + `tsc -b`'s own incremental graph. Two packages cannot justify a task-graph orchestrator, and it would fight `tsc -b`, which already does dependency-ordered incremental builds. | `pnpm -r` + `tsc -b` |
| **projen** | `effect-aws` uses it; it generates every config file from TypeScript and is a heavyweight, opinionated meta-tool. It's also the only project in this survey still on the v3 stack — arguably because regenerating a projen config is high-friction. | Hand-written config files |
| **Biome** | Genuinely capable, but **zero** adoption found in any Effect-ecosystem repo surveyed. Choosing it means no shared config, no `@effect/tsgo` oxlint integration path, no precedent to copy. | `oxlint` + `dprint` |
| **semantic-release / conventional-commits automation** | No Effect-ecosystem adoption. Changesets' explicit, human-written changeset files suit a library where an Effect-rc bump needs a hand-written consumer-facing note (§3.3). | `@changesets/cli@3.0.1` |
| **Chasing `vitest@5`** | `vitest@5.0.0-rc.2` exists, but `@effect/vitest@4.0.0-rc.112` declares `"vitest": ">=4.1.0 <5.0.0"`. Installing vitest 5 breaks the peer contract of the one package this project is built on. | `vitest@^4.1.11`, mirror the `>=4.1.0 <5.0.0` peer range |

---

## 7. Version compatibility

| Package | Compatible with | Notes |
|---|---|---|
| `@effect/vitest@4.0.0-rc.112` | `vitest >=4.1.0 <5.0.0`, `effect ^4.0.0-rc.112` | Peer ranges read from the published manifest. Note Effect's own peer is `^`-ranged (accepts later rc's), while effect-machine exact-pins its peer — either is defensible; exact-pin matches ADR-EC-012. |
| `effect@4.0.0-rc.112` | Runtime deps: `msgpackr ^2.0.5`, `fast-check ^4.9.0` | ESM-only. `@effect/platform*` has **no v4 rc** — in v4 the platform/http/rpc/sql surface moved into `effect/unstable/*` subpath exports. Don't look for `@effect/platform@4`. |
| `typescript@7.0.2` | `@effect/tsgo@0.38.0` (declares support for `7.0.2` and `7.1.0-dev.20260826.1`) | `@effect/tsgo` still requires a `typescript >= 7` install alongside it; its `effect-tsgo patch` step wires the plugin into the Go host. |
| `oxlint@1.80.0` | `@effect/tsgo@0.38.0` (declares `1.79.0`, `1.80.0`), `oxlint-tsgolint@7.0.2001` | Effect pins `^1.79.0`; effect-mq pins `1.79.0` exactly alongside `@oxlint/plugins@1.79.0`. Keep oxlint and any JS-plugin package version-matched. |
| `@cucumber/gherkin@42.0.1`, `@cucumber/cucumber-expressions@20.1.0` | Any ESM consumer | Both `"type": "module"`, no `exports` map, no CJS. This forecloses CJS output (§4.1). |
| `pnpm` catalogs | `pnpm >= 9.5` (works on the installed `10.26.1`) | `catalog:` is stripped at `pnpm pack`/`publish`. Independent of the pnpm 11 upgrade. |
| npm trusted publishing (OIDC) | npm CLI `>= 11.5.1` | Effect's release job runs `npm install -g npm@11` for exactly this. |
| Node | `>= 20` engines floor; CI on 22 + 24 | Node 24 "Krypton" is Active LTS as of 2026-08-28; 26.8.1 is Current; 22 "Jod" is in maintenance. |

---

## 8. Installation

```bash
# Package manager (upgrade; kind is locked, version is open)
corepack use pnpm@11.24.0

# Root dev dependencies
pnpm add -Dw \
  oxlint@1.80.0 \
  @oxlint/plugins@1.80.0 \
  dprint@0.56.1 \
  @changesets/cli@3.0.1 \
  @changesets/changelog-github@1.0.0 \
  tstyche@7.2.3 \
  @effect/tsgo@0.38.0 \
  @types/node@26.2.0

# Optional, in rough order of value for this project
pnpm add -Dw pkg-pr-new@0.0.88   # per-PR preview installs — high value pre-1.0
pnpm add -Dw publint@0.3.24      # validates the publishConfig.exports swap
pnpm add -Dw madge@8.0.0         # circular deps
pnpm add -Dw oxlint-tsgolint@7.0.2001  # only if enforcing type-aware rules in `lint`

# One-time wiring of the Effect language service into the TS 7 host
pnpm exec effect-tsgo setup

# NOT installed — see §6
# eslint, @effect/eslint-plugin, @effect/build-utils, @effect/dtslint,
# tsup, tsdown, rollup, biome, nx, turbo, lerna, @effect/language-service
```

Root `package.json` scripts to add:

```jsonc
{
  "scripts": {
    "prepare": "effect-tsgo patch",
    "lint": "oxlint -f unix && dprint check",
    "lint-fix": "oxlint --fix && dprint fmt",
    "check": "tsc -b",
    "build": "tsc -b",
    "test": "vitest run",
    "test-types": "tstyche",
    "circular": "madge --circular --extensions ts packages/*/src",
    "changeset": "changeset",
    "version-packages": "changeset version && dprint fmt",
    "release": "pnpm build && changeset publish",
    "verify:spec": "bash spec/scripts/verify-traceability.sh"
  }
}
```

---

## 9. Confidence summary

| Recommendation | Confidence | Basis |
|---|---|---|
| oxlint over ESLint | **HIGH** | Effect `main` `package.json` + `.oxlintrc.json`; 3 independent third-party repos; `@effect/eslint-plugin` frozen since Apr 2025 (registry timestamp) |
| dprint (config verbatim) | **HIGH** | Byte-identical `dprint.json` in Effect `main` and effect-machine |
| ESM-only, no CJS | **HIGH** | Unpacked `@effect/vitest@4.0.0-rc.112` tarball (zero `.cjs`); `effect@4` exports map; both cucumber deps are `"type": "module"` |
| `tsc -b` only, no bundler | **HIGH** | Build scripts of all three v4 reference projects |
| TS 7.0.2 supports `-b` + declaration emit | **HIGH** | **Ran it locally**; contradicts stale blog claims |
| `publishConfig.exports` swap | **HIGH** | Effect core + effect-machine manifests |
| `effect` as peerDependency | **HIGH** | Published manifests of `@effect/vitest`, `@typeonce/effect-machine`, `effect-mq` — unanimous |
| pnpm catalogs for the rc pin | **HIGH** | effect-mq's `catalog:` usage + pnpm official docs on publish-time substitution |
| Changesets + `fixed` group | **HIGH** | Effect + effect-machine `.changeset/config.json` |
| tstyche for type-level tests | **HIGH** | Effect `test-types` script + effect-machine `test:types` |
| npm trusted publishing (OIDC) | **HIGH** | GitHub changelog (GA), Effect + effect-machine release workflows |
| `@effect/tsgo` over `@effect/language-service` | **HIGH** | tsgo README's own supported-versions table; Effect's `prepare` script |
| Vendoring `@effect/oxc` (4 of 5 rules) | **HIGH** | Upstream is MIT + `private: true` (404 on npm). Rule-by-rule import audit showed 4 rules are type-only; only `no-unused-internal` imports `typescript` at runtime, matching upstream's `typescript <7.0.0` peer. |
| CI job structure & Node 24 | **MEDIUM-HIGH** | Effect `check.yml` + effect-machine `ci.yml`; Node LTS status from nodejs.org/dist. The 22+24 matrix is my sizing call. |
| Scheduled canary vs. floating rc | **MEDIUM** | **My prescription, not ecosystem convention.** No surveyed repo does this — reported honestly in §3.4. |
| Minor changeset per Effect rc bump | **MEDIUM** | My prescription. No ecosystem doc states this rule. |
| publint | **MEDIUM** | My prescription. No Effect project uses it; effect-machine hand-rolls equivalent checks. |
| Skipping `babel-plugin-annotate-pure-calls` | **MEDIUM** | Effect core does use it; effect-machine (small lib) does not. Judgment call based on effect-cucumber being a test-time library. |
| Shipping AGENTS.md/ai-docs in the tarball | **MEDIUM** | Effect v4 does it (verified in tarball); whether it's worth it here is a judgment call. |

## 10. Open questions / gaps

1. **No ecosystem precedent for CI against a moving prerelease.** Reported as a real gap (§3.4), with a marked-as-mine prescription rather than an invented convention.
2. ~~**Effect's own Effect-specific lint rules are not obtainable.**~~ **Resolved by vendoring** — see §5.1a. `@effect/oxc` is MIT and `private: true`, so four of its five rules now live in `tools/oxlint/effect/`. Residual open item: vendored code has no update path, and the excluded `no-unused-internal` rule should be revisited only if upstream widens its `typescript` peer range past 7.
3. **Does `packages/gherkin` need `effect` at all?** ADR-EC-011 says "parsing, no Effect logic," but the manifest lists `effect` as a dependency. Worth resolving during roadmap: if genuinely Effect-free, drop it entirely; if not, make it a peer.
4. **dprint's `semiColons: "asi"`** is a big stylistic commitment (no semicolons). Flagging it for an explicit decision rather than assuming.
5. **tstyche's relationship to the planned doc-examples type-check gate** (AGENTS.md §1, `spec/process/definitions-of-done.md`) is unexplored. They may overlap — tstyche is designed for assertions about types, the doc gate for "does this compile at all." Possibly one tool can serve both; not verified.

---

## Sources

**Live npm registry** (`npm view`, `npm pack`, 2026-08-28) — HIGH: `effect` dist-tags and `4.0.0-rc.112` manifest; `@effect/vitest` `4.0.0-rc.112` manifest **and unpacked tarball**; `@cucumber/gherkin@42.0.1`; `@cucumber/cucumber-expressions@20.1.0`; `vitest`; `typescript`; `pnpm`; `oxlint`; `dprint`; `@changesets/cli`; `@changesets/changelog-github`; `tstyche`; `pkg-pr-new`; `publint`; `@arethetypeswrong/cli`; `oxlint-tsgolint`; `@effect/tsgo`; `@effect/build-utils` (last-modified 2025-07-17); `@effect/eslint-plugin` (last-modified 2025-04-24); `@effect/oxc` (404, unpublished).

**Effect-TS/effect `main`** — HIGH: `package.json`, `.oxlintrc.json`, `dprint.json`, `.changeset/config.json`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `vitest.config.ts`, `vitest.setup.ts`, `packages/effect/package.json`, `packages/vitest/package.json`, `packages/vitest/tsconfig.json`, `.github/workflows/{check,release,snapshot}.yml`, `.github/actions/setup/action.yaml`.

**typeonce-dev/effect-machine `main`** — HIGH: `package.json`, `packages/effect-machine/package.json`, `tsconfig.base.json`, `packages/effect-machine/tsconfig.build.json`, `dprint.json`, `.changeset/config.json`, `.github/workflows/{ci,release}.yml`.

**TeamWarp/effect-mq `main`** — HIGH: `package.json` (catalog), `packages/effect-mq/package.json`, `.oxlintrc.json`, `.github/workflows/ci.yml`.

**Counter-evidence (legacy v3 stack)** — HIGH: `Effect-TS/language-service` and `floydspace/effect-aws` root `package.json`.

**Effect-TS/tsgo `main` README** — HIGH: supported-versions table (TS 7.0.2 / oxlint 1.79–1.80 / oxlint-tsgolint 7.0.2001), diagnostic catalogue, oxlint integration.

**Local empirical verification** — HIGH: built a two-package composite project-reference graph with the repo's own `typescript@7.0.2`, confirming `tsc -b`, `composite`, `declaration`, `declarationMap`, `${configDir}`, and `rewriteRelativeImportExtensions`.

**Official docs** — HIGH: [pnpm catalogs](https://pnpm.io/catalogs) (publish-time `catalog:` substitution); [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/); [npm trusted publishing OIDC GA](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/); [nodejs.org/dist/index.json](https://nodejs.org/dist/index.json) (LTS status).

**WebSearch, treated as LOW and superseded** — TypeScript 7.0 GA coverage ([InfoQ](https://www.infoq.com/news/2026/08/typescript-7-released/), [digitalapplied](https://www.digitalapplied.com/blog/typescript-7-0-ga-native-compiler-migration-playbook-2026)). Useful for the July 8 2026 GA date; their claims that `--build` and `--declaration` are unavailable were **falsified** by direct local testing of 7.0.2 and are not relied on.

---
*Stack research for: small TypeScript library monorepo, Effect v4 ecosystem*
*Researched: 2026-08-28*
