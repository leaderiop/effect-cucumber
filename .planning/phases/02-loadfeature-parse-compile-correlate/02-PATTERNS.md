# Phase 2: `loadFeature` — Parse, Compile, Correlate - Pattern Map

**Mapped:** 2026-08-28
**Files analyzed:** 24 (9 new src modules, 5+ new test artifacts, 6 modified configs, 4 modified spec files)
**Analogs found:** 17 / 24

> **No CONTEXT.md exists for this phase.** The file list below is derived from `02-RESEARCH.md`'s
> "Recommended Project Structure", "Wave 0 gaps", and "Phase requirements → test map" sections.
> Files marked *(conditional)* depend on decisions D5/D6/D7 the planner must still lock.

---

## File Classification

### Source (`packages/gherkin/src/`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` (**replace**) | barrel / config | re-export | `tools/oxlint/effect/index.ts` + current `packages/gherkin/src/index.ts` | exact |
| `src/Errors.ts` (new) | model (error class) | transform | — | **none** — no error class exists anywhere in the repo |
| `src/Model.ts` (new) | model (types only) | pure data | `tools/oxlint/effect/test/utils.ts` (interface-first module) | partial |
| `src/Source.ts` (new) | utility / adapter | file-I/O | `tools/oxlint/effect/rules/no-import-from-barrel-package.ts` (lines 2–3, 22–29) | role-match |
| `src/Parser.ts` (new) | service / adapter | transform | `tools/oxlint/effect/rules/no-js-extension-imports.ts` | role-match |
| `src/Pickles.ts` (new) | service / adapter | transform | same | role-match |
| `src/Correlate.ts` (new) | service | batch / index-join | same | role-match |
| `src/Validate.ts` (new) | service (validator) | batch | `tools/oxlint/effect/rules/no-js-extension-imports.ts` (`create` → per-node checks → `report`) | role-match |
| `src/loadFeature.ts` (new) | controller / orchestrator | request-response (sync) | `tools/oxlint/effect/index.ts` (composition-only module) | partial |

### Tests (`packages/gherkin/test/`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `test/Correlate.test.ts` (new) | test | request-response | `tools/oxlint/effect/test/no-js-extension-imports.test.ts` | exact |
| `test/Validate.test.ts` (new) | test | request-response | same | exact |
| `test/loadFeature.test.ts` (new) | test | file-I/O + request-response | same (no `?raw` / `readFileSync` precedent in repo) | role-match |
| `test/dialect.test.ts` (new) | test | request-response | same | exact |
| `test/utils.ts` (new, optional) | test utility | pure data | `tools/oxlint/effect/test/utils.ts` | exact |
| `test/fixtures/*.feature` (new, ~25) | fixture data | file-I/O | — | **none** — no `.feature` file exists in the repo |

### Configuration (modified)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/gherkin/package.json` | config (manifest) | — | `packages/vitest/package.json` lines 45–61 | exact |
| `packages/gherkin/tsconfig.json` | config (build) | — | `packages/vitest/tsconfig.json` + `tsconfig.base.json` line 27 | exact |
| `pnpm-lock.yaml` | generated | — | — | n/a (regenerate, never hand-edit) |
| `packages/gherkin/tsconfig.test.json` *(conditional, D7)* | config (typecheck) | — | `packages/vitest/test/tsgo-gate/tsconfig.json` | exact |
| `scripts/verify-no-runner-dep.sh` *(conditional, P1)* | gate script | batch | `scripts/verify-oxlint-plugin.sh` | exact |
| `package.json` (root) | config (scripts) | — | root `package.json` lines 17–20 | exact |
| `.github/workflows/check.yml` | config (CI) | — | `.github/workflows/check.yml` lines 21–37 | exact |

### Spec (modified — `pnpm verify:spec` is a required check)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spec/behaviors/0X-*.md` (new BEH-EC-014 for Gap 3) | doc | — | `spec/behaviors/01-steps-and-world.md` lines 81–94 | exact |
| `spec/behaviors/index.yaml` | registry | — | `spec/behaviors/index.yaml` lines 4–16 | exact |
| `spec/traceability.md` §1 + §4 | matrix | — | `spec/traceability.md` lines 20–26, 64–68 | exact |
| `packages/gherkin/README.md` (Status section) | doc | — | `packages/gherkin/README.md` lines 13–17 | exact |

---

## Pattern Assignments

### `src/Parser.ts`, `src/Pickles.ts`, `src/Correlate.ts`, `src/Validate.ts`, `src/Source.ts` (service/utility, transform)

**Analog:** `tools/oxlint/effect/rules/no-js-extension-imports.ts`
(the only non-placeholder, non-test TypeScript module in the repo that ships real logic)

**Imports pattern** (lines 1–9) — type-only import marked `import type`; module-level frozen
lookup tables declared as `const` before any function:

```typescript
import type { CreateRule, ESTree, Fixer, Visitor } from "@oxlint/plugins"

const jsExtensions = [".js", ".jsx", ".mjs", ".cjs"]
const extensionMap: Record<string, string> = {
  ".js": ".ts",
  ".jsx": ".tsx",
  ".mjs": ".mts",
  ".cjs": ".cts"
}
```

**Core lookup pattern** (lines 11–22) — small named `function` declarations, explicit return
types, `undefined` (never `null`) as the "not found" value. This is the exact shape
`Correlate.ts`'s `byStepId`/`byScenarioId` lookups must take under `noUncheckedIndexedAccess`:

```typescript
function isRelativeImport(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../")
}

function getJsExtension(source: string): string | undefined {
  for (const ext of jsExtensions) {
    if (source.endsWith(ext)) {
      return ext
    }
  }
  return undefined
}
```

**`node:fs` pattern for `Source.ts`** — the only `node:` import in the repo,
`tools/oxlint/effect/rules/no-import-from-barrel-package.ts` lines 2–3 and 22–29:

```typescript
import * as fs from "node:fs"
import * as path from "node:path"

function hasIndexFile(dirPath: string): boolean {
  for (const ext of extensions) {
    if (fs.existsSync(path.join(dirPath, `index${ext}`))) {
      return true
    }
  }
  return false
}
```

> **Caveat the planner must not miss:** `tools/` is **outside every tsconfig** (root
> `tsconfig.json` references only `packages/gherkin` and `packages/vitest`), so this file is
> linted but **never type-checked**. It proves the *style* (`node:` protocol per
> `unicorn/prefer-node-protocol`, namespace import) — it does **not** prove `node:fs` compiles.
> RESEARCH.md P2 stands: `@types/node` in `devDependencies` **and** `"types": ["node"]` in
> `packages/gherkin/tsconfig.json` are both required.

**Note on style — no error handling analog exists.** No file in this repo throws, catches, or
constructs an `Error`. `Errors.ts` and every `throw` site are greenfield; use RESEARCH.md
[D2](./02-RESEARCH.md) verbatim (it was compiled against this repo's exact `tsconfig.base.json`
and passed `dprint check` + `oxlint`).

---

### `src/index.ts` (barrel, replace placeholder)

**Analog A — doc-comment header convention:** current `packages/gherkin/src/index.ts` lines 1–11.
The existing file *announces itself as a placeholder*; the replacement must delete that framing
entirely (STATE.md 01-01: "Phase 2 replaces gherkin's").

```typescript
/**
 * Public entry point for `@effect-cucumber/gherkin`.
 *
 * Placeholder: this package has no behavior yet. Phase 2 replaces this file's
 * contents with `loadFeature` and the `ParsedFeature` types. The export below
 * exists so the package emits declarations and can be referenced by
 * `@effect-cucumber/vitest`.
 */
export const packageName = "@effect-cucumber/gherkin" as const

export type PackageName = typeof packageName
```

> `packageName` / `PackageName` are **not public API** (STATE.md 01-01), but
> `packages/vitest/src/index.ts` line 13 consumes `Gherkin.PackageName` today. Deleting them
> breaks `pnpm build`. Either keep them or update `packages/vitest/src/index.ts` in the same
> commit — Phase 5 owns that file, so **keeping them is the lower-conflict choice**.

**Analog B — barrel composition with `.ts` relative imports:** `tools/oxlint/effect/index.ts`
lines 11–26 (note: `.ts` extensions are **mandatory**, enforced by `effect/no-js-extension-imports`
and `rewriteRelativeImportExtensions`):

```typescript
import noBigIntLiterals from "./rules/no-bigint-literals.ts"
import noImportFromBarrelPackage from "./rules/no-import-from-barrel-package.ts"
import noJsExtensionImports from "./rules/no-js-extension-imports.ts"
import noOpaqueInstanceFields from "./rules/no-opaque-instance-fields.ts"

export default {
  meta: { name: "effect" },
  rules: { /* ... */ }
}
```

---

### `test/*.test.ts` (test, request-response)

**Analog:** `tools/oxlint/effect/test/no-js-extension-imports.test.ts` — the repo's only test
files, all three in `tools/oxlint/effect/test/`. **`packages/*` has no tests today**; these
are the house style.

**Imports pattern** (lines 1–3) — named import from `"vitest"` (alphabetised: `describe, expect, it`),
relative imports with explicit `.ts`:

```typescript
import { describe, expect, it } from "vitest"
import rule from "../rules/no-js-extension-imports.ts"
import { runRule } from "./utils.ts"
```

> **Do not import through the barrel.** `.oxlintrc.json` line 26–34 sets
> `effect/no-import-from-barrel-package` with `checkRelativeIndexImports: true`, and the rule
> (`tools/oxlint/effect/rules/no-import-from-barrel-package.ts` lines 31–49) flags any relative
> value-import whose basename is `index.*`. So `import { loadFeature } from "../src/index.ts"`
> is a **lint error**; write `from "../src/loadFeature.ts"`. Type-only imports are exempt
> (rule line 101: `if (node.importKind === "type") return`).

**Test-data factory pattern** (lines 5–22) — arrow-function builders declared inside the
`describe`, one per input shape, returning literals. `Validate.test.ts`'s inline-source fixtures
should take this form (RESEARCH.md D1 recommends inline template literals where a file adds nothing):

```typescript
describe("no-js-extension-imports", () => {
  const createImportDeclaration = (source: string) => ({
    type: "ImportDeclaration",
    source: { value: source, range: [8, 8 + source.length + 2] as [number, number] },
    range: [0, 50] as [number, number]
  })
```

**Core assertion pattern** (lines 24–31) — nested `describe` per surface, `it` per case,
assert count first then the discriminating value:

```typescript
  describe("ImportDeclaration", () => {
    it("should report .js extension in relative imports", () => {
      const node = createImportDeclaration("./foo.js")
      const errors = runRule(rule, "ImportDeclaration", node)
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe(`Use ".ts" extension instead of ".js" for relative imports`)
    })
```

> **Adapt one thing:** the analog asserts on `.message` text. RESEARCH.md D2 requires the
> opposite for `Validate.test.ts` — **assert `err.reason`, not the message**. Keep the analog's
> *structure* (count, then discriminator); swap the discriminator.

> **`vitest/no-identical-title` is `"error"`** (`.oxlintrc.json` line 24). F1 and F2 both map to
> reason `EmptyExamples` — their `it` titles must differ (e.g. "Examples with no header row" vs
> "Examples with a header but no body rows"), or lint fails.
> **`vitest/no-focused-tests` is `"error"`** — no `it.only` may be committed.

**Test-helper module pattern** (`tools/oxlint/effect/test/utils.ts` lines 1–15) — exported
`interface` for the shape, options object with defaults destructured, arrow-const export:

```typescript
import type { CreateRule, Visitor } from "@oxlint/plugins"

export interface ReportedError {
  node: unknown
  message: string
}

export interface TestContextOptions {
  sourceCode?: string
  filename?: string
  cwd?: string
  ruleOptions?: Array<unknown>
}

export const createTestContext = (options: TestContextOptions = {}) => {
```

> Note `Array<unknown>`, not `unknown[]` — house style throughout (`utils.ts` lines 12, 23, 53;
> `no-import-from-barrel-package.ts` lines 6, 107–108). `Model.ts` should use
> `ReadonlyArray<ParsedScenario>`, not `readonly ParsedScenario[]`.

---

### `packages/gherkin/package.json` (config)

**Analog:** `packages/vitest/package.json` lines 45–61 — the only manifest in the repo with a
`devDependencies` block, and it uses `catalog:` for every entry:

```json
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run"
  },
  "dependencies": {
    "@effect-cucumber/gherkin": "workspace:^"
  },
  "peerDependencies": {
    "effect": "catalog:peer",
    "@effect/vitest": "catalog:peer",
    "vitest": "catalog:peer"
  },
  "devDependencies": {
    "effect": "catalog:",
    "@effect/vitest": "catalog:",
    "vitest": "catalog:"
  }
```

**What to copy into `packages/gherkin/package.json`:** a `devDependencies` block with
`"vitest": "catalog:"` and `"@types/node": "catalog:"` (both already in `pnpm-workspace.yaml`
lines 9 and 11 — **no catalog edit is needed**), and optionally `"test": "vitest run"` in
`scripts`.

**What to leave alone** — `packages/gherkin/package.json` lines 24–31 and 35–42:

```json
  "exports": {
    "./package.json": "./package.json",
    ".": "./src/index.ts"
  },
  "files": [
    "src/**/*.ts",
    "dist"
  ],
```

Single barrel, no `main`, no `types`, no subpath export. RESEARCH.md Open Question 3 and
STATE.md 01-04 both land on: **do not add a subpath export** (`./errors` would need to be added
to *both* `exports` and `publishConfig.exports` or it 404s for consumers). `files` already
excludes `test/`, so the `.feature` fixtures stay out of the tarball with no manifest change.

**Never** write a literal version for `vitest`/`@types/node` (STATE.md 01-04: version bumps
happen only in `pnpm-workspace.yaml`). Commit the regenerated `pnpm-lock.yaml` in the **same**
commit — `--frozen-lockfile` runs in all four CI jobs.

---

### `packages/gherkin/tsconfig.json` (config)

**Analog:** `packages/vitest/tsconfig.json` (full file) — package tsconfigs carry no path
duplication; everything comes from the base:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"],
  "references": [
    { "path": "../gherkin" }
  ]
}
```

**The one-line change** (P2): add `"compilerOptions": { "types": ["node"] }`.
`tsconfig.base.json` line 27 sets `"types": []` workspace-wide, which suppresses `@types/node`
even once installed.

> `include: ["src"]` + `rootDir: "${configDir}/src"` (`tsconfig.base.json` line 14) means
> **adding `"test"` to `include` will break the build** (files outside `rootDir`). Test-file
> type-checking (D7) needs a **separate** config, not a widened `include`.

**Analog for that separate config:** `packages/vitest/test/tsgo-gate/tsconfig.json` — the repo's
established "check-but-don't-emit, outside the solution build" shape:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "incremental": false,
    "noEmit": true
  },
  "include": ["src"]
}
```

Copy this verbatim into `packages/gherkin/tsconfig.test.json` with `"include": ["test"]` and
`"types": ["node"]`, and reference it from a new root script. Note it is **not** in the root
`tsconfig.json` `references` array — it is run explicitly by a script, never by `tsc -b`.

---

### `scripts/verify-no-runner-dep.sh` *(conditional — RESEARCH.md P1's structural PARSE-01 gate)*

**Analog:** `scripts/verify-oxlint-plugin.sh` — the repo's canonical gate-script shape, and the
one whose reasoning most closely matches P1's ("a `loadFeature` that cannot reach a test runner
cannot register a test").

**Header + METHOD NOTE pattern** (lines 1–18) — every gate script in this repo opens by stating
what would make the gate *vacuous*, and forbids weakening it:

```bash
#!/usr/bin/env bash
#
# Asserts that the VENDORED Effect oxlint rules are actually LOADED and are
# BUILD-BREAKING — i.e. that AGENTS.md §3 (submodule namespace imports) is a
# mechanical gate rather than prose.
#
# METHOD NOTE (do not weaken this):
#   `pnpm lint` exiting 0 does NOT prove the vendored plugin loaded. [...]
#
# Usage: bash scripts/verify-oxlint-plugin.sh
```

**Setup + `fail()` pattern** (lines 18–47) — `set -euo pipefail`, `ROOT_DIR` computed from
`BASH_SOURCE`, paths spelled out in full "so these paths stay greppable", a `fail()` that prints
a ✗ banner and exits 1, and a precondition check that fails loudly when the fixture is *absent*
(so a deleted fixture never reads as a pass):

```bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PLUGIN_ENTRY="tools/oxlint/effect/index.ts"

fail() {
  echo ""
  echo "✗ oxlint effect plugin: NOT ENFORCED"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

[[ -f "$PLUGIN_ENTRY" ]] || fail "missing $PLUGIN_ENTRY — the vendored plugin is absent (is tools/ committed?), so nothing was verified."
```

**Positive-control-then-gate pattern** (lines 51–92) — assertion 1 proves the check is not
"always fail"; assertion 2 is the load-bearing one; each ends with a `✓` line:

```bash
# Assertion 1: positive control. [...] Discriminates a working rule from a
# config that simply rejects everything.
OK_OUTPUT="$($OXLINT "$OK_PROBE" 2>&1)" && OK_EXIT=0 || OK_EXIT=$?
if [[ "$OK_EXIT" -ne 0 ]]; then
  echo "$OK_OUTPUT"
  fail "the mandated import style [...] was itself rejected — the rule is misconfigured, not the code."
fi
echo "✓ positive control: submodule namespace import lints clean"
```

For P1's gate the two assertions map to: (1) positive control — `packages/gherkin/src/**` *does*
import `@cucumber/gherkin` (proving the grep works at all); (2) the gate — no file under
`packages/gherkin/src/` imports `vitest`, `@effect/vitest`, or `effect`, **and** none of
`dependencies`/`peerDependencies`/`devDependencies` in `packages/gherkin/package.json` names
them (`devDependencies` gains `vitest` in Wave 0, so scope the manifest assertion to
`dependencies` + `peerDependencies` only, and say so in the METHOD NOTE).

---

### `.github/workflows/check.yml` + root `package.json` (CI wiring)

**Rule (STATE.md 01-06, non-negotiable):** *every CI step is a root `package.json` script*, and
*adding a new gate script means adding a CI step for it*. A script nobody runs is a convention,
not a gate.

**Root scripts pattern** (`package.json` lines 17–20) — `verify:*` naming, `bash <path>` body:

```json
    "verify:pack": "bash scripts/verify-pack.sh",
    "verify:spec": "bash spec/scripts/verify-traceability.sh",
    "verify:tsgo-gate": "bash scripts/verify-tsgo-gate.sh",
    "verify:oxlint-plugin": "bash scripts/verify-oxlint-plugin.sh"
```

**CI job + liveness-step pattern** (`check.yml` lines 21–37) — the comment explaining *why* the
extra step exists is part of the pattern:

```yaml
  lint:
    name: Lint and format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      # `pnpm lint` exiting 0 does NOT prove the vendored effect/* rules loaded: [...]
      - run: pnpm verify:oxlint-plugin
```

New Phase 2 steps slot into existing jobs — no new job is needed:
`verify:no-runner-dep` → the `package` job (structural/packaging); `typecheck:test` → the
`types` job (next to `pnpm build`). `packages/gherkin/test/*.test.ts` are picked up by the
existing `test` job with **zero config** (RESEARCH.md verified: no `vitest.config.ts` needed),
and run on the Node 22 + 24 matrix (`check.yml` lines 56–74).

---

### `spec/` (behavior doc, index, traceability)

**Behavior-entry pattern** (`spec/behaviors/01-steps-and-world.md` lines 81–94) — an `##` heading
with the ID, a `> **See:**` blockquote linking the ADR, then a **plain fenced block** (no
language) containing an all-caps `REQUIREMENT:` paragraph:

```markdown
## BEH-EC-013: Fail loudly on an unmatched, unused, or ambiguous step

> **See:** [ADR-EC-019](../decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md)

```
REQUIREMENT: A Pickle step matching zero registered Given/When/Then/And/But
             patterns MUST fail the containing Scenario with an error naming
             the unmatched step text and its source location. [...]
```
```

Signature listings use ` ```ts ` (reference-only, lines 15–17); compilable examples use
` ```typescript ` (line 98). AGENTS.md §2: prefer `typescript` once there is an API to compile
against — Phase 2 **is** that moment for `loadFeature`.

**Registry pattern** (`spec/behaviors/index.yaml` lines 5–8) — a new doc needs an entry, and
`verify-traceability.sh` lines 42–75 fails on both directions (declared-but-missing, and
on-disk-but-orphaned):

```yaml
  - id: "BEH-EC-001"
    file: "01-steps-and-world.md"
    title: "Steps, World, and describeFeature"
    id_range: "001-004, 013"
```

**Traceability §1 row pattern** (`spec/traceability.md` lines 22–26) — pipe table, column order
is a contract:

```markdown
| Behavior file                                                                             | Range                      | Source module (planned)                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| [01 — Steps and World](behaviors/01-steps-and-world.md)                                   | BEH-EC-001–004, BEH-EC-013 | `packages/vitest/src/{loadFeature,describeFeature,Step,World}.ts`, `packages/vitest/src/Plan.ts` |
```

> Two corrections Phase 2 owns: §1's first row names `packages/vitest/src/loadFeature.ts` — the
> real home is `packages/gherkin/src/loadFeature.ts` (ADR-EC-015). And **§4 Test file map is
> currently the literal text "Empty — no test files exist yet"** (lines 64–68); Phase 2 is the
> first phase to falsify that sentence, so §4 becomes a real table.

**ID allocation** (AGENTS.md §6): highest allocated is **BEH-EC-013**. Gap 3 (`loadFeature`'s
failure path) takes **BEH-EC-014**. Contiguous, never renumbered, never reused.

After any spec edit run `pnpm format` — `spec/**/*.md` is dprint-formatted **including its
fenced blocks** (STATE.md 01-03) — then `pnpm verify:spec`.

---

## Shared Patterns

### Formatting — applies to every `.ts` and `.md` file

**Source:** `dprint.json` lines 8–14
**Apply to:** all new source, test, and spec files. Never hand-format; run `pnpm lint-fix`.

```json
  "typescript": {
    "semiColons": "asi",
    "quoteStyle": "alwaysDouble",
    "trailingCommas": "never",
    "operatorPosition": "maintain",
    "arrowFunction.useParentheses": "force"
  },
```

Plus `"lineWidth": 120`, `"indentWidth": 2`, `"newLineKind": "lf"` (lines 11–13).
`.feature` files are **not** covered (`includes` is `**/*.{ts,tsx,js,jsx,json,md}`) — fixtures
are formatted by hand and stay byte-exact, which matters for F9/F10 (the trailing-pipe fixtures).

### Compiler constraints — applies to every `packages/gherkin/src/*.ts`

**Source:** `tsconfig.base.json` lines 16–27
**Apply to:** all new source files

```json
    "verbatimModuleSyntax": true,
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "types": [],
```

Concrete consequences the planner must encode in plan actions:

| Flag | Consequence for Phase 2 |
|------|-------------------------|
| `erasableSyntaxOnly` | `constructor(readonly reason: string)` is **TS1294**. `LoadFeatureError` declares fields, assigns in the body. No enums, no `namespace`. `LoadFeatureErrorReason` must be a string-literal **union type**, not an enum |
| `verbatimModuleSyntax` | Every type-only import is `import type` (or inline `type`) — also enforced by `typescript/consistent-type-imports` with `fixStyle: "inline-type-imports"` |
| `rewriteRelativeImportExtensions` | Relative imports end in `.ts`, never `.js` — also enforced by `effect/no-js-extension-imports` |
| `noUncheckedIndexedAccess` | `pickle.astNodeIds[0]` is `string \| undefined`; the guard in RESEARCH.md Pattern 2 is mandatory, not defensive style |
| `exactOptionalPropertyTypes` | `line?: number` and `line: number \| undefined` are different types. `LoadFeatureError`'s constructor arg uses `line?: number`; the field is `readonly line: number \| undefined` (per D2's verified shape) |
| `noFallthroughCasesInSwitch` | A `switch` over `LoadFeatureErrorReason` needs every case terminated |
| `types: []` | `node:fs` does not resolve until `packages/gherkin/tsconfig.json` opts in with `"types": ["node"]` |

### Lint rules that change the code you would otherwise write

**Source:** `.oxlintrc.json` lines 15–38
**Apply to:** all new source and test files

```json
  "rules": {
    "eqeqeq": "error",
    "import/no-cycle": "error",
    "import/no-duplicates": ["error", { "preferInline": true }],
    "typescript/consistent-type-imports": ["error", { "fixStyle": "inline-type-imports" }],
    "typescript/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "unicorn/prefer-node-protocol": "error",
    "vitest/no-focused-tests": "error",
    "vitest/no-identical-title": "error",
    "effect/no-import-from-barrel-package": ["error", { ... "checkRelativeIndexImports": true }],
    "effect/no-js-extension-imports": "error",
```

> **⚠️ Direct conflict with RESEARCH.md P6.** P6 says "Loose `==` covers it" for
> `doc.feature == null`. **`eqeqeq` is `"error"` here** — `== null` will not lint. Write
> `doc.feature === undefined` or `if (!doc.feature)`. (P6's own recommendation is `=== undefined`;
> the parenthetical about loose `==` is the trap.)

> **`import/no-cycle: "error"` + `pnpm circular` (madge)** — the nine `src/` modules must form a
> DAG. `Errors.ts` and `Model.ts` are leaves (import nothing local); `Validate.ts` and
> `Correlate.ts` import from them; `loadFeature.ts` imports everything; `index.ts` imports
> `loadFeature.ts`. **No module may import `./index.ts`** (that is both a cycle and a
> `no-import-from-barrel-package` violation).

### Module doc-comment header

**Source:** `packages/gherkin/src/index.ts` lines 1–8; `tools/oxlint/effect/index.ts` lines 1–9
**Apply to:** each new `src/*.ts` module

Both existing top-level modules open with a `/** ... */` block that states the module's role
*and* the reasoning behind a non-obvious choice. `tools/oxlint/effect/index.ts` lines 1–9 is the
stronger example — it documents a deliberate *deviation* and why. `Source.ts` (the one `node:fs`
import), `Validate.ts` (why it is a separate pass from `Correlate.ts`), and `Errors.ts` (why
plain `Error` and not `Data.TaggedError`, per ADR-EC-015) each deserve this treatment.

### Gate-script discipline

**Source:** `scripts/verify-oxlint-plugin.sh` lines 7–14; `scripts/verify-tsgo-gate.sh` lines 10–17
**Apply to:** any new `verify:*` script

Both scripts carry a `METHOD NOTE (do not weaken this)` explaining the failure mode where the
gate passes vacuously, then prove the gate by **exit code on a deliberately-broken probe**,
never by grepping output. STATE.md 01-02 records that a grep-based `verify-tsgo-gate.sh` was
built, passed, and proven vacuous by mutation testing. Mutation-test any new gate before
claiming it works.

---

## No Analog Found

Files with no close match in the codebase — the planner should use RESEARCH.md's verified
excerpts instead.

| File | Role | Data Flow | Reason | Use instead |
|------|------|-----------|--------|-------------|
| `src/Errors.ts` | model (error class) | transform | **No `Error` subclass, `throw`, or `try/catch` exists anywhere in the repo.** Zero prior art for error typing, message formatting, or the truncation policy | RESEARCH.md **D2** — the class shape was compiled against this repo's exact tsconfig and passed `dprint check` + `oxlint` this session. Copy it verbatim |
| `src/Model.ts` | model (types) | pure data | No domain-type module exists; the two `src/index.ts` files export a single `const` each | RESEARCH.md Pattern 2 (`AstStepInfo`, `StepOwner`) + the "Code Examples" `ParsedStep` shape. Style from `tools/oxlint/effect/test/utils.ts` lines 3–13 (`export interface`, `Array<T>` not `T[]`) |
| `test/fixtures/*.feature` | fixture data | file-I/O | **No `.feature` file exists in the repo** (verified: `verify-traceability.sh` §4 SKIPs with "no `.feature` tags yet") | RESEARCH.md "The Fixture Table" — one file per row, **named after the reason it triggers**. Heed P3: F9 must omit the trailing pipe from **both** the header and the body row |
| `src/loadFeature.ts` (composition) | orchestrator | request-response | No multi-module pipeline exists to copy; `tools/oxlint/effect/index.ts` is composition but only of a static object | RESEARCH.md **D1** (the two-line wrapper) + Pattern 1 (one `IdGenerator.uuid()` shared by `AstBuilder` and `compile`) |
| `test/loadFeature.test.ts` (`?raw` half) | test | file-I/O | No test in the repo reads a file or uses a Vite `?raw` import | RESEARCH.md D1's verified paragraph: `?raw` and `readFileSync(new URL(..., import.meta.url), "utf8")` produced byte-identical strings under vitest 4.1.11 with **no config file**. `?raw` needs a `vite/client` type reference or a local `declare module` — no precedent; the planner must decide |

**Also flagged for the planner (not a pattern gap, a correctness trap):** `packages/vitest/src/index.ts`
line 13 reads `export const gherkinPackageName: Gherkin.PackageName = Gherkin.packageName`.
Removing `packageName`/`PackageName` from the gherkin barrel breaks `pnpm build` in the `types`
CI job. Keep both exports, or amend `packages/vitest/src/index.ts` in the same commit.

---

## Metadata

**Analog search scope:** `packages/gherkin/`, `packages/vitest/`, `tools/oxlint/effect/`,
`scripts/`, `spec/`, `.github/workflows/`, repo-root config files

**Files scanned:** 24 read in full (2 source modules, 3 test files, 4 package/tsconfig manifests,
3 gate/verify scripts, 1 CI workflow, 5 root config files, 6 spec/planning docs)

**Codebase reality check:** this repo is Phase-1-complete scaffolding. There are exactly **two**
non-placeholder TypeScript modules in `packages/*` (both are placeholders that say so), and all
**three** existing test files live in `tools/oxlint/effect/test/` (vendored from Effect-TS).
Most Phase 2 "analogs" are therefore *convention* analogs — style, imports, config shape, gate
discipline — not *logic* analogs. The logic patterns come from RESEARCH.md's verified excerpts,
which were compiled and linted against this exact toolchain.

**Pattern extraction date:** 2026-08-28
